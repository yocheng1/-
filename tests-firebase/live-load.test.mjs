/**
 * 現場壓測：100 個觀眾同時監聽抽獎結果。
 *
 * 這裡用的是「瀏覽器端」的 Firebase SDK（onSnapshot 即時監聽），
 * 也就是現場觀眾手機上真正跑的那條路徑 —— 不是伺服器推播。
 */
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getFirestore, connectFirestoreEmulator, collection, query, where, onSnapshot,
} from 'firebase/firestore'

process.env.FIREBASE_PROJECT_ID = 'demo-kplus'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'

const { db, COL } = await import('../src/lib/firebase/admin.ts')
const { createRegistration } = await import('../src/lib/fs/registrations.ts')
const { createPrize, drawPrize } = await import('../src/lib/fs/draw.ts')

const admin = db()
const VIEWERS = 100

const clientApp = initializeApp({ projectId: 'demo-kplus' }, 'load-test')
const clientDb = getFirestore(clientApp)
connectFirestoreEmulator(clientDb, '127.0.0.1', 8080)

after(async () => { await deleteApp(clientApp) })

describe('現場 100 人同時觀看', () => {
  it('抽獎結果即時送達所有觀眾', async () => {
    // 準備一場有 200 位參加者的活動
    const eventId = `live-${Date.now()}`
    await admin.collection(COL.events).doc(eventId).set({
      title: '現場抽獎壓測', slug: eventId, status: 'published',
      capacity: 0, waitlistEnabled: false, confirmedCount: 0, waitlistCount: 0,
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
    })
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        createRegistration(eventId, `p${i}`, { name: `參加者${i}`, phone: '0912345678' }),
      ),
    )

    const prize = await createPrize(eventId, { name: '壓測獎項', quantity: 3 })

    // 100 個觀眾各自建立即時監聽
    const unsubscribes = []
    const received = new Array(VIEWERS).fill(null)
    let drawStart = 0

    const ready = await Promise.all(
      Array.from({ length: VIEWERS }, (_, i) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`第 ${i} 位連線逾時`)), 30000)
          let first = true

          const unsub = onSnapshot(
            query(collection(clientDb, COL.winners), where('eventId', '==', eventId)),
            (snap) => {
              if (first) {
                first = false
                clearTimeout(timer)
                resolve(true)
                return
              }
              if (snap.size > 0 && received[i] === null) {
                received[i] = Date.now() - drawStart
              }
            },
            (err) => { clearTimeout(timer); reject(err) },
          )
          unsubscribes.push(unsub)
        }),
      ),
    )

    assert.equal(ready.filter(Boolean).length, VIEWERS, `應有 ${VIEWERS} 位成功連上`)

    // 主持人按下抽獎
    drawStart = Date.now()
    const result = await drawPrize(prize.id)
    assert.ok(result.ok)

    // 等所有觀眾收到
    const deadline = Date.now() + 20000
    while (Date.now() < deadline && received.filter((v) => v !== null).length < VIEWERS) {
      await new Promise((r) => setTimeout(r, 50))
    }

    unsubscribes.forEach((u) => u())

    const latencies = received.filter((v) => v !== null).sort((a, b) => a - b)
    const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]

    console.log(`\n    同時連線      ${VIEWERS}`)
    console.log(`    收到推播      ${latencies.length} / ${VIEWERS}`)
    console.log(`    延遲 最快     ${latencies[0]} ms`)
    console.log(`    延遲 中位數   ${pct(0.5)} ms`)
    console.log(`    延遲 P95      ${pct(0.95)} ms`)
    console.log(`    延遲 最慢     ${latencies[latencies.length - 1]} ms\n`)

    assert.equal(latencies.length, VIEWERS, '所有觀眾都應收到抽獎結果')
    assert.ok(pct(0.95) < 5000, `P95 延遲 ${pct(0.95)}ms 過高`)
  })
})
