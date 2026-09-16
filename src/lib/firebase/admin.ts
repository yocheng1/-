import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * 後端用的 Firebase Admin SDK。
 *
 * Admin SDK 會「繞過」安全規則 —— 這是刻意的：名額計算、抽獎這類邏輯
 * 必須在後端完成才可信。規則保護的是瀏覽器直接連資料庫的那條路。
 *
 * 本機開發與測試時，設定 FIRESTORE_EMULATOR_HOST 就會自動連到模擬器，
 * 不需要真的服務帳戶金鑰。
 */
const globalForFirebase = globalThis as unknown as { __kplusFirebaseApp?: App }

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return undefined
  // 金鑰用環境變數傳入時，換行字元常常會被轉義成 \n
  const parsed = JSON.parse(raw) as { private_key?: string }
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
  return cert(parsed as Parameters<typeof cert>[0])
}

export function getFirebaseApp(): App {
  if (globalForFirebase.__kplusFirebaseApp) return globalForFirebase.__kplusFirebaseApp

  const existing = getApps()[0]
  if (existing) {
    globalForFirebase.__kplusFirebaseApp = existing
    return existing
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

  if (!projectId) {
    throw new Error(
      '缺少 FIREBASE_PROJECT_ID。請在 .env.local 填入 Firebase 專案 ID。',
    )
  }

  // 注意：credential 不能傳 undefined，Firebase 會直接報錯 ——
  // 沒有服務帳戶金鑰時（例如連模擬器）必須整個省略這個欄位。
  const credential = credentials()
  const app = initializeApp(credential ? { projectId, credential } : { projectId })
  globalForFirebase.__kplusFirebaseApp = app
  return app
}

export function db(): Firestore {
  return getFirestore(getFirebaseApp())
}

/** 集合名稱集中在這裡，避免各處硬寫字串打錯。 */
export const COL = {
  users: 'users',
  events: 'events',
  registrations: 'registrations',
  prizes: 'prizes',
  winners: 'winners',
  checkins: 'checkins',
  rewards: 'rewards',
} as const

/**
 * 報名文件的 ID 一律用「活動 ID_使用者 ID」組成。
 *
 * 這等同於關聯式資料庫的唯一索引：同一個人在同一場活動最多只有一份文件，
 * 就算程式邏輯有漏，資料庫也不會生出第二筆。
 */
export function registrationId(eventId: string, userId: string): string {
  return `${eventId}_${userId}`
}

/** 中獎文件同理：一場活動每人最多中一次。 */
export function winnerId(eventId: string, registrationId: string): string {
  return `${eventId}_${registrationId}`
}
