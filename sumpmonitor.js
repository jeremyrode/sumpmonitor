#!/usr/bin/node
'use strict';

require('dotenv').config(); //Load Env from file
const { google } = require('googleapis');
const sheets = google.sheets('v4');
const fs = require('fs');
const LCD = require('raspberrypi-liquid-crystal');
const ADS1115 = require('ads1115');
const lcd = new LCD( 1, 0x27, 20, 4 );
const ip = require("ip");

const DATA_LOG_FILE = '/home/jprode/SumpData.csv';
const ERR_LOG_FILE = '/home/jprode/SumpErrorLog.txt';
const DATA_IIR_CONST = 10000; //How many ADC samples averaged into a datapoint (33 ms / 30 Hz ADC Rate)
const MAX_DATA_IN_RAM = 100000; //Max size of RAM cache in case of long term internet failure
const ZERO_LEVEL_CODE = 3084.327283; //Code at Zero water level, Might be altitude/temp dependent
const DEPTH_SLOPE = 148.93; //Codes per inch, prob temp dependent
const ZERO_CURRENT_CODE = 2; //How many codes is zero current
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
//Running Averages
let min_level = 1000;
let ave_level = 0;
let max_level = 0;
let min_current = 1000;
let ave_current = 0;
let max_current = 0;
let min_cycle_time = 10000000;
let ave_cycle_time = 0;
let max_cycle_time = 0;
let internet_down = false;
//Setup LCD
lcd.beginSync();
lcd.clearSync();
//Fill the display initally
lcd.printLineSync(0,'Starting....');
//Interval Section
setTimeout(setInterval,10 * 60 * 1000,TakeMeasurement, 10 * 60 * 1000); //Take a Datapoint every 10 min, after 10 min delay to flush
setInterval(AppendSpreadSheet, 20 * 60 * 1000); //Send data to Google
//SCREEN SECTION: Print out each line seperatly at approprite intevals
printIPAddress();
setInterval(printIPAddress, 10 * 60 * 1000); //Update IP on Screen
printDate();
setInterval(printDate, 120 * 60 * 1000); //Update Date on Screen
//setInterval(printADCCodes, 1000); //ADC Codes for debug
setInterval(printTime, 5000);
setInterval(printData, 1000);
//SCREEN PRINT SECTION: By line
function printData() {
  const lastIndex = measurmentArray.length;
  if (lastIndex > 0) {
    lcd.printLineSync(0, measurmentArray[lastIndex-1][1].toFixed(2).padStart(6) + measurmentArray[lastIndex-1][2].toFixed(2).padStart(6));
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
function printADCCodes() {
  lcd.printLineSync(2, ave_level.toFixed(2).padStart(10) + ave_current.toFixed(2).padStart(10))
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
    range: 'Slow!A:J',
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
      internet_down = false;
    }
  });
}
function adcCodeToCurrent(adc_code) { //Translate ADC Codes to Current
  const ave_current_debiased = adc_code - ZERO_CURRENT_CODE;
  let current_amps;
  if (adc_code > 180) { //not linear becuase a diode envelope detector is used to sample at less than Nyquist
    current_amps = 0.00391216*(ave_current_debiased - 0.4) + 5.15725; // Linear at high current
  } else { //See spreadsheet in tools
    current_amps = 6.14e-2*ave_current_debiased - 1.6e-4*ave_current_debiased*ave_current_debiased; // Not linear at low current
  }
  return current_amps;
}
function TakeMeasurement() {
  const curDate = new Date(); //Get the time of the datapoint
  //Depth, linear
  const min_level_inches = (min_level - ZERO_LEVEL_CODE) / DEPTH_SLOPE;
  const ave_level_inches = (ave_level - ZERO_LEVEL_CODE) / DEPTH_SLOPE;
  const max_level_inches = (max_level - ZERO_LEVEL_CODE) / DEPTH_SLOPE;
  // Current
  const min_current_amps = adcCodeToCurrent(min_current);
  const ave_current_amps = adcCodeToCurrent(ave_current);
  const max_current_amps = adcCodeToCurrent(max_current);
  //Push into measurement array for Google
  if (measurmentArray.length < MAX_DATA_IN_RAM) { //Stop caching in RAM if too many so we don't crash 
    measurmentArray.push([(curDate - dateOffset) / dayFraction, min_level_inches, ave_level_inches, max_level_inches, 
      min_current_amps, ave_current_amps, max_current_amps, min_cycle_time/1000, ave_cycle_time/1000, max_cycle_time/1000]);
  } else if (!internet_down) { //ony log on state change
    logWithTime('Dropping Measurments due to Max Data');
    internet_down = true;
  }
  //Log to a CSV for backup
  datafile.write(curDate.valueOf() + ',' + min_level_inches.toFixed(4) + ',' + ave_level_inches.toFixed(4) + ',' + max_level_inches.toFixed(4) + ',' 
    + min_current_amps.toFixed(4) + ',' + ave_current_amps.toFixed(4) + ',' + max_current_amps.toFixed(4)  + ',' 
    + min_cycle_time.toFixed(4) + ',' + ave_cycle_time.toFixed(4) + ',' + max_cycle_time.toFixed(4) + '\n');
  //Reset Min/Max
  min_level = 1000;
  max_level = 0;
  min_current = 1000;
  max_current = 0;
  min_cycle_time = 10000000;
  max_cycle_time = 0;
}
//Measurment Infinite Loop
ADS1115.open(0, 0x48).then(async (ads1115) => {
  ads1115.gain = 1;
  let pos_cycle = true;
  let last_cycle = 0;
  logWithTime('Measurment Loop Started');
  while (true) { //Run the ADC as fast as we can
    let cur_level = await ads1115.measure('0+3'); //This never gets near zero
    let cur_current = await ads1115.measure('2+3'); //This can go slightly below zero
    if (cur_current > 32768) { // 2's compliment crosses near zero sometimes
      cur_current = cur_current - 65536; //Take me negative
    }
    // Use a IIR to take a running average of the ADC Codes
    ave_level = cur_level / DATA_IIR_CONST + ave_level * (DATA_IIR_CONST - 1) / DATA_IIR_CONST;
    ave_current = cur_current / DATA_IIR_CONST + ave_current * (DATA_IIR_CONST - 1) / DATA_IIR_CONST;
    // Maxes
    if (cur_level > max_level) {
      max_level = cur_level;
    }
    if (cur_current > max_current) {
      max_current = cur_current;
    }
    // Mins
    if (cur_level < min_level) {
      min_level = cur_level;
    }
    if (cur_current < min_current) {
      min_current = cur_current;
    }
    //Extract the Pump Cycle Time
    if (pos_cycle) {
      if (cur_current > 10) { //Postive threshold
        last_cycle = Date.now();
        pos_cycle = false;
      }
    } else {
      if (cur_current < 8) { //Negative threshold
        let cur_cycle_time = (Date.now() - last_cycle);
        ave_cycle_time =  cur_cycle_time / DATA_IIR_CONST + ave_cycle_time * (DATA_IIR_CONST - 1) / DATA_IIR_CONST;
        if (cur_cycle_time > max_cycle_time) {
          max_cycle_time = cur_cycle_time;
        }
        if (cur_cycle_time < min_cycle_time) {
          min_cycle_time = cur_cycle_time;
        }
        pos_cycle = true;
      }
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