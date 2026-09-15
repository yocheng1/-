import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { useTempDatabase } from './helpers.ts'

const { cleanup } = useTempDatabase()

const { createEvent, registrationWindow } = await import('../src/lib/repo/events.ts')
const { createRegistration, cancelRegistration, getAvailability, listUserRegistrations } =
  await import('../src/lib/repo/registrations.ts')
const { createUser } = await import('../src/lib/repo/users.ts')

after(() => cleanup())

const HOUR = 60 * 60 * 1000

function futureEvent(overrides: Record<string, unknown> = {}) {
  const slug = `event-${Math.random().toString(36).slice(2, 10)}`
  return createEvent({
    title: '測試活動',
    slug,
    summary: '',
    description: '',
    location: '台北',
    startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    endsAt: new Date(Date.now() + 26 * HOUR).toISOString(),
    capacity: 0,
    waitlistEnabled: false,
    status: 'published',
    ...overrides,
  } as Parameters<typeof createEvent>[0])
}

function rider(n: number) {
  return createUser({ name: `車友${n}`, phone: `+8869${String(n).padStart(8, '0')}`, phoneVerified: true })
}

const form = (name: string) => ({
  name,
  phone: '+886912345678',
  email: 'rider@example.com',
  helmetSize: 'M' as const,
  emergencyContactName: '家人',
  emergencyContactPhone: '+886987654321',
  notes: '',
})

describe('報名名額控管', () => {
  it('名額未滿時報名成功並標記為 confirmed', () => {
    const event = futureEvent({ capacity: 2 })
    const result = createRegistration(event, rider(1).id, form('車友一'))

    assert.ok(result.ok)
    assert.equal(result.registration.status, 'confirmed')
    assert.equal(result.waitlisted, false)
    assert.equal(getAvailability(event).remaining, 1)
  })

  it('名額滿了且未開候補時，後續報名被拒絕', () => {
    const event = futureEvent({ capacity: 2 })
    assert.ok(createRegistration(event, rider(10).id, form('A')).ok)
    assert.ok(createRegistration(event, rider(11).id, form('B')).ok)

    const third = createRegistration(event, rider(12).id, form('C'))
    assert.equal(third.ok, false)
    assert.match((third as { error: string }).error, /名額已滿/)

    const availability = getAvailability(event)
    assert.equal(availability.confirmed, 2, '不應超收')
    assert.equal(availability.isFull, true)
  })

  it('名額滿了但有開候補時，轉為候補', () => {
    const event = futureEvent({ capacity: 1, waitlistEnabled: true })
    assert.ok(createRegistration(event, rider(20).id, form('A')).ok)

    const second = createRegistration(event, rider(21).id, form('B'))
    assert.ok(second.ok)
    assert.equal(second.registration.status, 'waitlist')
    assert.equal(second.waitlisted, true)

    const availability = getAvailability(event)
    assert.equal(availability.confirmed, 1)
    assert.equal(availability.waitlisted, 1)
  })

  it('capacity 為 0 代表不限名額', () => {
    const event = futureEvent({ capacity: 0 })
    for (let i = 30; i < 40; i++) {
      assert.ok(createRegistration(event, rider(i).id, form(`車友${i}`)).ok)
    }
    const availability = getAvailability(event)
    assert.equal(availability.remaining, null)
    assert.equal(availability.isFull, false)
    assert.equal(availability.confirmed, 10)
  })

  it('大量報名不會超收（名額上限嚴格成立）', () => {
    const capacity = 5
    const event = futureEvent({ capacity })

    let succeeded = 0
    for (let i = 100; i < 120; i++) {
      if (createRegistration(event, rider(i).id, form(`車友${i}`)).ok) succeeded++
    }

    assert.equal(succeeded, capacity, '成功筆數應剛好等於名額')
    assert.equal(getAvailability(event).confirmed, capacity)
  })
})

describe('重複報名', () => {
  it('同一個人不能重複報名同一場活動', () => {
    const event = futureEvent({ capacity: 10 })
    const user = rider(50)

    assert.ok(createRegistration(event, user.id, form('車友')).ok)

    const duplicate = createRegistration(event, user.id, form('車友'))
    assert.equal(duplicate.ok, false)
    assert.match((duplicate as { error: string }).error, /已經報名/)
    assert.equal(getAvailability(event).confirmed, 1)
  })

  it('取消之後可以重新報名', () => {
    const event = futureEvent({ capacity: 10 })
    const user = rider(51)

    const first = createRegistration(event, user.id, form('車友'))
    assert.ok(first.ok)

    assert.ok(cancelRegistration(first.registration.id, user.id).ok)

    const again = createRegistration(event, user.id, form('車友'))
    assert.ok(again.ok, '取消後應可重新報名')
    assert.equal(getAvailability(event).confirmed, 1)
  })
})

