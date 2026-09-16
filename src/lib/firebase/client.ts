'use client'

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

/**
 * 瀏覽器端的 Firebase。
 *
 * 這裡的設定值是公開資訊（本來就會出現在網頁原始碼裡），
 * 真正的權限控管在 firestore.rules。
 *
 * 現場大螢幕只讀 prizes 與 winners，這兩個集合規則設為公開可讀，
 * 所以觀眾不需要登入就能看到抽獎結果。
 */
function config() {
  return {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-kplus',
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
}

let cached: Firestore | null = null

export function clientDb(): Firestore {
  if (cached) return cached

  const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(config())
  const firestore = getFirestore(app)

  // 本機開發時連模擬器
  const emulator = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR
  if (emulator) {
    const [host, port] = emulator.split(':')
    connectFirestoreEmulator(firestore, host, Number(port))
  }

  cached = firestore
  return firestore
}
