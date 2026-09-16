/**
 * 第一次設定：若還沒有 .env.local，就從 .env.example 複製一份。
 * 已存在時不動它，避免蓋掉使用者填好的 LINE 金鑰等設定。
 */
import { copyFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  console.log('· .env.local 已存在，保留原本的設定')
} else if (existsSync('.env.example')) {
  copyFileSync('.env.example', '.env.local')
  console.log('✓ 已從 .env.example 建立 .env.local')
} else {
  console.error('✗ 找不到 .env.example')
  process.exit(1)
}
