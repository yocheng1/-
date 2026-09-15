/**
 * 刪掉本機資料庫檔案，下次啟動時會依 db/schema.sql 重建。
 * 執行：npm run db:reset
 */
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve(process.cwd(), process.env.DATABASE_PATH ?? 'data/kplus.db')

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  rmSync(`${path}${suffix}`, { force: true })
}

console.log(`✓ 已刪除資料庫：${path}`)
console.log('  下次啟動應用程式或執行 npm run db:seed 時會自動重建。')
console.log('')
console.log('⚠ 若開發伺服器正在執行，請一併重新啟動。')
console.log('  SQLite 連線是在伺服器啟動時建立的，檔案被刪掉之後')
console.log('  它仍會寫入那個已經不存在的舊檔案，畫面就會顯示過期的資料。')
