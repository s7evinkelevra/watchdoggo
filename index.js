const puppeteer = require('puppeteer');
const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises
const crypto = require('crypto');
const URL = require('url');
const glob = require('glob');

const urlList = require('./config/urlList');

function generateChecksum(str, algorithm, encoding) {
  return crypto
    .createHash(algorithm || 'md5')
    .update(str, 'utf8')
    .digest(encoding || 'hex');
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// anonymous arrow function 
const screenshot = async (url, delaySeconds, screenshotPath) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.setViewport({
    width:1920,
    height:2080,
    deviceScaleFactor: 1
  });
  await page.goto(url);
  await timeout(delaySeconds*1000);
  await page.screenshot({ path: screenshotPath });

  return browser.close();
};

/* const file = fs.readFileSync('./yeee.png');

const checksum1 = generateChecksum(file);


console.log(checksum1); */
/* 
screenshot("https://luedemann2.de/",5,"1.png");
screenshot("https://luedemann2.de/",5,"2.png");
screenshot("https://luedemann2.de/",5,"3.png");
 */


if (!fs.existsSync("./screenshots/")) {
  fs.mkdirSync("./screenshots/");
}

(async () => {

  const oldFiles = []
  _.forEach(urlList, async (url) => {
    const oldFiles = await fsPromises.readFile(url);  
  })


  // create new screenshots
  await Promise.all(_.map(urlList, (url) => {
    const filePath = "./screenshots/" + URL.parse(url).hostname + "_" + (+new Date()) + ".png";
    return screenshot(url,3, filePath);
  }))

  //

  




})();
