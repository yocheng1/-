/**
 * Google Apps Script 服務的假實作，用來在 Node 裡直接執行 apps-script/*.gs。
 *
 * .gs 檔本身就是純 JavaScript（全域函式，沒有模組系統），
 * 所以只要把 SpreadsheetApp / LockService 這些服務換成記憶體版本，
 * 就能在沒有 Google 帳號的情況下測試真正要上線的那份程式碼。
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols })
  }
  getValues() {
    const out = []
    for (let r = 0; r < this.numRows; r++) {
      const row = this.sheet.rows[this.row - 1 + r] ?? []
      const cells = []
      for (let c = 0; c < this.numCols; c++) cells.push(row[this.col - 1 + c] ?? '')
      out.push(cells)
    }
    return out
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const target = this.row - 1 + r
      while (this.sheet.rows.length <= target) this.sheet.rows.push([])
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.rows[target][this.col - 1 + c] = values[r][c]
      }
    }
    return this
  }
  setValue(value) {
    return this.setValues([[value]])
  }
  getValue() {
    return this.getValues()[0][0]
  }
}

class FakeSheet {
  constructor(name, headers) {
    this.name = name
    this.rows = [headers.slice()]
  }
  getName() { return this.name }
  getLastRow() { return this.rows.length }
  getLastColumn() { return Math.max(...this.rows.map((r) => r.length)) }
  getDataRange() {
    return new FakeRange(this, 1, 1, this.rows.length, this.getLastColumn())
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols)
  }
  appendRow(values) {
    this.rows.push(values.slice())
    return this
  }
  deleteRow(row) {
    this.rows.splice(row - 1, 1)
    return this
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map() }
  getSheetByName(name) { return this.sheets.get(name) ?? null }
  insertSheet(name) {
    const sheet = new FakeSheet(name, [])
    this.sheets.set(name, sheet)
    return sheet
  }
  addSheet(name, headers) {
    const sheet = new FakeSheet(name, headers)
    this.sheets.set(name, sheet)
    return sheet
  }
}

/**
 * 載入 apps-script 目錄下的 .gs，回傳可呼叫的全域環境。
 * schemaSheets 會依 SCHEMA 自動建立對應的工作表與標題列。
 */
export function loadAppsScript(rootDir = 'apps-script') {
  const files = ['Config.gs', 'Db.gs', 'Auth.gs', 'Events.gs', 'Registrations.gs', 'Lottery.gs']
  // .gs 用 const 宣告的常數在 vm 裡屬於語彙範疇，不會掛到 sandbox 物件上
  // （只有 function 宣告會），所以結尾補一段把測試需要的常數顯式暴露出來。
  const epilogue = `
;globalThis.SCHEMA = SCHEMA;
globalThis.SHEET_USERS = SHEET_USERS;
globalThis.SHEET_SESSIONS = SHEET_SESSIONS;
globalThis.SHEET_OTP = SHEET_OTP;
globalThis.SHEET_EVENTS = SHEET_EVENTS;
globalThis.SHEET_REGISTRATIONS = SHEET_REGISTRATIONS;
globalThis.ALLOCATION_FCFS = ALLOCATION_FCFS;
globalThis.ALLOCATION_LOTTERY = ALLOCATION_LOTTERY;
globalThis.ADMIN_EMAILS = ADMIN_EMAILS;
globalThis.REGISTRATION_WINDOW_LABEL = REGISTRATION_WINDOW_LABEL;
`

  const source = files
    .map((f) => `// ===== ${f} =====\n` + readFileSync(join(rootDir, f), 'utf8'))
    .join('\n') + epilogue

  const spreadsheet = new FakeSpreadsheet()
  const sentEmails = []
  let lockDepth = 0

  const sandbox = {
    console,
    SpreadsheetApp: {
      openById: () => spreadsheet,
      create: () => spreadsheet,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'KPLUS_SPREADSHEET_ID' ? 'fake-id' : null),
        setProperty: () => {},
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock(ms) {
          // 真實環境是跨執行緒互斥；Node 是單執行緒，這裡只用來驗證
          // 程式碼沒有巢狀取鎖（那在 Apps Script 會直接卡死）
          if (lockDepth > 0) {
            throw new Error('偵測到巢狀取得指令碼鎖 —— 在 Apps Script 會造成死結')
          }
          lockDepth++
        },
        releaseLock() { lockDepth = Math.max(0, lockDepth - 1) },
      }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algo, text) => {
        const buf = createHash('sha256').update(String(text), 'utf8').digest()
        // Apps Script 回傳的是有號位元組
        return Array.from(buf).map((b) => (b > 127 ? b - 256 : b))
      },
    },
    MailApp: {
      sendEmail: (opts) => { sentEmails.push(opts) },
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => '' }),
    },
  }

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'apps-script-bundle.gs' })

  // 依 SCHEMA 建立工作表
  for (const [name, headers] of Object.entries(sandbox.SCHEMA)) {
    spreadsheet.addSheet(name, headers)
  }

  return { gas: sandbox, spreadsheet, sentEmails }
}
