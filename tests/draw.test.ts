import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { useTempDatabase } from './helpers.ts'

const { cleanup } = useTempDatabase()

const { createEvent } = await import('../src/lib/repo/events.ts')
const { createRegistration } = await import('../src/lib/repo/registrations.ts')
const { createUser } = await import('../src/lib/repo/users.ts')
const {
  createPrize, drawPrize, listEligible, listWinners, listPrizeWinners,
  verifyPrizeDraw, resetPrizeDraw, findPrize,
} = await import('../src/lib/repo/draw.ts')

after(() => cleanup())

const HOUR = 60 * 60 * 1000

let seq = 0

/** 建一場活動，並讓 n 個人報名成功（抽獎的參加者就是這些人）。 */
function eventWithAttendees(n: number) {
  seq++
  const event = createEvent({
    title: '抽獎測試',
    slug: `draw-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    summary: '', description: '', location: '',
    startsAt: new Date(Date.now() + HOUR).toISOString(),
    endsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    capacity: 0, waitlistEnabled: false, status: 'published',
  } as Parameters<typeof createEvent>[0])

  for (let i = 0; i < n; i++) {
    const user = createUser({
      name: `參加者${i}`,
      phone: `+8869${String(seq).padStart(4, '0')}${String(i).padStart(4, '0')}`,
      phoneVerified: true,
    })
    const result = createRegistration(event, user.id, {
      name: `參加者${i}`,
      phone: '0912345678',
    })
    assert.ok(result.ok)
  }

  return event
}

describe('現場抽獎', () => {
  it('抽出的人數剛好等於獎項數量', () => {
    const event = eventWithAttendees(100)
    const prize = createPrize(event.id, { name: '安全帽一頂', quantity: 3 })

    const result = drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 3)
    assert.equal(result.poolSize, 100)
    assert.equal(listPrizeWinners(prize.id).length, 3)
  })

  it('中過獎的人不會再中（跨獎項）', () => {
    const event = eventWithAttendees(10)
    const first = createPrize(event.id, { name: '頭獎', quantity: 4 })
    const second = createPrize(event.id, { name: '二獎', quantity: 4 })

    const r1 = drawPrize(first.id)
    const r2 = drawPrize(second.id)
    assert.ok(r1.ok && r2.ok)

    const firstIds = r1.winners.map((w) => w.registrationId)
    const secondIds = r2.winners.map((w) => w.registrationId)

    const overlap = firstIds.filter((id) => secondIds.includes(id))
    assert.equal(overlap.length, 0, '同一個人不應該中兩次')

    // 第二次抽獎時候選池應該少掉已中獎的人
    assert.equal(r2.poolSize, 6)
  })

  it('全場每個人最多出現在中獎名單一次', () => {
    const event = eventWithAttendees(20)
    for (let i = 0; i < 4; i++) {
      const prize = createPrize(event.id, { name: `獎項${i}`, quantity: 5 })
      assert.ok(drawPrize(prize.id).ok)
    }

    const winners = listWinners(event.id)
    assert.equal(winners.length, 20)

    const unique = new Set(winners.map((w) => w.registrationId))
    assert.equal(unique.size, 20, '不應有人重複中獎')
  })

  it('參加者不足時抽出剩下的全部，不會失敗', () => {
    const event = eventWithAttendees(3)
    const prize = createPrize(event.id, { name: '大獎', quantity: 10 })

    const result = drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 3)
  })

  it('所有人都中過之後再抽會明確報錯', () => {
    const event = eventWithAttendees(2)
    const first = createPrize(event.id, { name: '獎 A', quantity: 2 })
    assert.ok(drawPrize(first.id).ok)

    const second = createPrize(event.id, { name: '獎 B', quantity: 1 })
    const result = drawPrize(second.id)
    assert.equal(result.ok, false)
    assert.match((result as { error: string }).error, /沒有可抽獎的參加者/)
  })

  it('同一個獎項不能抽兩次', () => {
    const event = eventWithAttendees(10)
    const prize = createPrize(event.id, { name: '獎', quantity: 1 })
    assert.ok(drawPrize(prize.id).ok)

    const again = drawPrize(prize.id)
    assert.equal(again.ok, false)
    assert.match((again as { error: string }).error, /已經抽過/)
  })

  it('結果可用公開種子重新驗算', () => {
    const event = eventWithAttendees(50)
    const prize = createPrize(event.id, { name: '獎', quantity: 5 })
    const result = drawPrize(prize.id)
    assert.ok(result.ok)

    const verification = verifyPrizeDraw(prize.id)
    assert.equal(verification.ok, true, '重算結果應與公布的名單一致')
    assert.equal(verification.seed, result.seed)
    assert.deepEqual(verification.actual, verification.expected)
  })

  it('加碼獎項可以在活動進行中臨時新增並立刻抽', () => {
    const event = eventWithAttendees(30)

    const normal = createPrize(event.id, { name: '一般獎', quantity: 5 })
    assert.ok(drawPrize(normal.id).ok)

    // 現場臨時加碼
    const bonus = createPrize(event.id, {
      name: '加碼！KPlus 限量聯名帽',
      quantity: 2,
      isBonus: true,
    })
    assert.equal(findPrize(bonus.id)!.isBonus, true)

    const result = drawPrize(bonus.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 2)
    assert.equal(result.poolSize, 25, '加碼時候選池應排除已中獎的 5 人')
  })

  it('重抽會清掉原本的中獎紀錄，且那些人重新有資格', () => {
    const event = eventWithAttendees(10)
    const prize = createPrize(event.id, { name: '獎', quantity: 3 })
    assert.ok(drawPrize(prize.id).ok)
    assert.equal(listEligible(event.id).length, 7)

    resetPrizeDraw(prize.id)
    assert.equal(listEligible(event.id).length, 10, '重抽後所有人恢復資格')
    assert.equal(listPrizeWinners(prize.id).length, 0)

    assert.ok(drawPrize(prize.id).ok, '重設後可以重抽')
  })

  it('候補與已取消的報名不會被抽到', () => {
    seq++
    const event = createEvent({
      title: '限額活動',
      slug: `draw-limited-${seq}`,
      summary: '', description: '', location: '',
      startsAt: new Date(Date.now() + HOUR).toISOString(),
      endsAt: new Date(Date.now() + 5 * HOUR).toISOString(),
      capacity: 2, waitlistEnabled: true, status: 'published',
    } as Parameters<typeof createEvent>[0])

    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const user = createUser({ name: `u${i}`, phone: `+88693${seq}0000${i}`, phoneVerified: true })
      const result = createRegistration(event, user.id, { name: `u${i}`, phone: '0912345678' })
      assert.ok(result.ok)
      ids.push(result.registration.id)
    }

    // capacity 2 → 2 人 confirmed、3 人 waitlist
    assert.equal(listEligible(event.id).length, 2, '只有報名成功的人可以被抽到')

    const prize = createPrize(event.id, { name: '獎', quantity: 5 })
    const result = drawPrize(prize.id)
    assert.ok(result.ok)
    assert.equal(result.winners.length, 2)
  })

  it('中獎機率分布均勻', () => {
    const rounds = 400
    const people = 10
    const wins: Record<number, number> = {}

    for (let round = 0; round < rounds; round++) {
      const event = eventWithAttendees(people)
      const eligible = listEligible(event.id)
      const prize = createPrize(event.id, { name: '獎', quantity: 1 })
      const result = drawPrize(prize.id)
      assert.ok(result.ok)

      const index = eligible.findIndex((e) => e.id === result.winners[0].registrationId)
      wins[index] = (wins[index] ?? 0) + 1
    }

    const expected = rounds / people
    for (let i = 0; i < people; i++) {
      const count = wins[i] ?? 0
      assert.ok(
        count > expected * 0.4 && count < expected * 1.6,
        `第 ${i} 位中獎 ${count} 次，偏離期望值 ${expected} 過多`,
      )
    }
  })
})
