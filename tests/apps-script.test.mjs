import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { loadAppsScript } from './gas-mocks.mjs'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let gas

function makeEvent(overrides = {}) {
  return gas.saveEvent_({
    title: '測試活動',
    slug: 'e-' + Math.random().toString(36).slice(2, 10),
    startsAt: new Date(Date.now() + DAY).toISOString(),
    endsAt: new Date(Date.now() + DAY + 3 * HOUR).toISOString(),
    capacity: 0,
    status: 'published',
    ...overrides,
  })
}

const form = (name) => ({ name, phone: '0912345678' })

function register(event, userId, name = '車友') {
  return gas.createRegistration_(event, userId, form(name))
}

beforeEach(() => {
  gas = loadAppsScript().gas
})

describe('Apps Script：手機號碼正規化', () => {
  it('接受常見台灣格式', () => {
    assert.equal(gas.normalizePhone_('0912345678'), '+886912345678')
    assert.equal(gas.normalizePhone_('0912-345-678'), '+886912345678')
    assert.equal(gas.normalizePhone_('+886912345678'), '+886912345678')
    assert.equal(gas.normalizePhone_('886912345678'), '+886912345678')
  })

  it('格式錯誤回傳 null，空值回傳空字串', () => {
    assert.equal(gas.normalizePhone_('0212345678'), null)
    assert.equal(gas.normalizePhone_('091234567'), null)
    assert.equal(gas.normalizePhone_(''), '')
    assert.equal(gas.normalizePhone_(null), '')
  })
})

describe('Apps Script：先到先得的名額控管', () => {
  it('大量報名不會超收', () => {
    const event = makeEvent({ capacity: 5 })
    let ok = 0
    for (let i = 0; i < 50; i++) {
      if (register(event, 'user-' + i).ok) ok++
    }
    assert.equal(ok, 5, '成功筆數應剛好等於名額')
    assert.equal(gas.getAvailability_(event).confirmed, 5)
  })

  it('額滿且未開候補時被拒絕', () => {
    const event = makeEvent({ capacity: 1 })
    assert.ok(register(event, 'a').ok)
    const second = register(event, 'b')
    assert.equal(second.ok, false)
    assert.match(second.error, /名額已滿/)
  })

  it('額滿但有開候補時轉為候補', () => {
    const event = makeEvent({ capacity: 1, waitlistEnabled: true })
    assert.ok(register(event, 'a').ok)
    const second = register(event, 'b')
    assert.ok(second.ok)
    assert.equal(second.registration.status, 'waitlist')
  })

  it('同一人不能重複報名，取消後可重報', () => {
    const event = makeEvent({ capacity: 10 })
    const first = register(event, 'same')
    assert.ok(first.ok)
    assert.equal(register(event, 'same').ok, false)

    assert.ok(gas.cancelRegistration_(first.registration.id, 'same', false).ok)
    assert.ok(register(event, 'same').ok, '取消後應可重新報名')
    assert.equal(gas.getAvailability_(event).confirmed, 1)
  })

  it('取消確認名額時由最早的候補者遞補', () => {
    const event = makeEvent({ capacity: 1, waitlistEnabled: true })
    const r1 = register(event, 'first')
    const r2 = register(event, 'second')
    const r3 = register(event, 'third')
    assert.equal(r2.registration.status, 'waitlist')
    assert.equal(r3.registration.status, 'waitlist')

    const cancelled = gas.cancelRegistration_(r1.registration.id, 'first', false)
    assert.ok(cancelled.ok)
    assert.equal(cancelled.promotedUserId, 'second')
  })

  it('不能取消別人的報名，管理員可以', () => {
    const event = makeEvent({ capacity: 5 })
    const reg = register(event, 'owner')
    assert.equal(gas.cancelRegistration_(reg.registration.id, 'stranger', false).ok, false)
    assert.ok(gas.cancelRegistration_(reg.registration.id, 'admin', true).ok)
  })

  it('草稿／已結束的活動不能報名', () => {
    assert.equal(register(makeEvent({ status: 'draft' }), 'u').ok, false)
    const ended = makeEvent({
      startsAt: new Date(Date.now() - 2 * DAY).toISOString(),
      endsAt: new Date(Date.now() - DAY).toISOString(),
    })
    assert.equal(gas.registrationWindow_(ended), 'event_ended')
    assert.equal(register(ended, 'u').ok, false)
  })
})

