import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { env } from './env'

export type DB = Database.Database

/**
 * Next.js 在 dev 模式會反覆重新載入模組，每次都開新的 SQLite 連線會把
 * file handle 用光，所以把連線掛在 globalThis 上重複使用。
 */
const globalForDb = globalThis as unknown as { __kplusDb?: DB }

function openDatabase(): DB {
  const path = resolve(process.cwd(), env.databasePath)
  mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 併發寫入時先等一下再放棄，而不是立刻丟 SQLITE_BUSY
  db.pragma('busy_timeout = 5000')

  migrate(db)
  return db
}

function migrate(db: DB): void {
  const schemaPath = resolve(process.cwd(), 'db/schema.sql')
  if (!existsSync(schemaPath)) {
    throw new Error(`找不到 schema 檔案：${schemaPath}`)
  }
  db.exec(readFileSync(schemaPath, 'utf8'))
}

export function getDb(): DB {
  if (!globalForDb.__kplusDb) {
    globalForDb.__kplusDb = openDatabase()
  }
  return globalForDb.__kplusDb
}

/**
 * 用 BEGIN IMMEDIATE 包住一段寫入。
 *
 * 這對名額控管是關鍵：IMMEDIATE 會立刻取得 write lock，
 * 所以「數人數 → 決定是否還有名額 → 寫入報名」三步驟不會被其他請求插隊，
 * 不會發生兩個人同時搶到最後一個名額的情況。
 */
export function transaction<T>(fn: (db: DB) => T): T {
  const db = getDb()
  const run = db.transaction(fn)
  return run.immediate(db) as T
}
