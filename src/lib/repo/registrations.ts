import { getDb, transaction } from '../db'
import { newId, nowIso } from '../ids'
import type { RegistrationInput } from '../validation'
import { registrationWindow, registrationWindowMessage } from './events'
import type { EventRecord } from './events'

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'cancelled'

export type Registration = {
  id: string
  eventId: string
  userId: string
  status: RegistrationStatus
  name: string
  phone: string
  email: string | null
  helmetSize: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
}

type RegistrationRow = {
  id: string
  event_id: string
  user_id: string
  status: RegistrationStatus
  name: string
  phone: string
  email: string | null
  helmet_size: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
}

function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    helmetSize: row.helmet_size,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  }
}

// ---------------------------------------------------------------- 名額計算

export function countConfirmed(eventId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'confirmed'`,
    )
    .get(eventId) as { n: number }
  return row.n
}

export function countWaitlisted(eventId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlist'`,
    )
    .get(eventId) as { n: number }
  return row.n
}

export type Availability = {
  capacity: number
  confirmed: number
  waitlisted: number
  /** capacity = 0（不限名額）時為 null */
  remaining: number | null
  isFull: boolean
}

export function getAvailability(event: EventRecord): Availability {
  const confirmed = countConfirmed(event.id)
  const waitlisted = countWaitlisted(event.id)
  const unlimited = event.capacity === 0

  return {
    capacity: event.capacity,
    confirmed,
    waitlisted,
    remaining: unlimited ? null : Math.max(0, event.capacity - confirmed),
    isFull: !unlimited && confirmed >= event.capacity,
  }
}

