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
  const fileName = file.name;
  const fileType = file.type;
  const fileSize = file.size;
  const CHUNK_SIZE = 5;
  const maxChunkSize = 5 * 1024 * 1024;
  const BucketName = "publicdummybucketofmine127809";
  const filesizeinMB = Math.ceil(fileSize / (1024 * 1024));
  const parts = Math.ceil(filesizeinMB / CHUNK_SIZE);
  const completeParts = [];
  printLog("receivd upload request for file " + fileName);
  printLog("Parts " + parts);

  // printLog(fileSize / (1024 * 1024));

  const initiateData = {
    BucketName,
    fileName,
  };
  printLog(initiateData.fileName);

  if (filesizeinMB > 5) {
    try {
      const response = await fetch("http://localhost:8080/initiate-multipart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initiateData),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const { uploadId } = await response.json(); // Parse the response JSON correctly
      printLog("Upload Id Generated");
      printLog("upload_Id " + uploadId);

      const dataToSend = {
        fileName,
        BucketName,
        uploadId,
        parts,
      };

      await fetch("http://localhost:8080/multipart-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      })
        .then((response) => response.json())
        .then((dataObject) => {
          // Convert the received JSON object back to a Map
          const presignedUrlsMap = new Map(Object.entries(dataObject));
          console.log(presignedUrlsMap);
          async function uploadFileInChunks(file) {
            // Read the file and split it into chunks of 5MB each
            const fileReader = new FileReader();
            let offset = 0;
            let partNumber = 1;
            while (offset < file.size) {
              const chunk = file.slice(offset, offset + maxChunkSize);
              const buffer = await chunk.arrayBuffer();
              const data = new Uint8Array(buffer);

              // Upload the chunk using the corresponding presigned URL from the Map
              const presignedUrl = presignedUrlsMap.get(partNumber.toString());
              if (presignedUrl) {
                await uploadChunk(partNumber, data, presignedUrl);
              } else {
                printLog("presigned url not found for " + partNumber);
              }
              offset += maxChunkSize;
              partNumber += 1;
            }
          }

          async function uploadChunk(partNumber, data, presignedUrl) {
            try {
              // Use Fetch to perform the PUT request with the presigned URL
              const response = await fetch(presignedUrl, {
                method: "PUT",
                body: data,
              });
              const etag = response.headers.get("ETag");
              console.log("ETag:", etag);
              completeParts.push({ PartNumber: partNumber, ETag: etag });
              console.log(`Chunk ${partNumber} uploaded successfully`);
            } catch (error) {
              console.error(`Error uploading chunk ${partNumber}:`, error);
            }
          }

          async function main() {
            try {
              await uploadFileInChunks(file);
              console.log("Successfully uploaded file in chunks");
              const completedataToSend = {
                fileName,
                BucketName,
                uploadId,
                completeParts,
              };
              await fetch("http://localhost:8080/complete-upload", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(completedataToSend),
              });
            } catch (error) {
              console.error("Error uploading the file:", error);
            }
          }
          main();
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    } catch (error) {
      console.error("Error:", error);
    }
  } else {
    // get secure url from our server
    const singledataToSend = {
      fileName,
      BucketName,
    };
    printLog("Sending request to backend server");
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
        console.log("url from Lambda function:", data.url);

        printLog("Request recieved from backend server");

        printLog("Sending Upload file Request to S3 using upload url");
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

    // post requst to my server to store any extra data
  }
});
