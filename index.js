class File {
  static singleUploadApiUrl =
    "https://9qg7r5m84e.execute-api.us-east-1.amazonaws.com/dev/single-upload";
  static multipartInitiateApiUrl =
    "https://u3rl4do60b.execute-api.us-east-1.amazonaws.com/dev/initiate-multipart";
  static multipartUploadApiUrl =
    "https://6ctfudi0sg.execute-api.us-east-1.amazonaws.com/dev/multipart-upload";
  static completeUploadApiUrl =
    "https://yfpe8cha8i.execute-api.us-east-1.amazonaws.com/dev/complete-upload";

  constructor(file, name, size, type) {
    this.file = file;
    this.name = name;
    this.size = size;
    this.type = type;
    this.keyname = generateKey(name);
    this.filesizeinMB = Math.ceil(size / (1024 * 1024));
  }
}

const printLog = (logtext) => {
  var d = new Date();
  datetext = d.toTimeString();
  datetext1 = datetext.split(" ")[0];
  var logtext1 = datetext1 + " : " + logtext;
  console.log(logtext1);
};

const generateKey = (originalname) => {
  const d = new Date();
  let text = d.toISOString().substring(0, 16);
  let keyname = text + "/" + originalname;
  return keyname;
};

const imageForm = document.querySelector("#imageForm");
const imageInput = document.querySelector("#imageInput");
imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileinput.files[0];

  const fileInfo = new File(file, file.name, file.size, file.type);
  const CHUNK_SIZE = document.getElementById("chunk-select").value;
  const maxChunkSize = CHUNK_SIZE * 1024 * 1024;
  const completeParts = [];
  printLog("Receivd upload request for file : " + fileInfo.name);
  printLog("Chunk size selected :" + CHUNK_SIZE + " MB.");

  const initiateMultipartBody = {
    fileName: fileInfo.keyname,
  };

  printLog("Unique key for your file :" + fileInfo.keyname);

  if (fileInfo.filesizeinMB > CHUNK_SIZE) {
    const parts = Math.ceil(fileInfo.filesizeinMB / CHUNK_SIZE);
    printLog(
      "Dividing " +
        fileInfo.filesizeinMB +
        " MB file in " +
        parts +
        "parts of " +
        CHUNK_SIZE +
        " MB each."
    );
    async function getUploadId() {
      try {
        const response = await fetch(File.multipartInitiateApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(initiateMultipartBody),
        });

        const data = await response.json();
        printLog("Recieved UploadId :" + data.uploadId);
        return data.uploadId; // Return the uploadId
      } catch (error) {
        console.error("Error fetching data:", error);
        throw error; // Rethrow the error to handle it at the caller's level
      }
    }
    printLog("Requested UploadId for multi-part operation");
    const uploadId = await getUploadId();

    const multipartBody = {
      fileName: fileInfo.keyname,
      uploadId,
      parts,
    };

    printLog("Initiated Multi-part upload using UploadId :" + uploadId);

    fetch(File.multipartUploadApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(multipartBody),
    })
      .then((response) => response.json())
      .then((dataObject) => {
        // Convert the received JSON object back to a Map
        const presignedUrlsMap = new Map(Object.entries(dataObject));
        printLog("Recieved Map of Presigned-url corresponding to part number");
        console.log(presignedUrlsMap);

        async function uploadFileInChunks() {
          // Read the file and split it into chunks of 5MB each
          const fileReader = new FileReader();
          let offset = 0;
          let partNumber = 1;
          const uploadPromises = []; // Array to hold all upload promises

          while (offset < fileInfo.size) {
            const chunk = file.slice(offset, offset + maxChunkSize);
            const buffer = await chunk.arrayBuffer();
            const data = new Uint8Array(buffer);

            // Upload the chunk using the corresponding presigned URL from the Map
            const presignedUrl = presignedUrlsMap.get(partNumber.toString());
            if (presignedUrl) {
              uploadPromises.push(uploadChunk(partNumber, data, presignedUrl));
            } else {
              console.log("Presigned URL not found for " + partNumber);
            }
            offset += maxChunkSize;
            partNumber += 1;
          }

          // Wait for all the upload promises to complete
          await Promise.all(uploadPromises);
        }

        async function uploadChunk(partNumber, data, presignedUrl) {
          try {
            // Use Fetch to perform the PUT request with the presigned URL
            const response = await fetch(presignedUrl, {
              method: "PUT",
              body: data,
            });
            const etag = response.headers.get("ETag");

            completeParts.push({ PartNumber: partNumber, ETag: etag });
            printLog(
              `Chunk ${partNumber} uploaded successfully using ${presignedUrl}`
            );
          } catch (error) {
            printLog(`Error uploading chunk ${partNumber}:`, error);
          }
        }

        async function multipartUpload() {
          try {
            printLog("Started Uploading files in chunk");
            await uploadFileInChunks();
            printLog("Successfully uploaded file in chunks");

            function sortCompletePartsByPartNumber(completeParts) {
              return completeParts.sort((a, b) => a.PartNumber - b.PartNumber);
            }

            const sortedCompleteParts = await sortCompletePartsByPartNumber(
              completeParts
            );

            const completedataBody = {
              fileName: fileInfo.keyname,
              uploadId,
              sortedCompleteParts,
            };
            printLog("Calling Complete Upload Funciton");
            await fetch(File.completeUploadApiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(completedataBody),
            })
              .then((response) => response.json())
              .then((data) => {
                const message = data.message;
                printLog(message);
              });
          } catch (error) {
            console.error("Error uploading the file:", error);
          }
        }
        multipartUpload();
      })
      .catch((error) => {
        console.log("Error:", error);
      });
  } else {
    // get secure url from our server
    const singledataToSend = {
      fileName: fileInfo.keyname,
    };
    printLog("Sending request to lambda to upload single file");
    await fetch(File.singleUploadApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(singledataToSend),
    })
      .then((response) => response.json()) // Parse the response JSON
      .then((data) => {
        // Access the response data here
        const presignedurl = data.url;
        printLog("Url from Lambda function:" + presignedurl);

        printLog("Request recieved from backend server");

        printLog(
          "Sending Upload file Request to S3 using upload url : " + presignedurl
        );

        // post the image direclty to the s3 bucket
        async function uploadfile(presignedurl) {
          const { url } = await fetch(presignedurl, {
            method: "PUT",
            headers: {
              "Content-Type": "multipart/form-data",
            },
            body: file,
          });
          const fileurl = url.split("?")[0];
          printLog("Successfull Uploaded the file");
          printLog("fileurl : " + fileurl);
        }
        uploadfile(presignedurl);
      })
      .catch((error) => {
        console.error("Error in fetching data:", error);
      });
  }
});
