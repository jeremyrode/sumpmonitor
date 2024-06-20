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
const WRITE_TO_GOOGLE_INTERVAL = 2;  //How many datapoints to capture between Google API Calls
const DATA_CAPTURE_INTERVAL = 100; //How many ADC samples averaged into a datapoint (10 ~= 3s)
const ZERO_LEVEL_CODE = 3084.327283; //Code at Zero water level, Might be altitude/temp dependent
const DEPTH_SLOPE = 148.93; //Codes per inch, prob temp dependent

const dayFraction = 86400000; // Milliseconds in a Day
const dateOffset = new Date(1899,11,30) - 3600000;  // Spreadsheet Epoc minus an hour

const logfile = fs.createWriteStream(ERR_LOG_FILE, {flags:'a'});
const datafile = fs.createWriteStream(DATA_LOG_FILE, {flags:'a'});

const GoogleAuth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
});
let auth = [];
auth.expiryDate = 0;

let measurmentArray = [];

lcd.beginSync();
lcd.clearSync();
printIPAddress();
setInterval(printIPAddress, 1000000); //Update IP
setInterval(AppendSpreadSheet, 100000); //Send data to Google

function printIPAddress() {
  lcd.printLineSync(3, ip.address());
}

async function AppendSpreadSheet() {
   if (auth.expiryDate < Date.now()) {
    logWithTime('Getting New Google Credentials');
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
    } else {
      measurmentArray = []; //If sucess clear out stored measurments
    }
  });
}

ADS1115.open(0, 0x48).then(async (ads1115) => {
  let mesaurementCount = 0;
  ads1115.gain = 1;
  let strcurDate_old = ' ';
  let ave_level = await ads1115.measure('0+GND');
  let ave_current = 0;
  let current_amps = 0;
  logWithTime('New Session');
  while (true) {
    let cur_level = await ads1115.measure('0+3'); //This never gets near zero
    let cur_current = await ads1115.measure('2+3'); //This can go slightly below zero
    if (cur_current > 32768) { // 2's compliment crosses near zero sometimes
      cur_current = (cur_current - 65536);
    }
    ave_level = cur_level / DATA_CAPTURE_INTERVAL + ave_level * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    let depth_inches = (ave_level - ZERO_LEVEL_CODE) / DEPTH_SLOPE; //Seems to be linear
    ave_current = cur_current / DATA_CAPTURE_INTERVAL + ave_current * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    if (ave_current > 180) {
      current_amps = 0.00391216*(ave_current - 0.4) + 5.15725; // Linear at high current
    } else {
      current_amps = 6.14e-2*(ave_current - 0.4) - 1.6e-4*ave_current*ave_current; // Not linear at low current
    }
    const curDate = new Date();
    const strcurDate = curDate.toString();
    if (mesaurementCount >= DATA_CAPTURE_INTERVAL) { //Take a datapoint 
      console.log('Current: ' + ave_current.toFixed(3)) //Testing zero point for current
      measurmentArray.push([(curDate - dateOffset) / dayFraction, depth_inches.toFixed(3), current_amps.toFixed(3)]);
      datafile.write(curDate.valueOf() + ',' + depth_inches.toFixed(3) + ',' + current_amps.toFixed(3) + '\n');
      mesaurementCount = 0;
    }
    if ( strcurDate.slice(0,15) != strcurDate_old.slice(0,15) ) { //Only print if it changes
      lcd.printLineSync(0, strcurDate.slice(0,15));
    }
    if ( strcurDate.slice(16,24) != strcurDate_old.slice(16,24) ) { //Only print if it changes
      lcd.printLineSync(1, strcurDate.slice(16,24));
    }
    lcd.printLineSync(2, depth_inches.toFixed(2).toString().padStart(6) + current_amps.toFixed(2).toString().padStart(6));
    mesaurementCount += 1;
    strcurDate_old = strcurDate;
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