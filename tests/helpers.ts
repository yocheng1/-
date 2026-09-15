import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 每個測試檔案用自己的暫存資料庫，測試之間不會互相污染。
 * 必須在 import 任何會碰到 db 的模組「之前」呼叫。
 */
export function useTempDatabase(): { cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'kplus-test-'))
  process.env.DATABASE_PATH = join(dir, 'test.db')
  process.env.SMS_PROVIDER = 'console'
  process.env.ADMIN_EMAILS = 'admin@kplushelmet.com'

  return {
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** 測試時不想看到 OTP 簡訊的 log。 */
export function silenceConsole(): () => void {
  const original = console.log
  console.log = () => {}
  return () => {
    console.log = original
  }
}
