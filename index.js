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
  await timeout(5000);
  await page.screenshot({ path: screenshotPath });

  return browser.close();
};

if (!fs.existsSync("./screenshots/")) {
  fs.mkdirSync("./screenshots/");
}


(async () => {
  const adapter = new FileSync('db.json');
  const db = low(adapter);

  db.defaults({checksums: [] }).write();

  // generate all promises from the url list
  // async keyword turns return value into a promise, even if it resolves instantly
  const screenshotPromises = _.map(urlList, async (url) => {
    const hostname = URL.parse(url).hostname;
    await screenshot(url, "./screenshots/" + hostname + ".png");
    const screenshotFile = await fsPromises.readFile("./screenshots/" + hostname + ".png");
    return {hostname,checksum:generateChecksum(screenshotFile),createdAt: +new Date()};
  });
  
  // Promise.all collects a bunch of promises into one
  // wait for all promises to resolve, if any one fails, the whole thing fails
  const results = await Promise.all(screenshotPromises);

  // saving the results to the db
  db.get("checksums").push(...results).write();

  // check if last 5 checksums are equal
  const changes = _.map(urlList, (url) => {
    const hostname = URL.parse(url).hostname;
    const checksums = db.get('checksums')
      .filter({hostname})
      .sortBy((o) => (-o.createdAt))
      .take(5)
      .map("checksum")
      .value();
    console.log(hostname);
    console.log(checksums);
    return {hostname, changed:!_.every(checksums, (o) => (o===checksums[0]))}
  })

  // print that shit
  changes.forEach((site) => {
    console.log(site.hostname);
    site.changed ? console.log("dayum") : console.log("all good");
  })

})();
