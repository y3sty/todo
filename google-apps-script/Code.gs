const SHEET_NAME = 'Úkoly';

function setup() {
  const sheet = getSheet_();
  if (sheet.getLastRow() === 0) sheet.appendRow(['id', 'title', 'done', 'createdAt']);
}

function doGet(e) {
  setup();
  if (e && e.parameter && e.parameter.action) {
    return respond_(e, applyChange_(e.parameter));
  }
  const tasks = readTasks_(getSheet_());
  return respond_(e, { tasks });
}

function doPost(e) {
  setup();
  const payload = JSON.parse(e.postData.contents || '{}');
  return json_(applyChange_(payload));
}

function applyChange_(payload) {
  const sheet = getSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let tasks = readTasks_(sheet);
    if (payload.action === 'upsert' && payload.id) {
      const index = tasks.findIndex(task => task.id === String(payload.id));
      const task = { id: String(payload.id), title: String(payload.title || ''), done: String(payload.done).toLowerCase() === 'true', createdAt: String(payload.createdAt || '') };
      if (index === -1) tasks.unshift(task); else tasks[index] = task;
    } else if (payload.action === 'delete' && payload.id) {
      tasks = tasks.filter(task => task.id !== String(payload.id));
    } else if (payload.action) {
      return { ok: false, error: 'Neplatná synchronizační operace' };
    }
    writeTasks_(sheet, tasks);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function readTasks_(sheet) {
  const values = sheet.getDataRange().getValues();
  return values.slice(1).filter(row => row[0]).map(row => ({ id: String(row[0]), title: String(row[1]), done: row[2] === true || String(row[2]).toLowerCase() === 'true', createdAt: String(row[3]) }));
}

function writeTasks_(sheet, tasks) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['id', 'title', 'done', 'createdAt']]);
  if (tasks.length) sheet.getRange(2, 1, tasks.length, 4).setValues(tasks.map(task => [task.id, task.title, Boolean(task.done), task.createdAt]));
}

function getSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function respond_(e, value) {
  const callback = e && e.parameter && e.parameter.callback;
  const result = JSON.stringify(value);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) return ContentService.createTextOutput(`${callback}(${result})`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  return json_(value);
}
