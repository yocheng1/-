import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.FIREBASE_PROJECT_ID = 'demo-kplus'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'

const { db, COL } = await import('../src/lib/firebase/admin.ts')
const { createRegistration } = await import('../src/lib/fs/registrations.ts')
const { createPrize, drawPrize, listEligible, verifyPrizeDraw, maskPhone } =
  await import('../src/lib/fs/draw.ts')

const firestore = db()
let seq = 0

async function eventWithAttendees(n) {
  seq++
  const id = `draw-${Date.now()}-${seq}`
  await firestore.collection(COL.events).doc(id).set({
    title: '抽獎測試', slug: id, status: 'published',
    capacity: 0, waitlistEnabled: false, confirmedCount: 0, waitlistCount: 0,
    // 本套件驗證抽獎機制本身；「只抽已報到」的行為由 flow.test.mjs 覆蓋
    drawPool: 'all',
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
  })
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      createRegistration(id, `u${i}`, { name: `參加者${i}`, phone: '0912345678' }),
    ),
  )
  return id
}

describe('Firestore 現場抽獎', () => {
  it('抽出人數等於獎項數量', async () => {
    const eventId = await eventWithAttendees(50)
    const prize = await createPrize(eventId, { name: '安全帽', quantity: 3 })

    const result = await drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 3)
    assert.equal(result.poolSize, 50)
  })

  it('中過獎的人不會再中（跨獎項）', async () => {
    const eventId = await eventWithAttendees(10)
    const first = await createPrize(eventId, { name: '頭獎', quantity: 4 })
    const second = await createPrize(eventId, { name: '二獎', quantity: 4 })

    const r1 = await drawPrize(first.id)
    const r2 = await drawPrize(second.id)
    assert.ok(r1.ok && r2.ok)

    const a = r1.winners.map((w) => w.registrationId)
    const b = r2.winners.map((w) => w.registrationId)
    assert.equal(a.filter((id) => b.includes(id)).length, 0, '不該有人中兩次')
    assert.equal(r2.poolSize, 6, '第二次候選池應排除已中獎者')
  })

  it('全場每人最多出現在中獎名單一次', async () => {
    const eventId = await eventWithAttendees(20)
    for (let i = 0; i < 4; i++) {
      const prize = await createPrize(eventId, { name: `獎${i}`, quantity: 5 })
      assert.ok((await drawPrize(prize.id)).ok)
    }
    const snap = await firestore.collection(COL.winners).where('eventId', '==', eventId).get()
    assert.equal(snap.size, 20)
    assert.equal(new Set(snap.docs.map((d) => d.data().registrationId)).size, 20)
  })

  it('中獎名單不含完整電話，只有遮罩後的', async () => {
    const eventId = await eventWithAttendees(5)
    const prize = await createPrize(eventId, { name: '獎', quantity: 1 })
    const result = await drawPrize(prize.id)
    assert.ok(result.ok)

    const snap = await firestore.collection(COL.winners).doc(result.winners[0].id).get()
    const data = snap.data()
    assert.equal(data.maskedPhone, maskPhone('+886912345678'))
    assert.equal(data.phone, undefined, '公開文件不應含完整電話')
    assert.equal(data.email, undefined)
  })

  it('同一獎項不能抽兩次（含同時按下）', async () => {
    const eventId = await eventWithAttendees(20)
    const prize = await createPrize(eventId, { name: '獎', quantity: 2 })

    const [a, b] = await Promise.all([drawPrize(prize.id), drawPrize(prize.id)])
    const ok = [a, b].filter((r) => r.ok)
    assert.equal(ok.length, 1, '同時按兩次只應成功一次')

    const snap = await firestore.collection(COL.winners).where('prizeId', '==', prize.id).get()
    assert.equal(snap.size, 2, '不應產生多餘的中獎紀錄')
  })

  it('參加者不足時抽出剩下全部，不會失敗', async () => {
    const eventId = await eventWithAttendees(3)
    const prize = await createPrize(eventId, { name: '大獎', quantity: 10 })
    const result = await drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 3)
  })

  it('所有人都中過後再抽會明確報錯', async () => {
    const eventId = await eventWithAttendees(2)
    assert.ok((await drawPrize((await createPrize(eventId, { name: 'A', quantity: 2 })).id)).ok)

    const result = await drawPrize((await createPrize(eventId, { name: 'B', quantity: 1 })).id)
    assert.equal(result.ok, false)
    assert.match(result.error, /沒有可抽獎的參加者/)
  })

  it('結果可用公開種子重新驗算', async () => {
    const eventId = await eventWithAttendees(30)
    const prize = await createPrize(eventId, { name: '獎', quantity: 5 })
    const result = await drawPrize(prize.id)
    assert.ok(result.ok)

    const check = await verifyPrizeDraw(prize.id)
    assert.equal(check.ok, true, '重算應與公布名單一致')
    assert.equal(check.seed, result.seed)
  })

  it('加碼獎項可現場臨時新增並立刻抽', async () => {
    const eventId = await eventWithAttendees(30)
    assert.ok((await drawPrize((await createPrize(eventId, { name: '一般獎', quantity: 5 })).id)).ok)

    const bonus = await createPrize(eventId, { name: '加碼', quantity: 2, isBonus: true })
    assert.equal(bonus.isBonus, true)

    const result = await drawPrize(bonus.id)
    assert.ok(result.ok)
    assert.equal(result.poolSize, 25, '加碼時候選池應排除已中獎的 5 人')
  })

  it('候補者不會被抽到', async () => {
    seq++
    const eventId = `draw-wl-${Date.now()}-${seq}`
    await firestore.collection(COL.events).doc(eventId).set({
      title: '限額', slug: eventId, status: 'published',
      capacity: 2, waitlistEnabled: true, confirmedCount: 0, waitlistCount: 0,
      drawPool: 'all',
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
    })
    for (let i = 0; i < 5; i++) {
      await createRegistration(eventId, `u${i}`, { name: `u${i}`, phone: '0912345678' })
    }
    assert.equal((await listEligible(eventId)).length, 2, '只有報名成功的人可被抽到')

    const result = await drawPrize((await createPrize(eventId, { name: '獎', quantity: 5 })).id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 2)
  })
})
