const imageForm = document.querySelector("#imageForm");
const imageInput = document.querySelector("#imageInput");

const printLog = (logtext) => {
  var d = new Date();
  datetext = d.toTimeString();
  datetext1 = datetext.split(" ")[0];
  var logtext1 = datetext1 + " : " + logtext;
  console.log(logtext1);
};

imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileinput.files[0];
  const originalname = file.name;
  const d = new Date();
  let text = d.toISOString().substring(0, 16);
  let fileName = text + "/" + originalname;
  const fileType = file.type;
  const fileSize = file.size;
  const CHUNK_SIZE = document.getElementById("chunk-select").value;
  const maxChunkSize = CHUNK_SIZE * 1024 * 1024;
  const BucketName = "publicdummybucketofmine127809";
  const filesizeinMB = Math.ceil(fileSize / (1024 * 1024));

  const completeParts = [];
  printLog("Receivd upload request for file : " + originalname);
  printLog("Chunk size selected :" + CHUNK_SIZE + " MB.");

  // printLog(fileSize / (1024 * 1024));

  const initiateData = {
    BucketName,
    fileName,
  };
  printLog("Unique key for your file :" + fileName);

  if (filesizeinMB > CHUNK_SIZE) {
    const parts = Math.ceil(filesizeinMB / CHUNK_SIZE);
    printLog(
      "Dividing " +
        filesizeinMB +
        " MB file in " +
        parts +
        "parts of " +
        CHUNK_SIZE +
        " MB each."
    );
    async function getUploadId() {
      try {
        const response = await fetch(
          "https://u3rl4do60b.execute-api.us-east-1.amazonaws.com/dev/initiate-multipart",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(initiateData),
          }
        );

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

    const dataToSend = {
      fileName,
      BucketName,
      uploadId,
      parts,
    };
    printLog("Initiated Multi-part upload using UploadId :" + uploadId);
    fetch(
      "https://6ctfudi0sg.execute-api.us-east-1.amazonaws.com/dev/multipart-upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      }
    )
      .then((response) => response.json())
      .then((dataObject) => {
        // Convert the received JSON object back to a Map
        const presignedUrlsMap = new Map(Object.entries(dataObject));
        printLog("Recieved Map of Presigned-url corresponding to part number");
        console.log(presignedUrlsMap);

        async function uploadFileInChunks(file) {
          // Read the file and split it into chunks of 5MB each
          const fileReader = new FileReader();
          let offset = 0;
          let partNumber = 1;
          const uploadPromises = []; // Array to hold all upload promises

          while (offset < file.size) {
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

        async function main() {
          try {
            printLog("Started Uploading files in chunk");
            await uploadFileInChunks(file);
            printLog("Successfully uploaded file in chunks");

            function sortCompletePartsByPartNumber(completeParts) {
              return completeParts.sort((a, b) => a.PartNumber - b.PartNumber);
            }

            const sortedCompleteParts = await sortCompletePartsByPartNumber(
              completeParts
            );

            const completedataToSend = {
              fileName,
              BucketName,
              uploadId,
              sortedCompleteParts,
            };
            printLog("Calling Complete Upload Funciton");
            await fetch(
              "https://yfpe8cha8i.execute-api.us-east-1.amazonaws.com/dev/complete-upload",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(completedataToSend),
              }
            )
              .then((response) => response.json())
              .then((data) => {
                const message = data.message;
                printLog(message);
              });
          } catch (error) {
            console.error("Error uploading the file:", error);
          }
        }
        main();
      })
      .catch((error) => {
        console.log("Error:", error);
      });
  } else {
    // get secure url from our server
    const singledataToSend = {
      fileName,
      BucketName,
    };
    printLog("Sending request to lambda to upload single file");
    await fetch(
      "https://9qg7r5m84e.execute-api.us-east-1.amazonaws.com/dev/single-upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(singledataToSend),
      }
    )
      .then((response) => response.json()) // Parse the response JSON
      .then((data) => {
        // Access the response data here
        console.log("Url from Lambda function:", data.url);

        printLog("Request recieved from backend server");

        printLog(
          "Sending Upload file Request to S3 using upload url : ",
          data.url
        );

        // post the image direclty to the s3 bucket
        async function uploadfile(data) {
          const { url } = await fetch(data.url, {
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
        uploadfile(data);
      })
      .catch((error) => {
        console.error("Error in fetching data:", error);
      });
  }
});