export function findActiveRegistration(
  eventId: string,
  userId: string,
): Registration | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM registrations
       WHERE event_id = ? AND user_id = ? AND status <> 'cancelled'`,
    )
    .get(eventId, userId) as RegistrationRow | undefined
  return row ? toRegistration(row) : null
}

// ---------------------------------------------------------------- 報名

export type RegisterResult =
  | { ok: true; registration: Registration; waitlisted: boolean }
  | { ok: false; error: string }

/**
 * 建立報名。
 *
 * 整段包在 BEGIN IMMEDIATE 交易裡：取得 write lock 之後才數人數、
 * 再決定要不要寫入，所以兩個人同時搶最後一個名額時只會有一個成功，
 * 另一個會被導到候補或看到「名額已滿」。
 *
 * 重複報名則由 registrations 的 partial unique index 兜底 ——
 * 就算判斷邏輯有漏，資料庫層也不會讓同一人在同一場活動有兩筆有效報名。
 */
export function createRegistration(
  event: EventRecord,
  userId: string,
  input: RegistrationInput,
): RegisterResult {
  return transaction((db): RegisterResult => {
    const window = registrationWindow(event)
    if (window !== 'open') {
      return { ok: false, error: `目前無法報名：${registrationWindowMessage[window]}。` }
    }

    const existing = db
      .prepare(
        `SELECT id FROM registrations
         WHERE event_id = ? AND user_id = ? AND status <> 'cancelled'`,
      )
      .get(event.id, userId) as { id: string } | undefined

    if (existing) {
      return { ok: false, error: '您已經報名過這場活動了。' }
    }

    const confirmed = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'confirmed'`,
        )
        .get(event.id) as { n: number }
    ).n

    const unlimited = event.capacity === 0
    const hasRoom = unlimited || confirmed < event.capacity

    let status: RegistrationStatus
    if (hasRoom) {
      status = 'confirmed'
    } else if (event.waitlistEnabled) {
      status = 'waitlist'
    } else {
      return { ok: false, error: '很抱歉，這場活動名額已滿。' }
    }

    const id = newId()
    const now = nowIso()

    db.prepare(
      `INSERT INTO registrations
         (id, event_id, user_id, status, name, phone, email, helmet_size,
          emergency_contact_name, emergency_contact_phone, notes,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      event.id,
      userId,
      status,
      input.name,
      input.phone,
      input.email || null,
      input.helmetSize || null,
      input.emergencyContactName || null,
      input.emergencyContactPhone || null,
      input.notes || null,
      now,
      now,
    )

    const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) as RegistrationRow

    return {
      ok: true,
      registration: toRegistration(row),
      waitlisted: status === 'waitlist',
    }
  })
}

// ---------------------------------------------------------------- 取消

export type CancelResult = { ok: true; promotedUserId: string | null } | { ok: false; error: string }

/**
 * 取消報名。
 *
 * 若取消的是「已確認」名額且該活動有候補，會自動把等最久的候補者遞補上來，
 * 同樣在同一個交易內完成，避免遞補過程被其他報名插隊。
 *
 * isAdmin 為 true 時可代為取消他人報名（後台用）。
 */
export function cancelRegistration(
  registrationId: string,
  userId: string,
  isAdmin = false,
): CancelResult {
  return transaction((db): CancelResult => {
    const row = db
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(registrationId) as RegistrationRow | undefined

    if (!row) return { ok: false, error: '找不到這筆報名紀錄。' }
    if (!isAdmin && row.user_id !== userId) {
      return { ok: false, error: '您沒有權限取消這筆報名。' }
    }
    if (row.status === 'cancelled') {
      return { ok: false, error: '這筆報名已經取消過了。' }
    }

    const now = nowIso()
    db.prepare(
      `UPDATE registrations SET status = 'cancelled', cancelled_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, now, registrationId)

    // 空出來的是確認名額，才需要遞補候補者
    if (row.status !== 'confirmed') {
      return { ok: true, promotedUserId: null }
    }

    const event = db.prepare('SELECT capacity FROM events WHERE id = ?').get(row.event_id) as
      | { capacity: number }
      | undefined
    if (!event || event.capacity === 0) {
      return { ok: true, promotedUserId: null }
    }

    const confirmed = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'confirmed'`,
        )
        .get(row.event_id) as { n: number }
    ).n

    if (confirmed >= event.capacity) return { ok: true, promotedUserId: null }

    const next = db
      .prepare(
        `SELECT id, user_id FROM registrations
         WHERE event_id = ? AND status = 'waitlist'
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get(row.event_id) as { id: string; user_id: string } | undefined

    if (!next) return { ok: true, promotedUserId: null }

    db.prepare(
      `UPDATE registrations SET status = 'confirmed', updated_at = ? WHERE id = ?`,
    ).run(now, next.id)

    return { ok: true, promotedUserId: next.user_id }
  })
}

// ---------------------------------------------------------------- 查詢

export type RegistrationWithEvent = Registration & {
  event: Pick<EventRecord, 'id' | 'slug' | 'title' | 'startsAt' | 'endsAt' | 'location' | 'status'>
}

/** 我的報名紀錄，最新的排前面。 */
export function listUserRegistrations(userId: string): RegistrationWithEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*,
              e.id AS e_id, e.slug AS e_slug, e.title AS e_title,
              e.starts_at AS e_starts_at, e.ends_at AS e_ends_at,
              e.location AS e_location, e.status AS e_status
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(userId) as (RegistrationRow & Record<string, string>)[]

  return rows.map((row) => ({
    ...toRegistration(row),
    event: {
      id: row.e_id,
      slug: row.e_slug,
      title: row.e_title,
      startsAt: row.e_starts_at,
      endsAt: row.e_ends_at,
      location: row.e_location,
      status: row.e_status as EventRecord['status'],
    },
  }))
}

/** 後台：某場活動的報名名單。確認者在前、候補次之、取消最後。 */
export function listEventRegistrations(eventId: string): Registration[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM registrations WHERE event_id = ?
       ORDER BY
         CASE status WHEN 'confirmed' THEN 0 WHEN 'waitlist' THEN 1 ELSE 2 END,
         created_at ASC`,
    )
    .all(eventId) as RegistrationRow[]
  return rows.map(toRegistration)
}
