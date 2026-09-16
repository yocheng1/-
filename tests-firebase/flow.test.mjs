/**
 * 報到 → 抽獎 → 集點 的整體流程測試。
 * 對應稽核出的三個問題：抽到沒來的人、沒有報到功能、集點算報名而非出席。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

process.env.FIREBASE_PROJECT_ID = 'demo-kplus'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
process.env.REWARD_THRESHOLD = '3'

const { db, COL, registrationId } = await import('../src/lib/firebase/admin.ts')
const { createRegistration } = await import('../src/lib/fs/registrations.ts')
const { createPrize, drawPrize, listEligible, redrawWinner } = await import('../src/lib/fs/draw.ts')
const { checkIn, undoCheckIn, listRoster, countAttendance } = await import('../src/lib/fs/checkin.ts')
const { getRewardStatus, redeemReward } = await import('../src/lib/fs/rewards.ts')

const firestore = db()
let seq = 0

async function makeEvent(n, overrides = {}) {
  seq++
  const id = `flow-${Date.now()}-${seq}`
  await firestore.collection(COL.events).doc(id).set({
    title: '流程測試', slug: id, status: 'published',
    capacity: 0, waitlistEnabled: false, confirmedCount: 0, waitlistCount: 0,
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    ...overrides,
  })
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      createRegistration(id, `u${i}`, { name: `參加者${i}`, phone: '0912345678' }),
    ),
  )
  return id
}

describe('現場報到', () => {
  it('報到後名單會標記，統計正確', async () => {
    const eventId = await makeEvent(5)
    const result = await checkIn(eventId, registrationId(eventId, 'u0'), 'staff1')
    assert.ok(result.ok)
    assert.equal(result.alreadyCheckedIn, false)

    const roster = await listRoster(eventId)
    assert.equal(roster.length, 5)
    assert.equal(roster.filter((r) => r.checkedInAt).length, 1)
  })

  it('重複點選不會出錯，回報已報到與原時間', async () => {
    const eventId = await makeEvent(3)
    const regId = registrationId(eventId, 'u0')

    const first = await checkIn(eventId, regId, 'staff1')
    assert.ok(first.ok)

    const second = await checkIn(eventId, regId, 'staff2')
    assert.ok(second.ok)
    assert.equal(second.alreadyCheckedIn, true)
    assert.equal(second.checkedInAt, first.checkedInAt, '時間應保留第一次的')
  })

  it('多支手機同時報到同一人，只會產生一筆', async () => {
    const eventId = await makeEvent(3)
    const regId = registrationId(eventId, 'u0')

    await Promise.all([
      checkIn(eventId, regId, 's1'),
      checkIn(eventId, regId, 's2'),
      checkIn(eventId, regId, 's3'),
    ])

    const snap = await firestore.collection(COL.checkins).where('eventId', '==', eventId).get()
    assert.equal(snap.size, 1)
  })

  it('已取消的報名不能報到', async () => {
    const eventId = await makeEvent(3)
    const regId = registrationId(eventId, 'u0')
    await firestore.collection(COL.registrations).doc(regId).update({ status: 'cancelled' })

    const result = await checkIn(eventId, regId, 'staff1')
    assert.equal(result.ok, false)
    assert.match(result.error, /已取消/)
  })

  it('可以取消報到', async () => {
    const eventId = await makeEvent(3)
    const regId = registrationId(eventId, 'u0')
    await checkIn(eventId, regId, 'staff1')
    assert.ok((await undoCheckIn(eventId, regId)).ok)

    const roster = await listRoster(eventId)
    assert.equal(roster.filter((r) => r.checkedInAt).length, 0)
  })
})

describe('抽獎只抽已報到的人', () => {
  it('沒報到的人不會進候選池', async () => {
    const eventId = await makeEvent(10)
    for (let i = 0; i < 4; i++) {
      await checkIn(eventId, registrationId(eventId, `u${i}`), 'staff1')
    }

    const pool = await listEligible(eventId)
    assert.equal(pool.length, 4, '只有報到的 4 人可以被抽到')

    const prize = await createPrize(eventId, { name: '獎', quantity: 10 })
    const result = await drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 4)
    assert.equal(result.poolSize, 4)
  })

  it('完全沒人報到時，給主持人明確可行動的提示', async () => {
    const eventId = await makeEvent(10)
    const prize = await createPrize(eventId, { name: '獎', quantity: 1 })

    const result = await drawPrize(prize.id)
    assert.equal(result.ok, false)
    assert.match(result.error, /還沒有人完成報到/)
    assert.match(result.error, /所有報名者/, '應告知可改為不限報到')
  })

  it('活動設為「所有報名者」時就不看報到', async () => {
    const eventId = await makeEvent(10, { drawPool: 'all' })
    const prize = await createPrize(eventId, { name: '獎', quantity: 3 })

    const result = await drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.poolSize, 10)
  })
})

describe('中獎者不在場時補抽', () => {
  it('只換掉該名額，其他中獎者不受影響', async () => {
    const eventId = await makeEvent(10)
    for (let i = 0; i < 6; i++) {
      await checkIn(eventId, registrationId(eventId, `u${i}`), 'staff1')
    }

    const prize = await createPrize(eventId, { name: '獎', quantity: 3 })
    const drawn = await drawPrize(prize.id)
    assert.ok(drawn.ok)

    const absent = drawn.winners[0]
    const others = drawn.winners.slice(1).map((w) => w.registrationId)

    const result = await redrawWinner(absent.id)
    assert.ok(result.ok)
    assert.equal(result.removedRegistrationId, absent.registrationId)
    assert.notEqual(result.replaced.registrationId, absent.registrationId)
    assert.equal(result.replaced.rank, absent.rank, '名次應沿用')

    const snap = await firestore.collection(COL.winners).where('prizeId', '==', prize.id).get()
    const ids = snap.docs.map((d) => d.data().registrationId)
    assert.equal(snap.size, 3, '中獎人數不變')
    assert.ok(others.every((id) => ids.includes(id)), '其他中獎者不受影響')
    assert.ok(!ids.includes(absent.registrationId), '不在場者已移除')
  })

  it('被換掉的人不會再被抽到', async () => {
    const eventId = await makeEvent(4)
    for (let i = 0; i < 3; i++) {
      await checkIn(eventId, registrationId(eventId, `u${i}`), 'staff1')
    }
    const prize = await createPrize(eventId, { name: '獎', quantity: 1 })
    const drawn = await drawPrize(prize.id)
    assert.ok(drawn.ok)

    const first = drawn.winners[0]
    const again = await redrawWinner(first.id)
    assert.ok(again.ok)
    assert.notEqual(again.replaced.registrationId, first.registrationId)
  })
})

describe('集點算實際出席', () => {
  it('只報名沒報到不算', async () => {
    const user = `rw-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      const eventId = await makeEvent(0)
      await createRegistration(eventId, user, { name: '車友', phone: '0912345678' })
    }
    const status = await getRewardStatus(user)
    assert.equal(status.attended, 0, '沒報到不應計入')
    assert.equal(status.available, 0)
  })

  it('報到三場可換一杯', async () => {
    const user = `rw2-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      const eventId = await makeEvent(0)
      await createRegistration(eventId, user, { name: '車友', phone: '0912345678' })
      await checkIn(eventId, registrationId(eventId, user), 'staff1')
    }

    const status = await getRewardStatus(user)
    assert.equal(status.attended, 3)
    assert.equal(status.available, 1)

    const redeemed = await redeemReward(user, 'staff1')
    assert.ok(redeemed.ok)
    assert.equal((await getRewardStatus(user)).available, 0)
  })

  it('門市人員連按兩次只會核銷一杯', async () => {
    const user = `rw3-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      const eventId = await makeEvent(0)
      await createRegistration(eventId, user, { name: '車友', phone: '0912345678' })
      await checkIn(eventId, registrationId(eventId, user), 'staff1')
    }

    const results = await Promise.all([
      redeemReward(user, 'staff1'),
      redeemReward(user, 'staff1'),
    ])
    assert.equal(results.filter((r) => r.ok).length, 1, '只應成功一次')

    const snap = await firestore.collection(COL.rewards).where('userId', '==', user).get()
    assert.equal(snap.size, 1)
  })

  it('同一場活動報到一次只算一場', async () => {
    const user = `rw4-${Date.now()}`
    const eventId = await makeEvent(0)
    await createRegistration(eventId, user, { name: '車友', phone: '0912345678' })
    await checkIn(eventId, registrationId(eventId, user), 'staff1')
    await checkIn(eventId, registrationId(eventId, user), 'staff2')

    assert.equal(await countAttendance(user), 1)
  })
})
