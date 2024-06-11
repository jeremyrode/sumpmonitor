

require('dotenv').config();
const { google } = require('googleapis');
const sheets = google.sheets('v4');

const spreadsheetId = process.env.SPREADSHEET_ID;

async function getAuthToken() {
  const auth = new google.auth.GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
  });
  const authToken = await auth.getClient();
  return authToken;
}



async function testGetSpreadSheet() {
  try {
    const auth = await getAuthToken();
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      auth,
    });
    console.log('output for getSpreadSheet', JSON.stringify(response.data, null, 2));
  } catch(error) {
    console.log(error.message, error.stack);
  }
}

testGetSpreadSheet();