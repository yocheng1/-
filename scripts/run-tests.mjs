/**
 * 執行 tests/ 底下所有的 *.test.ts。
 *
 * 不直接在 npm script 裡寫 "tests/*.test.ts" —— 那個萬用字元是靠 shell 展開的，
 * Windows 的 cmd.exe 不會展開，會變成「找不到檔案」。
 * 這裡自己列出檔案再交給 Node 的 test runner，三種作業系統行為一致。
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = join(projectRoot, 'tests')

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join('tests', name))

if (files.length === 0) {
  console.error('✗ tests/ 底下找不到任何測試檔')
  process.exit(1)
}

// process.execPath = 目前這個 node，不依賴 PATH 上有沒有 node/tsx
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { stdio: 'inherit', cwd: projectRoot },
)

if (result.error) {
  console.error('✗ 無法啟動測試：', result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