describe('取消報名與候補遞補', () => {
  it('取消確認名額時，最早的候補者自動遞補', () => {
    const event = futureEvent({ capacity: 1, waitlistEnabled: true })
    const first = rider(60)
    const second = rider(61)
    const third = rider(62)

    const r1 = createRegistration(event, first.id, form('第一位'))
    const r2 = createRegistration(event, second.id, form('第二位'))
    const r3 = createRegistration(event, third.id, form('第三位'))
    assert.ok(r1.ok && r2.ok && r3.ok)
    assert.equal(r2.registration.status, 'waitlist')
    assert.equal(r3.registration.status, 'waitlist')

    const cancelled = cancelRegistration(r1.registration.id, first.id)
    assert.ok(cancelled.ok)
    assert.equal(cancelled.promotedUserId, second.id, '應由最早候補者遞補')

    const availability = getAvailability(event)
    assert.equal(availability.confirmed, 1)
    assert.equal(availability.waitlisted, 1)
  })

  it('取消候補名額不會觸發遞補', () => {
    const event = futureEvent({ capacity: 1, waitlistEnabled: true })
    const a = rider(70)
    const b = rider(71)

    assert.ok(createRegistration(event, a.id, form('A')).ok)
    const waitlisted = createRegistration(event, b.id, form('B'))
    assert.ok(waitlisted.ok)

    const cancelled = cancelRegistration(waitlisted.registration.id, b.id)
    assert.ok(cancelled.ok)
    assert.equal(cancelled.promotedUserId, null)
  })

  it('不能取消別人的報名', () => {
    const event = futureEvent({ capacity: 10 })
    const owner = rider(80)
    const stranger = rider(81)

    const reg = createRegistration(event, owner.id, form('本人'))
    assert.ok(reg.ok)

    const attempt = cancelRegistration(reg.registration.id, stranger.id)
    assert.equal(attempt.ok, false)
    assert.match((attempt as { error: string }).error, /沒有權限/)
  })

  it('管理員可以代為取消報名', () => {
    const event = futureEvent({ capacity: 10 })
    const owner = rider(82)
    const reg = createRegistration(event, owner.id, form('本人'))
    assert.ok(reg.ok)

    assert.ok(cancelRegistration(reg.registration.id, 'some-admin-id', true).ok)
  })

  it('同一筆報名不能取消兩次', () => {
    const event = futureEvent({ capacity: 10 })
    const user = rider(83)
    const reg = createRegistration(event, user.id, form('本人'))
    assert.ok(reg.ok)

    assert.ok(cancelRegistration(reg.registration.id, user.id).ok)
    const second = cancelRegistration(reg.registration.id, user.id)
    assert.equal(second.ok, false)
  })
})

describe('報名開放時間', () => {
  it('草稿活動不能報名', () => {
    const event = futureEvent({ status: 'draft' })
    const result = createRegistration(event, rider(90).id, form('A'))
    assert.equal(result.ok, false)
  })

  it('已關閉的活動不能報名', () => {
    const event = futureEvent({ status: 'closed' })
    assert.equal(createRegistration(event, rider(91).id, form('A')).ok, false)
  })

  it('已結束的活動不能報名', () => {
    const event = futureEvent({
      startsAt: new Date(Date.now() - 48 * HOUR).toISOString(),
      endsAt: new Date(Date.now() - 24 * HOUR).toISOString(),
    })
    assert.equal(registrationWindow(event), 'event_ended')
    assert.equal(createRegistration(event, rider(92).id, form('A')).ok, false)
  })

  it('報名尚未開始時不能報名', () => {
    const event = futureEvent({
      registrationOpensAt: new Date(Date.now() + 2 * HOUR).toISOString(),
    })
    assert.equal(registrationWindow(event), 'not_open_yet')
    assert.equal(createRegistration(event, rider(93).id, form('A')).ok, false)
  })

  it('報名已截止時不能報名', () => {
    const event = futureEvent({
      registrationClosesAt: new Date(Date.now() - HOUR).toISOString(),
    })
    assert.equal(registrationWindow(event), 'closed')
    assert.equal(createRegistration(event, rider(94).id, form('A')).ok, false)
  })

  it('在開放區間內可以報名', () => {
    const event = futureEvent({
      registrationOpensAt: new Date(Date.now() - HOUR).toISOString(),
      registrationClosesAt: new Date(Date.now() + 2 * HOUR).toISOString(),
    })
    assert.equal(registrationWindow(event), 'open')
    assert.ok(createRegistration(event, rider(95).id, form('A')).ok)
  })
})

describe('我的報名紀錄', () => {
  it('列出該使用者的報名並帶出活動資訊', () => {
    const event = futureEvent({ capacity: 10, title: '陽明山團騎' })
    const user = rider(200)
    assert.ok(createRegistration(event, user.id, form('車友')).ok)

    const list = listUserRegistrations(user.id)
    assert.equal(list.length, 1)
    assert.equal(list[0].event.title, '陽明山團騎')
    assert.equal(list[0].status, 'confirmed')
  })

  it('取消過的紀錄仍會保留在列表中', () => {
    const event = futureEvent({ capacity: 10 })
    const user = rider(201)
    const reg = createRegistration(event, user.id, form('車友'))
    assert.ok(reg.ok)
    assert.ok(cancelRegistration(reg.registration.id, user.id).ok)

    const list = listUserRegistrations(user.id)
    assert.equal(list.length, 1)
    assert.equal(list[0].status, 'cancelled')
  })
})
