const puppeteer = require('puppeteer');
const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises
const crypto = require('crypto');
const URL = require('url');

const urlList = require('./config/urlList');

function generateChecksum(str, algorithm, encoding) {
  return crypto
    .createHash(algorithm || 'md5')
    .update(str, 'utf8')
    .digest(encoding || 'hex');
}

// promisify setTimeout
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const screenshot = async (url, screenshotPath) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.setViewport({
    width:1920,
    height:2080,
    deviceScaleFactor: 1
  });
  await page.goto(url, {waitUntil:'networkidle2'});
  // give the animations a chance to play out
  await timeout(5000);
  await page.screenshot({ path: screenshotPath });

  return browser.close();
};

if (!fs.existsSync("./screenshots/")) {
  fs.mkdirSync("./screenshots/");
}


(async () => {

  // generate all promises from the url list
  // async keyword turns return value into a promise, even if it resolves instantly
  const screenshotPromises = _.map(urlList, async (url) => {
    const hostname = URL.parse(url).hostname;
    await screenshot(url, "./screenshots/" + hostname + ".png");
    const screenshotFile = await fsPromises.readFile("./screenshots/" + hostname + ".png");
    return {hostname,checksum:generateChecksum(screenshotFile)};
  });
  
  // Promise.all collects a bunch of promises into one
  // wait for all promises to resolve, if any one fails, the whole thing fails
  const result = await Promise.all(screenshotPromises);

  console.log(result);



})();
