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
const WRITE_TO_GOOGLE_INTERVAL = 200;  //How many datapoints to capture between Google API Calls
const DATA_CAPTURE_INTERVAL = 2; //How many ADC samples averaged into a datapoint (10 ~= 3s)
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
//Store the measurments, sent to Google in batches
let measurmentArray = [];
//Setup LCD
lcd.beginSync();
lcd.clearSync();
//We need to fill in the slow intervals
printIPAddress();
printDate();
//Interval Section
setInterval(AppendSpreadSheet, 5 * 60 * 1000); //Send data to Google
//SCREEN SECTION: Print out each line seperatly at approprite intevals
setInterval(printIPAddress, 10 * 60 * 1000); //Update IP on Screen
setInterval(printDate, 120 * 60 * 1000); //Update Date on Screen
setInterval(printTime, 5000);
setInterval(printData, 1000); //Don't start dataloggin until there is data
//SCREEN PRINT SECTION: By line
function printData() { //The interval for this is
  const lastIndex = measurmentArray.length;
  if (lastIndex > 0) {
    lcd.printLineSync(0, measurmentArray[lastIndex-1][1].slice(0,-1).padStart(6) + measurmentArray[lastIndex-1][2].slice(0,-1).padStart(6));
  }
}
function printTime() {
  const curDate = new Date();
  lcd.printLineSync(1, curDate.toString().slice(16,24));
}
function printDate() {
  const curDate = new Date();
  lcd.printLineSync(2, curDate.toString().slice(0,15));
}
function printIPAddress() {
  lcd.printLineSync(3, ip.address());
}
//Send the Data to Google Sheets, retain in memory if not sent
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
        logWithTime('Cacheing ' + measurmentArray.length + " Measurments with " + process.resourceUsage().maxRSS + ' kB RAM');
    } else if (!result.statusText === 'OK') {
        logWithTime('Google Says Not OK: ' + result);
        logWithTime('Cacheing ' + measurmentArray.length + " Measurments with " + process.resourceUsage().maxRSS + ' kB RAM');
    } else {
      measurmentArray = []; //If success clear out stored measurments
    }
  });
}
//Measurment Infinite Loop
ADS1115.open(0, 0x48).then(async (ads1115) => {
  let mesaurementCount = 0;
  ads1115.gain = 1;
  let ave_level = await ads1115.measure('0+GND');
  let ave_current = 0; //Start at zero
  let current_amps = 0;
  logWithTime('New Session');
  while (true) { //Run the ADC as fast as we can
    let cur_level = await ads1115.measure('0+3'); //This never gets near zero
    let cur_current = await ads1115.measure('2+3'); //This can go slightly below zero
    if (cur_current > 32768) { // 2's compliment crosses near zero sometimes
      cur_current = cur_current - 65536; //Take me negative
    }
    // Use a IIR to take a running average of the ADC Codes
    ave_level = cur_level / DATA_CAPTURE_INTERVAL + ave_level * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    ave_current = cur_current / DATA_CAPTURE_INTERVAL + ave_current * (DATA_CAPTURE_INTERVAL - 1) / DATA_CAPTURE_INTERVAL;
    if (mesaurementCount >= DATA_CAPTURE_INTERVAL) { //Take a datapoint from the running average
      const curDate = new Date(); //Get the time of the datapoint
      //Translate ADC Codes to Depth and Current
      //Depth, linear
      let depth_inches = (ave_level - ZERO_LEVEL_CODE) / DEPTH_SLOPE;
      //Current, not linear becuase a diode envelope detector is used to sample at less than Nyquist
      if (ave_current > 180) {
        current_amps = 0.00391216*(ave_current - 0.4) + 5.15725; // Linear at high current
      } else { //See spreadsheet in tools
        current_amps = 6.14e-2*(ave_current - 0.4) - 1.6e-4*ave_current*ave_current; // Not linear at low current
      }
      //Push into measurement array for Google
      measurmentArray.push([(curDate - dateOffset) / dayFraction, depth_inches.toFixed(3), current_amps.toFixed(3)]);
      //Log to a CSV for backup
      datafile.write(curDate.valueOf() + ',' + depth_inches.toFixed(3) + ',' + current_amps.toFixed(3) + '\n');
      mesaurementCount = 0; //Clear the counter, as we pushed the data
    } else {
      mesaurementCount += 1; // We just averaged, so increase count
    }
  }
})
//log stuff to a file for debug
function logWithTime(errmsg) {
    const curDate = new Date();
    const dateStr = curDate.toString();
    const message = dateStr.slice(0,dateStr.length-33) + ' ' + errmsg; //Prepend Time to message
    console.log(message);
    logfile.write(message + '\n')
  }