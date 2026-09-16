/**
 * Firestore 名額控管測試（跑在模擬器上）。
 *
 * 與 SQLite 版最大的差別：這裡是「真正的並行」——
 * 用 Promise.all 同時送出數十筆報名，Firestore 交易偵測到衝突會自動重試。
 * 這正是現場很多人同時按下報名的情況。
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

process.env.FIREBASE_PROJECT_ID = 'demo-kplus'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'

const { db, COL } = await import('../src/lib/firebase/admin.ts')
const { createRegistration, cancelRegistration } = await import('../src/lib/fs/registrations.ts')

const firestore = db()
let seq = 0

async function makeEvent(overrides = {}) {
  seq++
  const id = `ev-${Date.now()}-${seq}`
  await firestore.collection(COL.events).doc(id).set({
    title: '測試活動',
    slug: id,
    status: 'published',
    capacity: 0,
    waitlistEnabled: false,
    confirmedCount: 0,
    waitlistCount: 0,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    ...overrides,
  })
  return id
}

const form = (n) => ({ name: `車友${n}`, phone: '0912345678' })

async function eventDoc(id) {
  return (await firestore.collection(COL.events).doc(id).get()).data()
}

async function countByStatus(eventId, status) {
  const snap = await firestore
    .collection(COL.registrations)
    .where('eventId', '==', eventId)
    .where('status', '==', status)
    .get()
  return snap.size
}

describe('Firestore 名額控管', () => {
  it('50 人同時報名、名額 5 → 剛好 5 人錄取', async () => {
    const eventId = await makeEvent({ capacity: 5 })

    // 真正同時送出，不是一筆一筆排隊
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createRegistration(eventId, `u${i}`, form(i))),
    )

    const ok = results.filter((r) => r.ok)
    assert.equal(ok.length, 5, `應剛好 5 筆成功，實際 ${ok.length}`)
    assert.equal(await countByStatus(eventId, 'confirmed'), 5)
    assert.equal((await eventDoc(eventId)).confirmedCount, 5, '計數器要與實際筆數一致')
  })

  it('不限名額時全部都能報名', async () => {
    const eventId = await makeEvent({ capacity: 0 })
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => createRegistration(eventId, `u${i}`, form(i))),
    )
    assert.equal(results.filter((r) => r.ok).length, 30)
    assert.equal((await eventDoc(eventId)).confirmedCount, 30)
  })

  it('額滿且有開候補 → 超額的轉為候補', async () => {
    const eventId = await makeEvent({ capacity: 3, waitlistEnabled: true })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createRegistration(eventId, `u${i}`, form(i))),
    )

    assert.equal(results.filter((r) => r.ok && r.status === 'confirmed').length, 3)
    assert.equal(results.filter((r) => r.ok && r.status === 'waitlist').length, 7)

    const doc = await eventDoc(eventId)
    assert.equal(doc.confirmedCount, 3)
    assert.equal(doc.waitlistCount, 7)
  })

  it('同一個人不能重複報名（即使同時送出兩次）', async () => {
    const eventId = await makeEvent({ capacity: 10 })

    const results = await Promise.all([
      createRegistration(eventId, 'same-user', form(1)),
      createRegistration(eventId, 'same-user', form(1)),
      createRegistration(eventId, 'same-user', form(1)),
    ])

    assert.equal(results.filter((r) => r.ok).length, 1, '只應成功一次')
    assert.equal(await countByStatus(eventId, 'confirmed'), 1)
    assert.equal((await eventDoc(eventId)).confirmedCount, 1)
  })

  it('取消後可以重新報名', async () => {
    const eventId = await makeEvent({ capacity: 10 })
    assert.ok((await createRegistration(eventId, 'u1', form(1))).ok)

    const cancelled = await cancelRegistration(eventId, 'u1', 'u1')
    assert.ok(cancelled.ok)
    assert.equal((await eventDoc(eventId)).confirmedCount, 0)

    assert.ok((await createRegistration(eventId, 'u1', form(1))).ok, '取消後應可重報')
    assert.equal((await eventDoc(eventId)).confirmedCount, 1)
  })

  it('取消確認名額時自動遞補最前面的候補者', async () => {
    const eventId = await makeEvent({ capacity: 1, waitlistEnabled: true })

    assert.equal((await createRegistration(eventId, 'first', form(1))).status, 'confirmed')
    await new Promise((r) => setTimeout(r, 10))
    assert.equal((await createRegistration(eventId, 'second', form(2))).status, 'waitlist')
    await new Promise((r) => setTimeout(r, 10))
    assert.equal((await createRegistration(eventId, 'third', form(3))).status, 'waitlist')

    const result = await cancelRegistration(eventId, 'first', 'first')
    assert.ok(result.ok)
    assert.ok(result.promotedRegistrationId?.includes('second'), '應由最早的候補者遞補')

    assert.equal(await countByStatus(eventId, 'confirmed'), 1)
    assert.equal(await countByStatus(eventId, 'waitlist'), 1)
  })

  it('不能取消別人的報名，工作人員可以', async () => {
    const eventId = await makeEvent({ capacity: 10 })
    await createRegistration(eventId, 'owner', form(1))

    const bad = await cancelRegistration(eventId, 'owner', 'stranger')
    assert.equal(bad.ok, false)

    const good = await cancelRegistration(eventId, 'owner', 'staff', true)
    assert.ok(good.ok)
  })

  it('草稿與已結束的活動不能報名', async () => {
    const draft = await makeEvent({ status: 'draft' })
    assert.equal((await createRegistration(draft, 'u1', form(1))).ok, false)

    const ended = await makeEvent({
      startsAt: new Date(Date.now() - 172800000).toISOString(),
      endsAt: new Date(Date.now() - 86400000).toISOString(),
    })
    assert.equal((await createRegistration(ended, 'u1', form(1))).ok, false)
  })

  it('抽籤模式只登記，不判斷名額', async () => {
    const eventId = await makeEvent({ capacity: 5, allocationMode: 'lottery' })
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createRegistration(eventId, `u${i}`, form(i))),
    )
    assert.equal(results.filter((r) => r.ok && r.status === 'entered').length, 20)
    assert.equal((await eventDoc(eventId)).confirmedCount, 0, '抽籤前不應有人錄取')
  })
})
