const puppeteer = require('puppeteer');
const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises
const crypto = require('crypto');
const URL = require('url');
const glob = require('glob');
const sqlite3 = require('sqlite3').verbose();
const SQL = require('sql-template-strings');

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

if (!fs.existsSync("./db/")) {
  fs.mkdirSync("./db/");
}

const initChecksumTable = async (db) => {
  return db.run("CREATE TABLE IF NOT EXISTS checksums(id integer primary key, hostname text, checksum text)");
}

const resetChecksumTable = async (db) => {
  return db.run("DROP TABLE checksums");
}

const insertChecksum = async (db, hostname, checksum) => {
  return db.run("INSERT INTO checksums(hostname,checksum) VALUES($hostname,$checksum)", {
    $hostname:hostname,
    $checksum:checksum
  });
}


(async () => {
  // connect to db
  let db;
  try {
    db = await new sqlite3.Database('./db/hashes.db');
    console.log("established db connection");
  } catch (err) {
    console.log(err);
    throw err;
  }

  await resetChecksumTable(db);

  await initChecksumTable(db);

  await insertChecksum(db, "test", "test");

  db.all("SELECT * from checksums", (err,rows) => {
    console.log(rows);
  })

  
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
  
  // doing the db work


})();

/* let db;
try {
  db = await new sqlite3.Database('./db/hashes.db');
  console.log("established db connection");
} catch (err) {
  console.log(err);
  throw err;
}

db.close((err) => {
  if (err) console.log(err);
  console.log("closed db connection");
}) */