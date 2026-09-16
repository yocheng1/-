/**
 * 以 Google 試算表當資料庫的存取層。
 *
 * 每個資料表 = 一個工作表分頁，第一列是欄位名稱（見 Config.gs 的 SCHEMA）。
 * 所有值一律以字串存取，避免試算表自動把 "0912345678" 轉成數字、
 * 或把 ISO 時間字串轉成日期物件而產生時區誤差。
 */

/** 試算表 ID 存在指令碼屬性中，由 setup() 建立時寫入。 */
const PROP_SPREADSHEET_ID = 'KPLUS_SPREADSHEET_ID';

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) {
    throw new Error('尚未初始化。請先在編輯器中執行一次 setup() 函式。');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('找不到工作表「' + name + '」，請重新執行 setup()。');
  }
  return sheet;
}

/** 讀出整張表，回傳物件陣列。空白表回傳 []。 */
function tableRead_(name) {
  const values = getSheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = SCHEMA[name];
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // 整列都是空的就跳過（使用者手動刪列時會留下空白列）
    if (row.every(function (cell) { return cell === '' || cell === null; })) continue;

    const obj = { _rowIndex: i + 1 }; // 試算表列號從 1 起算，且第 1 列是標題
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] === null || row[c] === undefined ? '' : String(row[c]);
    }
    rows.push(obj);
  }

  return rows;
}

function tableAppend_(name, obj) {
  const headers = SCHEMA[name];
  const row = headers.map(function (key) {
    const value = obj[key];
    return value === undefined || value === null ? '' : String(value);
  });
  getSheet_(name).appendRow(row);
  return obj;
}

/**
 * 依 id 欄位更新一列。patch 只需包含要改的欄位。
 * 找不到回傳 false。
 */
function tableUpdateById_(name, id, patch) {
  const rows = tableRead_(name);
  const target = rows.filter(function (r) { return r.id === id; })[0];
  if (!target) return false;

  const headers = SCHEMA[name];
  const sheet = getSheet_(name);

  Object.keys(patch).forEach(function (key) {
    const col = headers.indexOf(key);
    if (col === -1) return;
    const value = patch[key];
    sheet.getRange(target._rowIndex, col + 1)
      .setValue(value === undefined || value === null ? '' : String(value));
  });

  return true;
}

function tableDeleteById_(name, id) {
  const rows = tableRead_(name);
  const target = rows.filter(function (r) { return r.id === id; })[0];
  if (!target) return false;
  getSheet_(name).deleteRow(target._rowIndex);
  return true;
}

function tableFindOne_(name, predicate) {
  return tableRead_(name).filter(predicate)[0] || null;
}

// ---------------------------------------------------------------- 小工具

function newId_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function isoFromNow_(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function isExpired_(iso) {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
}

/** SHA-256，回傳 hex 字串。用來存驗證碼與 session token 的雜湊。 */
function sha256_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/**
 * 依 id 批次更新「同一個欄位」。
 *
 * 為什麼需要這個：tableUpdateById_ 每改一個欄位就打一次 setValue，
 * 抽籤時要改幾百列，那樣會是幾百次 API 呼叫，鐵定撞上 6 分鐘執行上限。
 * 這裡把整欄讀進來、在記憶體改完，再用一次 setValues 寫回去。
 *
 * updates: { [id]: 新值 }
 */
function tableBulkUpdateColumn_(name, column, updates) {
  const headers = SCHEMA[name];
  const colIndex = headers.indexOf(column);
  if (colIndex === -1) throw new Error('未知的欄位：' + column);

  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const idCol = headers.indexOf('id');
  const ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  const target = sheet.getRange(2, colIndex + 1, lastRow - 1, 1);
  const current = target.getValues();

  let changed = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0]);
    if (Object.prototype.hasOwnProperty.call(updates, id)) {
      const value = updates[id];
      current[i][0] = value === undefined || value === null ? '' : String(value);
      changed++;
    }
  }

  if (changed > 0) target.setValues(current);
  return changed;
}
