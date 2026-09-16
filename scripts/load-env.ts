/**
 * 載入 .env.local / .env 到 process.env。
 *
 * Next.js 自己會處理這件事，但用 tsx 直接跑的腳本不會，
 * 所以 seed / reset 這類腳本要自己載入。
 *
 * 不用 Node 的 --env-file 參數，因為那需要 Node 20.18+ / 22.9+，
 * 在較舊的環境會直接以「bad option」失敗。這裡自己解析，Node 18 以上都能跑。
 *
 * 已經存在的環境變數不會被覆寫（CI 或命令列指定的值優先）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parse(content: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    if (!key) continue

    let value = line.slice(eq + 1).trim()

    // 去掉成對的引號，引號內的 # 不算註解
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)

    if (quoted) {
      value = value.slice(1, -1)
    } else {
      const hash = value.indexOf(' #')
      if (hash !== -1) value = value.slice(0, hash).trim()
    }

    result[key] = value
  }

  return result
}

export function loadEnv(files = ['.env.local', '.env']): void {
  for (const file of files) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue

    for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
      // 先載入的檔案優先，且不覆寫既有的環境變數
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadEnv()
