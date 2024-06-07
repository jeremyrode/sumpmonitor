#!/usr/bin/node

/**
 * Create a google spreadsheet
 * Modified from Google Example, but using non-sensitive scopes and an API key rather than OAuth
 */

const {google} = require('googleapis');

const API_KEY_PATH = '/home/pi/google_api_key.json';

// Load API Key from a local json file so I don't check it into github
fs.readFile(API_KEY_PATH, (err, content) => {
  if (err) {
    console.log('Error loading API key file:', err);
  }
  else {
    // Authorize a client with credentials, then call the Google Calendar API.
    const obj = JSON.parse(content);
    console.log('Program Successfully Started');
    create('SumpLog', obj.api_key);
  }
});

async function create(title, api_key) {
  const service = google.sheets({version: 'v4', auth: api_key});
  const resource = {
    properties: {
      title,
    },
  };
  try {
    const spreadsheet = await service.spreadsheets.create({
      resource,
      fields: 'spreadsheetId',
    });
    console.log(`Spreadsheet ID: ${spreadsheet.data.spreadsheetId}`);
    return spreadsheet.data.spreadsheetId;
  } catch (err) {
    console.log('Error creating spreadsheet');
    throw err;
  }
}

