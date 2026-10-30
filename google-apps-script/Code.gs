const SHEET_NAME = 'Úkoly';

function setup() {
  const sheet = getSheet_();
  if (sheet.getLastRow() === 0) sheet.appendRow(['id', 'title', 'done', 'createdAt']);
}

function doGet(e) {
  setup();
  const values = getSheet_().getDataRange().getValues();
  const tasks = values.slice(1).filter(row => row[0]).map(row => ({ id: String(row[0]), title: String(row[1]), done: row[2] === true || String(row[2]).toLowerCase() === 'true', createdAt: String(row[3]) }));
  const result = JSON.stringify({ tasks });
  const callback = e && e.parameter && e.parameter.callback;
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(`${callback}(${result})`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_({ tasks });
}

function doPost(e) {
  setup();
  const payload = JSON.parse(e.postData.contents || '{}');
  const sheet = getSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.clearContents();
    sheet.appendRow(['id', 'title', 'done', 'createdAt']);
    (payload.tasks || []).forEach(task => sheet.appendRow([task.id, task.title, Boolean(task.done), task.createdAt]));
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function getSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
