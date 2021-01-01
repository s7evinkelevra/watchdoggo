const puppeteer = require('puppeteer');
const _ = require('lodash');
const fs = require('fs');
const fsPromises = require('fs').promises
const crypto = require('crypto');
const URL = require('url');
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const sgMail = require('@sendgrid/mail');
const schedule = require('node-schedule');
const Promise = require("bluebird");

if(process.env.NODE_ENV !== "production"){
  require("dotenv").config();
}

// config stuff
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const urlList = require('./urlList.js');

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
    height:1024,
    deviceScaleFactor: 1
  });
  page.setDefaultNavigationTimeout(50000);
  await page.goto(url, {waitUntil:'networkidle2'});
  // give the animations a chance to play out
  await timeout(3000);
  await page.screenshot({ path: screenshotPath });

  return browser.close();
};

const fakeScreenshot = async (url, screenshotPath, fakeMode = "fixed") => {
  switch(fakeMode){
    case "fixedDifferent":
    case "fd":
      return fsPromises.writeFile(screenshotPath, url + "i change the hash fuck you");
    case "randomDifferent":
    case "rd":
      return fsPromises.writeFile(screenshotPath, url + Math.random().toFixed(8).toString());
    case "fixed":
    case "f":
    default:
      return fsPromises.writeFile(screenshotPath, url);
  }
}

const asyncChecksumFromFile = async (path) => {
  const screenshotFile = await fsPromises.readFile(path);
  const checksum = generateChecksum(screenshotFile)
  return checksum;
}

const checksumFromUrl = async (url) => {
  const hostname = URL.parse(url).hostname;
  const screenshotPath = "./screenshots/" + hostname + ".png";

  if (process.env.FAKE_SCREENSHOT === "enabled") {
    await fakeScreenshot(url, screenshotPath, process.env.FAKE_SCREENSHOT_MODE);
  } else {
    await screenshot(url, screenshotPath)
  }
  const checksum = await asyncChecksumFromFile(screenshotPath);

  return { url, hostname, checksum, createdAt: (+new Date()) }
}



const main = async () => {

  // check if screenshot dir exists and create it if not.
  if (!fs.existsSync("./screenshots/")) {
    fs.mkdirSync("./screenshots/");
  }

  // init db
  const adapter = new FileSync('db.json');
  const db = low(adapter);

  // define the "schema"
  db.defaults({checksums: [] }).write();

  // so, how to create a bunch of promises but run the sequentially?
  // create and await them one after another, duh. Previously, i created them all and awaited them.
  // And how, you might ask? Like this:
  /* 
  const mapSeries = async (iterable, action) => {
    for (const x of iterable) {
      await action(x)
    }
  }

  mapSeries(myArray, myPromise)
  */
  // and that is exactly what mapSeries of the bluebird package does!
  // Reasoning: i guess normally that is the way to go, have them execute in parallel.
  // but here i need a managable cpu usage (not running chromium once is already enough for the poor pi :/)
  // and also make sure the execution of any single promise doesnt take too long
  // (i.e.) if you resolve 1000 promises in parallel, the bulk is faster but each one might take longer if they have to share limited cpu resources
  // returns a list of objects, as seen in "checksumFromUrl"
  const results = await Promise.mapSeries(urlList,checksumFromUrl)

  // but you're on a powerful machine and just don't care about CPU and network usage?
  // well, try this:
  // generate all promises from the url list
  /* const screenshotPromises = _.map(urlList, checksumFromUrl); */

  // Promise.all collects a bunch of promises into one and spits out the results of all promises as an array
  // wait for all promises to resolve, if any one fails, the whole thing fails
  /* const results = await Promise.all(screenshotPromises); */

  // saving the results to the db
  db.get("checksums").push(...results).write();



  // check if last 2 checksums are equal in a unnecessarily verbose way
  const changes = _.map(urlList, (url) => {
    const hostname = URL.parse(url).hostname;
    // TODO(Jan): check if db.get is expensive and thus should be done only once with consecutive filtering
    const checksums = db.get('checksums')
      .filter({ url })
      .sortBy((o) => (-o.createdAt))
      .take(2)
      .map("checksum")
      .value();
    console.log(hostname);
    console.log(checksums);

    /* const changed = !_.every(checksums, (o) => (o === checksums[0])) */
    if (checksums.length < 1 || checksums.length > 2) {
      // FIXME(Jan): handle errors
      console.log("haha you thought i would handle this case lul!");
      throw new Error("No checksums found for URL " + url);
    }
    // if only 1 checksum is present, no change has occured
    const changed = checksums.length === 2 ? !(checksums[0] === checksums[1]) : false;
    return { url, hostname, changed, lastCheckSum: checksums[0] }
  })

  // some questionable chaining (and spelling of questionable)
  const flaggedURLs = _.chain(changes)
    .filter("changed")
    .map("url")
    .value();


  console.log(flaggedURLs);
  
    
  // send notification if there are urls with changed checksums of the screenshot
  if(flaggedURLs.length > 0) {

    const emailTemplate = `
    <h2>Diese URLs sind gefugt:</h2>
    <ul>
      ${flaggedURLs.map((url) => "<ul>" + url + "</ul>")}
    </ul>
  `

    // notify people of this
    const msg = {
      to: process.env.REPORT_EMAIL,
      from: 'jan@luedemann2.de', // Use the email address or domain you verified above
      subject: 'Website(s) done goofed.',
      text: 'und solche sachen',
      html: emailTemplate,
    };

    try {
      await sgMail.send(msg);
    } catch (error) {
      console.error(error);

      if (error.response) {
        console.error(error.response.body)
      }
    }
  }
  
};

//const job = schedule.scheduleJob(process.env.CRON_SCHEDULE_EXPRESSION, () => {
//  console.log("running job....");
//  main();
//})

main();
