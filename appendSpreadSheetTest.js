#!/usr/bin/node
'use strict';

require('dotenv').config(); //Load Env from file
const { google } = require('googleapis');
const sheets = google.sheets('v4');

async function getAuthToken() {
  const auth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
  });
  const authToken = await auth.getClient();
  return authToken;
}

async function testAppendSpreadSheet() {
  let values = [
    [
      "1235", 
      "2341", 
      "13455"
    ]
  ];
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