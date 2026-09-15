import { getDb } from '../db'
import { newId, nowIso } from '../ids'
import type { EventInput } from '../validation'

export type EventStatus = 'draft' | 'published' | 'closed'

export type EventRecord = {
  id: string
  slug: string
  title: string
  summary: string
  description: string
  coverImageUrl: string | null
  location: string
  startsAt: string
  endsAt: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  /** 0 代表不限名額 */
  capacity: number
  waitlistEnabled: boolean
  status: EventStatus
  createdAt: string
  updatedAt: string
}

type EventRow = {
  id: string
  slug: string
  title: string
  summary: string
  description: string
  cover_image_url: string | null
  location: string
  starts_at: string
  ends_at: string
  registration_opens_at: string | null
  registration_closes_at: string | null
  capacity: number
  waitlist_enabled: number
  status: EventStatus
  created_at: string
  updated_at: string
}

function toEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    capacity: row.capacity,
    waitlistEnabled: row.waitlist_enabled === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function findEventById(id: string): EventRecord | null {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as
    | EventRow
    | undefined
  return row ? toEvent(row) : null
}

export function findEventBySlug(slug: string): EventRecord | null {
  const row = getDb().prepare('SELECT * FROM events WHERE slug = ?').get(slug) as
    | EventRow
    | undefined
  return row ? toEvent(row) : null
}

/** 前台活動列表：只顯示已發佈與已關閉報名的活動，草稿不外露。 */
export function listPublicEvents(): EventRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM events WHERE status IN ('published', 'closed')
       ORDER BY starts_at ASC`,
    )
    .all() as EventRow[]
  return rows.map(toEvent)
}

/** 後台列表：含草稿。 */
export function listAllEvents(): EventRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM events ORDER BY starts_at DESC')
    .all() as EventRow[]
  return rows.map(toEvent)
}

function toDbValues(input: EventInput) {
  return {
    title: input.title,
    slug: input.slug,
    summary: input.summary ?? '',
    description: input.description ?? '',
    cover_image_url: input.coverImageUrl || null,
    location: input.location ?? '',
    starts_at: new Date(input.startsAt).toISOString(),
    ends_at: new Date(input.endsAt).toISOString(),
    registration_opens_at: input.registrationOpensAt
      ? new Date(input.registrationOpensAt).toISOString()
      : null,
    registration_closes_at: input.registrationClosesAt
      ? new Date(input.registrationClosesAt).toISOString()
      : null,
    capacity: input.capacity,
    waitlist_enabled: input.waitlistEnabled ? 1 : 0,
    status: input.status,
  }
}

export function createEvent(input: EventInput): EventRecord {
  const id = newId()
  const now = nowIso()
  const v = toDbValues(input)

  getDb()
    .prepare(
      `INSERT INTO events
         (id, slug, title, summary, description, cover_image_url, location,
          starts_at, ends_at, registration_opens_at, registration_closes_at,
          capacity, waitlist_enabled, status, created_at, updated_at)
       VALUES
         (@id, @slug, @title, @summary, @description, @cover_image_url, @location,
          @starts_at, @ends_at, @registration_opens_at, @registration_closes_at,
          @capacity, @waitlist_enabled, @status, @created_at, @updated_at)`,
    )
    .run({ ...v, id, created_at: now, updated_at: now })

  return findEventById(id)!
}

export function updateEvent(id: string, input: EventInput): EventRecord | null {
  const v = toDbValues(input)

  getDb()
    .prepare(
      `UPDATE events SET
         slug = @slug, title = @title, summary = @summary, description = @description,
         cover_image_url = @cover_image_url, location = @location,
         starts_at = @starts_at, ends_at = @ends_at,
         registration_opens_at = @registration_opens_at,
         registration_closes_at = @registration_closes_at,
         capacity = @capacity, waitlist_enabled = @waitlist_enabled,
         status = @status, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({ ...v, id, updated_at: nowIso() })

  return findEventById(id)
}

export function deleteEvent(id: string): void {
  getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
}

// ---------------------------------------------------------------- 報名狀態

export type RegistrationWindow =
  | 'open'
  | 'not_published'
  | 'not_open_yet'
  | 'closed'
  | 'event_ended'

/**
 * 判斷這場活動現在能不能報名。
 * 前台按鈕文案與後端寫入前的檢查都走這個函式，避免兩邊判斷不一致。
 */
export function registrationWindow(
  event: EventRecord,
  now: Date = new Date(),
): RegistrationWindow {
  if (event.status === 'draft') return 'not_published'
  if (event.status === 'closed') return 'closed'

  if (new Date(event.endsAt).getTime() <= now.getTime()) return 'event_ended'

  if (event.registrationOpensAt && now < new Date(event.registrationOpensAt)) {
    return 'not_open_yet'
  }
  if (event.registrationClosesAt && now >= new Date(event.registrationClosesAt)) {
    return 'closed'
  }

  return 'open'
}

export const registrationWindowMessage: Record<RegistrationWindow, string> = {
  open: '開放報名中',
  not_published: '尚未開放',
  not_open_yet: '報名尚未開始',
  closed: '報名已截止',
  event_ended: '活動已結束',
}
