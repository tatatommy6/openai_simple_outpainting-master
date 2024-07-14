const dotenv = require("dotenv").config();
const fs = require("fs");
const sharp = require("sharp");
const axios = require("axios").default;
const OpenAi = require("openai");
const readline = require("readline");
const openai = new OpenAi(process.env.OPENAI_API_KEY);

// before running this code, check the following:
// 1. source image and mask image must have same resolution
// 2. check your openai api key is in .env file and the key is valid.
// 3. check file names and folder names(src, rgba, dest) are correct.
// 4. check package.json file has all the required packages.

// change the config object according to your needs
const config = {
  srcImageName: "src.png",
  maskImageName: "mask.png",
  theNumberOfImages: 1,
  yourPrompt: "high mountain", // type your prompt here
  srcFolderPath: "./src",
  rgbaFolderPath: "./rgba",
  destFolderPath: "./dest",
};

//----------------you don't need to change anything below this line-------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function convertImageToRgba(imagePath, outputPath) {
  try {
    await sharp(imagePath).ensureAlpha().toFormat("png").toFile(outputPath);
    console.log(`${imagePath} converted to RGBA`);
  } catch (err) {
    console.error(`Error converting ${imagePath} to RGBA: ${err}`);
    throw err;
  }
}

async function downloadAndSaveImage(url, filename) {
  try {
    const response = await axios({ url, responseType: "stream" });
    const stream = response.data.pipe(fs.createWriteStream(filename));
    return new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  } catch (err) {
    console.error(`Error downloading ${url}: ${err}`);
    throw err;
  }
}

function checkAndCreateFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
    console.log(`${folderPath} folder created`);
  }
}

async function processImagesWithOpenAi(srcImage, maskImage, prompt, n) {
  console.log(
    "Sending images to OpenAi and waiting for response...(it will take a few seconds)"
  );
  try {
    const response = await openai.images.edit({
      model: "dall-e-2",
      n,
      image: fs.createReadStream(srcImage),
      mask: fs.createReadStream(maskImage),
      prompt,
    });
    return response.data;
  } catch (err) {
    console.error(`Error sending images to OpenAI: ${err}`);
    throw err;
  }
}

class BasicValidation {
  async isImagesHaveSameResolution() {
    const srcImage = sharp(`${config.srcFolderPath}/${config.srcImageName}`);
    const maskImage = sharp(`${config.srcFolderPath}/${config.maskImageName}`);
    const srcMetadata = await srcImage.metadata();
    const maskMetadata = await maskImage.metadata();
    if (
      srcMetadata.width !== maskMetadata.width ||
      srcMetadata.height !== maskMetadata.height
    ) {
      throw new Error(
        "Source image and mask image do not have the same resolution"
      );
    }
  }

  isEnv() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not found in .env file");
    }
  }

  isImagesExist() {
    if (
      !fs.existsSync(`${config.srcFolderPath}/${config.srcImageName}`) ||
      !fs.existsSync(`${config.srcFolderPath}/${config.maskImageName}`)
    ) {
      throw new Error("Source or mask image does not exist");
    }
  }

  isRgbaFolderExist() {
    checkAndCreateFolder(config.rgbaFolderPath);
  }

  isDestFolderExist() {
    checkAndCreateFolder(config.destFolderPath);
  }
}

async function validateEnvironment() {
  const validation = new BasicValidation();
  validation.isEnv();
  validation.isImagesExist();
  await validation.isImagesHaveSameResolution();
  validation.isRgbaFolderExist();
  validation.isDestFolderExist();
}

async function resizeImage(imagePath, width, height) {
  try {
    await sharp(imagePath)
      .resize(width, height)
      .toFile(imagePath); // 기존 파일 덮어쓰기
    console.log(`Image resized to ${width}x${height}`);
  } catch (err) {
    console.error(`Error resizing image: ${err}`);
    throw err;
  }
}

//core functions
async function imageProcessing() {
  try {
    await validateEnvironment();
    console.log("Environment validated successfully.");

    const rgbaSrcImagePath = `${config.rgbaFolderPath}/_${config.srcImageName}`;
    const rgbaMaskImagePath = `${config.rgbaFolderPath}/_${config.maskImageName}`;

    await convertImageToRgba(
      `${config.srcFolderPath}/${config.srcImageName}`,
      rgbaSrcImagePath
    );
    await convertImageToRgba(
      `${config.srcFolderPath}/${config.maskImageName}`,
      rgbaMaskImagePath
    );

    const imagesData = await processImagesWithOpenAi(
      rgbaSrcImagePath,
      rgbaMaskImagePath,
      config.yourPrompt,
      config.theNumberOfImages
    );

    const outputFilename = `${config.destFolderPath}/outputimage.png`;

    for (const [idx, data] of imagesData.entries()) {
      await downloadAndSaveImage(data.url, outputFilename);
      console.log(`Image ${idx + 1} downloaded successfully!`);

      // 이미지 크기 조정 (필요 시 사용)
      await resizeImage(outputFilename, 2048, 1024);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return; // Error occurred, exit the main function
  }
}

function askUser() {
  rl.question(
    "Do you want to start processing images? (y/n): ",
    function (answer) {
      if (answer.toLowerCase() === "y") {
        imageProcessing().then(() => {
          askUser(); // ask again
        });
      } else {
        console.log("Program terminated.");
        rl.close(); // close the readline interface
      }
    }
  );
}

askUser(); // start the program