describe('Apps Script：抽籤', () => {
  function lotteryEvent(capacity) {
    return makeEvent({ capacity, allocationMode: 'lottery' })
  }

  it('報名期間一律登記，不會因為額滿被擋下', () => {
    const event = lotteryEvent(10)
    for (let i = 0; i < 50; i++) {
      const result = register(event, 'u' + i)
      assert.ok(result.ok, '第 ' + i + ' 人應該可以登記')
      assert.equal(result.registration.status, 'entered')
    }
    const availability = gas.getAvailability_(event)
    assert.equal(availability.entered, 50)
    assert.equal(availability.isFull, false, '抽籤活動在開抽前不會顯示額滿')
  })

  it('抽籤後錄取人數剛好等於名額', () => {
    const event = lotteryEvent(10)
    for (let i = 0; i < 50; i++) register(event, 'u' + i)

    const result = gas.drawLottery_(event.id, false)
    assert.ok(result.ok)
    assert.equal(result.total, 50)
    assert.equal(result.confirmed, 10)
    assert.equal(result.waitlisted, 40)

    const after = gas.getAvailability_(gas.findEventById_(event.id))
    assert.equal(after.confirmed, 10)
    assert.equal(after.waitlisted, 40)
    assert.equal(after.entered, 0, '抽完後不該再有待抽籤的人')
  })

  it('報名人數少於名額時全部錄取', () => {
    const event = lotteryEvent(10)
    for (let i = 0; i < 3; i++) register(event, 'u' + i)
    const result = gas.drawLottery_(event.id, false)
    assert.equal(result.confirmed, 3)
    assert.equal(result.waitlisted, 0)
  })

  it('結果可用公開種子重新驗算', () => {
    const event = lotteryEvent(5)
    for (let i = 0; i < 20; i++) register(event, 'u' + i)
    gas.drawLottery_(event.id, false)

    const verification = gas.verifyLottery_(event.id)
    assert.equal(verification.ok, true, '重算結果應與儲存的名次一致')
    assert.equal(verification.checked, 20)
    assert.equal(verification.mismatches.length, 0)
    assert.ok(verification.seed)
  })

  it('不能重複抽籤，除非明確強制重抽', () => {
    const event = lotteryEvent(5)
    for (let i = 0; i < 10; i++) register(event, 'u' + i)
    assert.ok(gas.drawLottery_(event.id, false).ok)

    const again = gas.drawLottery_(event.id, false)
    assert.equal(again.ok, false)
    assert.match(again.error, /已經抽過籤/)

    assert.ok(gas.drawLottery_(event.id, true).ok, '強制重抽應該可以')
  })

  it('重抽不會把已自行取消的人放回名單', () => {
    const event = lotteryEvent(5)
    const regs = []
    for (let i = 0; i < 10; i++) regs.push(register(event, 'u' + i).registration)
    gas.drawLottery_(event.id, false)

    gas.cancelRegistration_(regs[0].id, 'u0', true)
    const redraw = gas.drawLottery_(event.id, true)
    assert.equal(redraw.total, 9, '取消的人不應再參與重抽')
  })

  it('抽籤後的候補遞補依抽籤名次，不是報名時間', () => {
    const event = lotteryEvent(1)
    for (let i = 0; i < 10; i++) register(event, 'u' + i)
    gas.drawLottery_(event.id, false)

    const rows = gas.listEventRegistrations_(event.id)
    const winner = rows.filter((r) => r.status === 'confirmed')[0]
    const waitlist = rows
      .filter((r) => r.status === 'waitlist')
      .sort((a, b) => Number(a.drawRank) - Number(b.drawRank))

    const expectedNext = waitlist[0]
    const cancelled = gas.cancelRegistration_(winner.id, winner.userId, false)

    assert.ok(cancelled.ok)
    assert.equal(
      cancelled.promotedRegistrationId,
      expectedNext.id,
      '應由抽籤名次最前面的候補者遞補',
    )
  })

  it('同一組種子產生的順序完全相同（結果可重現）', () => {
    const event = lotteryEvent(5)
    for (let i = 0; i < 20; i++) register(event, 'u' + i)
    gas.drawLottery_(event.id, false)

    const first = gas.listEventRegistrations_(event.id)
      .map((r) => r.id + ':' + r.drawRank).sort().join('|')

    // 用同一顆種子重抽，名次應一模一樣
    const seed = gas.findEventById_(event.id).drawSeed
    gas.tableUpdateById_(gas.SHEET_EVENTS, event.id, { drawnAt: '' })
    gas.drawLottery_(event.id, false)

    const second = gas.listEventRegistrations_(event.id)
      .map((r) => r.id + ':' + r.drawRank).sort().join('|')

    assert.equal(gas.findEventById_(event.id).drawSeed, seed, '種子應沿用')
    assert.equal(second, first, '同種子應得到相同名次')
  })

  it('抽籤結果分布均勻（不同種子下各人中籤機率相近）', () => {
    const wins = {}
    const people = 10
    const rounds = 600

    for (let round = 0; round < rounds; round++) {
      const local = loadAppsScript().gas
      const event = local.saveEvent_({
        title: 'x', slug: 'x' + round,
        startsAt: new Date(Date.now() + DAY).toISOString(),
        endsAt: new Date(Date.now() + DAY + HOUR).toISOString(),
        capacity: 1, status: 'published', allocationMode: 'lottery',
      })
      const ids = []
      for (let i = 0; i < people; i++) {
        ids.push(local.createRegistration_(event, 'u' + i, form('n')).registration.id)
      }
      local.drawLottery_(event.id, false)
      const winner = local.listEventRegistrations_(event.id)
        .filter((r) => r.status === 'confirmed')[0]
      const index = ids.indexOf(winner.id)
      wins[index] = (wins[index] || 0) + 1
    }

    const expected = rounds / people // 60
    for (let i = 0; i < people; i++) {
      const count = wins[i] || 0
      // 容許相當寬的區間，只要確認沒有系統性偏袒某個位置
      assert.ok(
        count > expected * 0.4 && count < expected * 1.6,
        `第 ${i} 位中籤 ${count} 次，偏離期望值 ${expected} 過多`,
      )
    }
  })
})
