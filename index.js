class File {
  static singleUploadApiUrl =
    "https://qzuuwe1p81.execute-api.us-east-1.amazonaws.com/dev/single-upload";
  static multipartInitiateApiUrl =
    "https://y911eszmuk.execute-api.us-east-1.amazonaws.com/dev/initiate-multipart";
  static multipartUploadApiUrl =
    "https://46eq427vrh.execute-api.us-east-1.amazonaws.com/dev/multipart-upload";
  static completeUploadApiUrl =
    "https://3ldlcfogo4.execute-api.us-east-1.amazonaws.com/dev/complete-upload";

  // static singleUploadApiUrl =
  //   "https://9qg7r5m84e.execute-api.us-east-1.amazonaws.com/dev/single-upload";
  // static multipartInitiateApiUrl =
  //   "https://u3rl4do60b.execute-api.us-east-1.amazonaws.com/dev/initiate-multipart";
  // static multipartUploadApiUrl =
  //   "https://6ctfudi0sg.execute-api.us-east-1.amazonaws.com/dev/multipart-upload";
  // static completeUploadApiUrl =
  //   "https://yfpe8cha8i.execute-api.us-east-1.amazonaws.com/dev/complete-upload";

  constructor(file, name, size, type) {
    this.file = file;
    this.name = name;
    this.size = size;
    this.type = type;
    this.keyname = generateKey(name);
    this.filesizeinMB = Math.ceil(size / (1024 * 1024));
  }
}

const logarr = [];
const printLog = (logtext) => {
  var d = new Date();
  datetext = d.toTimeString();
  datetext1 = datetext.split(" ")[0];
  var logtext1 = datetext1 + " : " + logtext;
  console.log(logtext1);
  logarr.push(logtext1);
};

const generateKey = (originalname) => {
  const d = new Date();
  let text = d.toISOString().substring(0, 25);
  let keyname = text + "/" + originalname;
  return keyname;
};

const imageForm = document.querySelector("#imageForm");
const imageInput = document.querySelector("#imageInput");

imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const total_files = fileinput.files.length;
  const files = [];
  async function delayLoop() {
    for (let index = 0; index < total_files; index++) {
      const file = fileinput.files[index];
      files.push(new File(file, file.name, file.size, file.type));
      await delay(1000);
    }
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  delayLoop();

  const CHUNK_SIZE = document.getElementById("chunk-select").value;
  const maxChunkSize = CHUNK_SIZE * 1024 * 1024;
  const maxChunksPerBatch = document.getElementById("batch-size").value;

  printLog("Chunk size selected : " + CHUNK_SIZE + " MB.");
  printLog("Max chunks per batch : " + maxChunksPerBatch);

  for (let index = 0; index < total_files; index++) {
    const initiateMultipartBody = {
      fileName: files[index].keyname,
    };
    printLog("Recievd upload request for file : " + files[index].name);
    printLog("Unique key for your file :" + files[index].keyname);

    if (files[index].filesizeinMB > CHUNK_SIZE) {
      const completeParts = [];
      const parts = Math.ceil(files[index].filesizeinMB / CHUNK_SIZE);
      printLog(
        "Dividing " +
          files[index].name +
          " of " +
          files[index].filesizeinMB +
          " MB in " +
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
          printLog(
            "Recieved UploadId for filename " +
              files[index].name +
              " : " +
              data.uploadId
          );
          return data.uploadId; // Return the uploadId
        } catch (error) {
          console.log("Error fetching data:", error);
          throw error; // Rethrow the error to handle it at the caller's level
        }
      }
      printLog(
        "Requested UploadId for multi-part operation for filename :" +
          files[index].name
      );
      const uploadId = await getUploadId();

      const multipartBody = {
        fileName: files[index].keyname,
        uploadId,
        parts,
      };

      printLog(
        "Initiated Multi-part upload using UploadId :" +
          uploadId +
          " for filename" +
          files[index].name
      );

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
          printLog(
            "Recieved Map of Presigned-url corresponding to parts of file " +
              files[index].name
          );
          console.log(presignedUrlsMap);

          async function uploadFileInChunks() {
            // Read the file and split it into chunks of 5MB each
            const fileReader = new FileReader();
            let offset = 0;
            let partNumber = 1;
            const uploadPromises = []; // Array to hold all upload promises
            let currentBatchno = 1;

            while (offset < files[index].size) {
              const chunk = files[index].file.slice(
                offset,
                offset + maxChunkSize
              );
              const buffer = await chunk.arrayBuffer();
              const data = new Uint8Array(buffer);

              // Upload the chunk using the corresponding presigned URL from the Map
              const presignedUrl = presignedUrlsMap.get(partNumber.toString());
              printLog(
                "Batch " +
                  currentBatchno +
                  " started with the process of uploading chunk " +
                  partNumber +
                  "from file " +
                  files[index].name
              );
              try {
                if (!presignedUrl) {
                  throw new Error("Presigned URL not found for " + partNumber);
                }
                printLog(
                  "Chunk " +
                    partNumber +
                    " upload request sent of file " +
                    files[index].name
                );
                uploadPromises.push(
                  uploadChunk(partNumber, data, presignedUrl)
                );
              } catch (error) {
                console.log(error);
                throw error;
              }

              offset += maxChunkSize;
              partNumber += 1;

              // If we have reached the maximum number of chunks per batch,
              // wait for the current batch to finish before starting the next one.
              if (uploadPromises.length >= maxChunksPerBatch) {
                await Promise.all(uploadPromises);
                printLog(
                  "All chunks from batch " + currentBatchno + " uploaded"
                );
                currentBatchno += 1;
                uploadPromises.length = 0; // Clear the array for the next batch
              }
            }

            // Wait for the remaining upload promises to complete
            await Promise.all(uploadPromises);
            printLog("Succesfully uploaded all Batches");
          }

          async function uploadChunk(partNumber, data, presignedUrl) {
            printLog(
              "Chunk " +
                partNumber +
                " upload request in progress of file " +
                files[index].name
            );
            try {
              // Use Fetch to perform the PUT request with the presigned URL
              const response = await fetch(presignedUrl, {
                method: "PUT",
                body: data,
              });
              const etag = response.headers.get("ETag");
              if (!etag) {
                throw new error("Etag not recieved");
              }
              completeParts.push({ PartNumber: partNumber, ETag: etag });
              printLog(
                `Chunk ${partNumber} uploaded successfully of filename ` +
                  files[index].name +
                  ` using ${presignedUrl}`
              );
            } catch (error) {
              printLog(`Error uploading chunk ${partNumber}:`, error);
              throw error;
            }
          }

          async function multipartUpload() {
            try {
              printLog(
                "Started Uploading files in chunk for file " + files[index].name
              );
              await uploadFileInChunks();
              printLog(
                "Successfully uploaded chunks for file " + files[index].name
              );

              function sortCompletePartsByPartNumber(completeParts) {
                return completeParts.sort(
                  (a, b) => a.PartNumber - b.PartNumber
                );
              }

              const sortedCompleteParts = await sortCompletePartsByPartNumber(
                completeParts
              );

              const completedataBody = {
                fileName: files[index].keyname,
                uploadId,
                sortedCompleteParts,
              };
              printLog(
                "Requested Complete Upload Funciton for file" +
                  files[index].name
              );
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
        fileName: files[index].keyname,
      };
      printLog(
        "Sending request to get pre-signed url for single file upload for filename " +
          files[index].name
      );
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

          printLog(
            "Request recieved from backend server for filename " +
              files[index].name
          );
          printLog(
            "Recived presigned url from Lambda function for filename " +
              files[index].name +
              " : " +
              presignedurl
          );

          printLog(
            "Sending Upload file Request for filename " +
              files[0].name +
              " to S3 using upload presigned url : " +
              presignedurl
          );

          // post the image direclty to the s3 bucket
          async function uploadfile(presignedurl) {
            const { url } = await fetch(presignedurl, {
              method: "PUT",
              headers: {
                "Content-Type": "multipart/form-data",
              },
              body: files[0].file,
            });
            const fileurl = url.split("?")[0];
            printLog("Successfull Uploaded the file " + files[index].name);
            printLog("fileurl : " + fileurl);
          }
          uploadfile(presignedurl);
        })
        .catch((error) => {
          console.error("Error in fetching data:", error);
        });
    }
  }
});
