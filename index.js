const puppeteer = require('puppeteer');
const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises
const crypto = require('crypto');
const URL = require('url');
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const {urlList, reportEmail} = require('./config.js');

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
  await timeout(3000);
  await page.screenshot({ path: screenshotPath });

  return browser.close();
};

const fakeScreenshot = async (url, screenshotPath, fakeMode) => {
  switch(fakeMode){
    case "fixedDifferent":
      return fsPromises.writeFile(screenshotPath, url + "i change the hash fuck you");
    case "randomDifferent":
      return fsPromises.writeFile(screenshotPath, url + Math.random().toFixed(8).toString());
    case "fixed":
    default:
      return fsPromises.writeFile(screenshotPath, url);
  }
}

if (!fs.existsSync("./screenshots/")) {
  fs.mkdirSync("./screenshots/");
}

const asyncChecksumFromFile = async (path) => {
  const screenshotFile = await fsPromises.readFile(path);
  const checksum = generateChecksum(screenshotFile)
  return checksum;
}

const mapURLtoChecksumPromise = async (url) => {
  const hostname = URL.parse(url).hostname;
  const screenshotPath = "./screenshots/" + hostname + ".png";

  await screenshot(url, screenshotPath);
  const checksum = await asyncChecksumFromFile(screenshotPath);

  return { url, hostname, checksum, createdAt: (+new Date()) }
}

(async () => {

  // init db
  const adapter = new FileSync('db.json');
  const db = low(adapter);

  db.defaults({checksums: [] }).write();

  // control if we actually want to wait for screenshot generation....
  if(false){
  // generate all promises from the url list
  // async keyword turns return value into a promise, even if it resolves instantly
  const screenshotPromises = _.map(urlList, mapURLtoChecksumPromise);

  // Promise.all collects a bunch of promises into one and spits out the results of all promises as an array
  // wait for all promises to resolve, if any one fails, the whole thing fails
  const results = await Promise.all(screenshotPromises);

  // saving the results to the db
  db.get("checksums").push(...results).write();
  }



  // check if last 5 checksums are equal
  const changes = _.map(urlList, (url) => {
    const hostname = URL.parse(url).hostname;
    const checksums = db.get('checksums')
      .filter({url})
      .sortBy((o) => (-o.createdAt))
      .take(5)
      .map("checksum")
      .value();
    console.log(hostname);
    console.log(checksums);
    const changed = !_.every(checksums, (o) => (o === checksums[0]))
    return {url,hostname,changed,lastCheckSum}
  })

  // some questionable chaining (and spelling of questionable)
  const changedURLs = _.chain(changes)
    .filter("changed")
    .map("url")
    .value();

  

  console.log(changedURLs);
  
  

})();
