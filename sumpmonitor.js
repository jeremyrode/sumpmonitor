#!/usr/bin/node
'use strict';

require('dotenv').config(); //Load Env from file
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const fs = require('fs');
const LCD = require('raspberrypi-liquid-crystal');
const ADS1115 = require('ads1115');
const lcd = new LCD( 1, 0x27, 20, 4 );
var ip = require("ip");

const DATA_LOG_FILE = '/home/jprode/SumpData.csv';
const ERR_LOG_FILE = '/home/jprode/SumpErrorLog.txt';
const MEASUREMENT_INTERVAL = 30;
const WRITE_TO_GOOGLE_INTERVAL = 2;
const DATA_CAPTURE_INTERVAL = 100;

const dayFraction = 86400000; // Milliseconds in a Day
const dateOffset = new Date(1899,11,30) - 3600000;  // Spreadsheet Epoc minus an hour

const logfile = fs.createWriteStream(ERR_LOG_FILE, {flags:'a'});
const datafile = fs.createWriteStream(DATA_LOG_FILE, {flags:'a'});

const GoogleAuth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
});
let auth = [];
auth.expiryDate = 0;

lcd.beginSync();
lcd.clearSync();
lcd.printLineSync(3, ip.address());

async function AppendSpreadSheet(measurmentArray) {
   if (auth.expiryDate < Date.now()) {
    logWithTime('Credentials Expired, getting new ones');
    auth = await GoogleAuth.getClient();
  }
  sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
        values: measurmentArray,
      },
    auth: auth
  }, (err, result) => {
    if (err) {
        logWithTime('Append Threw: ' + err);
    } else if (!result.statusText === 'OK') {
        logWithTime('Google Says Not OK: ' + result);
    }
  });
}

ADS1115.open(0, 0x48).then(async (ads1115) => {
  let measurmentArray = [];
  let mesaurementCount = 0;
  let ave_level = await ads1115.measure('0+GND');
  let  ave_current = await ads1115.measure('1+GND');
  ads1115.gain = 1;
  while (true) {
    let cur_level = await ads1115.measure('0+GND');  // DATA_CAPTURE_INTERVAL * ();
    let cur_current = await ads1115.measure('1+GND');
    ave_level = cur_level / DATA_CAPTURE_INTERVAL + ave_level * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    ave_current = cur_current / DATA_CAPTURE_INTERVAL + ave_current * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    const curDate = new Date();
    const strcurData = curDate.toString();
    if (mesaurementCount >= DATA_CAPTURE_INTERVAL) {
      measurmentArray.push([(curDate - dateOffset) / dayFraction, ave_level, ave_current]);
      datafile.write(curDate.valueOf() + ',' + ave_level + ',' + ave_current + '\n');
      mesaurementCount = 0;
      if (measurmentArray.length >= WRITE_TO_GOOGLE_INTERVAL) {
          AppendSpreadSheet(measurmentArray);
          measurmentArray = [];
      }   
    }
    lcd.printLineSync(0, strcurData.slice(0,15));
    lcd.printLineSync(1, strcurData.slice(16,24));
    lcd.printLineSync(2, `${Math.round(ave_level)} ${Math.round(ave_current)}`);
    mesaurementCount += 1;
  }
})


//log function
function logWithTime(errmsg) {
    const curDate = new Date();
    const dateStr = curDate.toString();
    const message = dateStr.slice(0,dateStr.length-33) + ' ' + errmsg; //Prepend Time to message
    console.log(message);
    logfile.write(message + '\n')
  }