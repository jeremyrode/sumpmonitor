#!/usr/bin/node

/**
 * Create a google spreadsheet
 * Modified from Google Example
 */

 const fs = require('fs').promises;
 const path = require('path');
 const process = require('process');
 const {authenticate} = require('@google-cloud/local-auth');
 const {google} = require('googleapis');

 // If modifying these scopes, delete token.json.
 const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
 // The file token.json stores the user's access and refresh tokens, and is
 // created automatically when the authorization flow completes for the first
 // time.
 const TOKEN_PATH = '/home/pi/sump_token.json';
 const CREDENTIALS_PATH = '/home/pi/sump_credentials.json';

 /**
  * Reads previously authorized credentials from the save file.
  *
  * @return {Promise<OAuth2Client|null>}
  */
 async function loadSavedCredentialsIfExist() {
   try {
     const content = await fs.readFile(TOKEN_PATH);
     const credentials = JSON.parse(content);
     return google.auth.fromJSON(credentials);
   } catch (err) {
     return null;
   }
 }

 /**
  * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
  *
  * @param {OAuth2Client} client
  * @return {Promise<void>}
  */
 async function saveCredentials(client) {
   const content = await fs.readFile(CREDENTIALS_PATH);
   const keys = JSON.parse(content);
   const key = keys.installed || keys.web;
   const payload = JSON.stringify({
     type: 'authorized_user',
     client_id: key.client_id,
     client_secret: key.client_secret,
     refresh_token: client.credentials.refresh_token,
   });
   await fs.writeFile(TOKEN_PATH, payload);
 }

 /**
  * Load or request or authorization to call APIs.
  *
  */
 async function authorize() {
   let client = await loadSavedCredentialsIfExist();
   if (client) {
     return client;
   }
   client = await authenticate({
     scopes: SCOPES,
     keyfilePath: CREDENTIALS_PATH,
   });
   if (client.credentials) {
     await saveCredentials(client);
   }
   return client;
 }



 /**
 * Create a google spreadsheet
 * @param {string} title Spreadsheets title
 * @return {string} Created spreadsheets ID
 */
async function create(auth) {
  const title = 'sump_test_jer';
  const service = google.sheets({version: 'v4', auth});
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
    // TODO (developer) - Handle exception
    throw err;
  }
}

 authorize().then(create).catch(console.error);
 // [END calendar_quickstart]
