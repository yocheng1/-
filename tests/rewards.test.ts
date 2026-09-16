import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { useTempDatabase } from './helpers.ts'

const { cleanup } = useTempDatabase()
process.env.STAFF_PIN = '4321'
process.env.REWARD_STORE = '林口文化門市'

const { createEvent, updateEvent, findEventById } = await import('../src/lib/repo/events.ts')
const { createRegistration, cancelRegistration } = await import('../src/lib/repo/registrations.ts')
const { createUser } = await import('../src/lib/repo/users.ts')
const { getRewardStatus, redeemReward } = await import('../src/lib/repo/rewards.ts')

after(() => cleanup())

const DAY = 24 * 60 * 60 * 1000
let seq = 0

function makeEvent() {
  seq++
  return createEvent({
    title: '活動',
    slug: `reward-${seq}`,
    summary: '', description: '', location: '',
    startsAt: new Date(Date.now() + 2 * DAY).toISOString(),
    endsAt: new Date(Date.now() + 2 * DAY + 60 * 60 * 1000).toISOString(),
    capacity: 0, waitlistEnabled: false, status: 'published',
  } as Parameters<typeof createEvent>[0])
}

/**
 * 報名並（可選）把活動時間改到過去。
 *
 * 不能直接建立一場已結束的活動再報名 —— 系統本來就會擋下對已結束活動的報名，
 * 所以要先在開放期間報名，再把活動時間往前調，模擬「活動已經辦完」。
 */
function attend(user: { id: string }, count: number, past = true) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const event = makeEvent()
    const result = createRegistration(event, user.id, { name: '車友', phone: '0912345678' })
    assert.ok(result.ok)
    ids.push(result.registration.id)

    if (past) {
      const current = findEventById(event.id)!
      updateEvent(event.id, {
        title: current.title,
        slug: current.slug,
        summary: current.summary,
        description: current.description,
        location: current.location,
        startsAt: new Date(Date.now() - 2 * DAY).toISOString(),
        endsAt: new Date(Date.now() - 2 * DAY + 60 * 60 * 1000).toISOString(),
        capacity: current.capacity,
        waitlistEnabled: current.waitlistEnabled,
        status: current.status,
      } as Parameters<typeof updateEvent>[1])
    }
  }
  return ids
}

function rider() {
  seq++
  return createUser({ name: '車友', phone: `+8869520000${String(seq).padStart(2, '0')}`, phoneVerified: true })
}

describe('集點換咖啡', () => {
  it('參加 3 場已結束的活動就可以兌換 1 杯', () => {
    const user = rider()
    attend(user, 3)

    const status = getRewardStatus(user.id)
    assert.equal(status.qualifying, 3)
    assert.equal(status.available, 1)
    assert.equal(status.store, '林口文化門市')
  })

  it('還沒結束的活動不算 —— 不能先報名未來三場就換咖啡', () => {
    const user = rider()
    attend(user, 3, false)

    const status = getRewardStatus(user.id)
    assert.equal(status.qualifying, 0, '未來的活動不應計入')
    assert.equal(status.available, 0)
  })

  it('取消的報名不算', () => {
    const user = rider()
    const ids = attend(user, 3)
    assert.ok(cancelRegistration(ids[0], user.id).ok)

    assert.equal(getRewardStatus(user.id).qualifying, 2)
    assert.equal(getRewardStatus(user.id).available, 0)
  })

  it('不足 3 場時顯示還差幾場', () => {
    const user = rider()
    attend(user, 1)
    const status = getRewardStatus(user.id)
    assert.equal(status.available, 0)
    assert.equal(status.toNext, 2)
  })

  it('工作人員密碼錯誤不能兌換', () => {
    const user = rider()
    attend(user, 3)

    const result = redeemReward(user.id, '0000')
    assert.equal(result.ok, false)
    assert.match((result as { error: string }).error, /密碼不正確/)
    assert.equal(getRewardStatus(user.id).available, 1, '失敗不應消耗點數')
  })

  it('密碼正確可以兌換，且不能重複兌換', () => {
    const user = rider()
    attend(user, 3)

    const first = redeemReward(user.id, '4321')
    assert.ok(first.ok)
    assert.equal(first.store, '林口文化門市')
    assert.equal(getRewardStatus(user.id).available, 0)

    const second = redeemReward(user.id, '4321')
    assert.equal(second.ok, false)
    assert.match((second as { error: string }).error, /沒有可兌換/)
  })

  it('參加 6 場可以換 2 杯', () => {
    const user = rider()
    attend(user, 6)
    assert.equal(getRewardStatus(user.id).available, 2)

    assert.ok(redeemReward(user.id, '4321').ok)
    assert.equal(getRewardStatus(user.id).available, 1)
    assert.ok(redeemReward(user.id, '4321').ok)
    assert.equal(getRewardStatus(user.id).available, 0)
  })

  it('兌換後再參加 3 場可以再換一杯', () => {
    const user = rider()
    attend(user, 3)
    assert.ok(redeemReward(user.id, '4321').ok)
    assert.equal(getRewardStatus(user.id).available, 0)

    attend(user, 3)
    assert.equal(getRewardStatus(user.id).qualifying, 6)
    assert.equal(getRewardStatus(user.id).available, 1)
  })

  it('兌換紀錄會留存，可供對帳', () => {
    const user = rider()
    attend(user, 3)
    assert.ok(redeemReward(user.id, '4321').ok)

    const history = getRewardStatus(user.id).history
    assert.equal(history.length, 1)
    assert.equal(history[0].store, '林口文化門市')
    assert.ok(history[0].redeemedAt)
  })
})
