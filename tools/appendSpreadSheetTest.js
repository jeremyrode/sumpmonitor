#!/usr/bin/node
'use strict';

require('dotenv').config(); //Load Env from file
const { google } = require('googleapis');
const sheets = google.sheets('v4');

const dayFraction = 86400000; // Milliseconds in a Day
const dateOffset = new Date(1899,11,30) - 3600000;  // Spreadsheet Epoc minus an hour

async function getAuthToken() {
  const auth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
  });
  const authToken = await auth.getClient();
  return authToken;
}

async function testAppendSpreadSheet() {
  const curDate = new Date();
  let values = [
    [
      (curDate - dateOffset) / dayFraction, 
      "2341", 
      "13455"
    ]
  ];
  console.log(curDate.toLocaleString("en-US"));
  const resource = {
    values,
  };
 
  const auth = await getAuthToken();

  sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: resource,
    auth
  }, (err, result) => {
    if (err) {
      // Handle error.
      console.log(err);
    } else {
      console.log('Google Says: ' + result.statusText);
    }
  });
}


testAppendSpreadSheet();