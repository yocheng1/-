import { COL, db } from '../firebase/admin'
import { registrationWindow, type RegistrationWindow } from './registrations'

export type EventRecord = {
  id: string
  slug: string
  title: string
  summary: string
  description: string
  location: string
  coverImageUrl: string | null
  startsAt: string
  endsAt: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  capacity: number
  waitlistEnabled: boolean
  status: 'draft' | 'published' | 'closed'
  drawPool: 'checked_in' | 'all'
  confirmedCount: number
  waitlistCount: number
}

function toEvent(id: string, data: Record<string, unknown>): EventRecord {
  return {
    id,
    slug: String(data.slug ?? id),
    title: String(data.title ?? ''),
    summary: String(data.summary ?? ''),
    description: String(data.description ?? ''),
    location: String(data.location ?? ''),
    coverImageUrl: (data.coverImageUrl as string) ?? null,
    startsAt: String(data.startsAt ?? ''),
    endsAt: String(data.endsAt ?? ''),
    registrationOpensAt: (data.registrationOpensAt as string) ?? null,
    registrationClosesAt: (data.registrationClosesAt as string) ?? null,
    capacity: Number(data.capacity ?? 0),
    waitlistEnabled: Boolean(data.waitlistEnabled),
    status: (data.status as EventRecord['status']) ?? 'draft',
    drawPool: data.drawPool === 'all' ? 'all' : 'checked_in',
    confirmedCount: Number(data.confirmedCount ?? 0),
    waitlistCount: Number(data.waitlistCount ?? 0),
  }
}

/** 前台列表：只顯示已發佈與已關閉報名的活動，草稿不外露。 */
export async function listPublicEvents(): Promise<EventRecord[]> {
  const snap = await db()
    .collection(COL.events)
    .where('status', 'in', ['published', 'closed'])
    .get()

  return snap.docs
    .map((d) => toEvent(d.id, d.data()))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** 後台列表：含草稿。 */
export async function listAllEvents(): Promise<EventRecord[]> {
  const snap = await db().collection(COL.events).get()
  return snap.docs
    .map((d) => toEvent(d.id, d.data()))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
}

export async function findEventById(id: string): Promise<EventRecord | null> {
  const snap = await db().collection(COL.events).doc(id).get()
  return snap.exists ? toEvent(snap.id, snap.data()!) : null
}

export async function findEventBySlug(slug: string): Promise<EventRecord | null> {
  const snap = await db().collection(COL.events).where('slug', '==', slug).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return toEvent(doc.id, doc.data())
}

export type Availability = {
  capacity: number
  confirmed: number
  waitlisted: number
  remaining: number | null
  isFull: boolean
}

/** 名額狀況直接讀活動文件上的計數器，不必掃整個報名集合。 */
export function getAvailability(event: EventRecord): Availability {
  const unlimited = event.capacity === 0
  return {
    capacity: event.capacity,
    confirmed: event.confirmedCount,
    waitlisted: event.waitlistCount,
    remaining: unlimited ? null : Math.max(0, event.capacity - event.confirmedCount),
    isFull: !unlimited && event.confirmedCount >= event.capacity,
  }
}

export function windowOf(event: EventRecord): RegistrationWindow {
  return registrationWindow(event)
}

/** 我的報名（含活動資訊）。 */
export type MyRegistration = {
  id: string
  eventId: string
  status: string
  name: string
  phone: string
  /** 票券短代碼，QR 編的就是這個 */
  code: string
  createdAt: string
  checkedInAt: string | null
  event: EventRecord | null
}

export async function listMyRegistrations(userId: string): Promise<MyRegistration[]> {
  const firestore = db()

  const [regs, checkins] = await Promise.all([
    firestore.collection(COL.registrations).where('userId', '==', userId).get(),
    firestore.collection(COL.checkins).where('userId', '==', userId).get(),
  ])

  const checkedIn = new Map(
    checkins.docs.map((d) => [
      d.data().registrationId as string,
      d.data().checkedInAt as string,
    ]),
  )

  const events = new Map<string, EventRecord>()
  await Promise.all(
    [...new Set(regs.docs.map((d) => d.data().eventId as string))].map(async (id) => {
      const event = await findEventById(id)
      if (event) events.set(id, event)
    }),
  )

  return regs.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        eventId: String(data.eventId),
        status: String(data.status),
        name: String(data.name),
        phone: String(data.phone),
        code: String(data.code ?? ''),
        createdAt: String(data.createdAt),
        checkedInAt: checkedIn.get(d.id) ?? null,
        event: events.get(String(data.eventId)) ?? null,
      }
    })
    .filter((r) => r.event !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function findRegistration(registrationId: string): Promise<MyRegistration | null> {
  const snap = await db().collection(COL.registrations).doc(registrationId).get()
  if (!snap.exists) return null

  const data = snap.data() as Record<string, unknown>
  const [event, checkin] = await Promise.all([
    findEventById(String(data.eventId)),
    db().collection(COL.checkins).doc(`${data.eventId}_${registrationId}`).get(),
  ])

  return {
    id: snap.id,
    eventId: String(data.eventId),
    status: String(data.status),
    name: String(data.name),
    phone: String(data.phone),
    code: String(data.code ?? ''),
    createdAt: String(data.createdAt),
    checkedInAt: checkin.exists ? (checkin.data()!.checkedInAt as string) : null,
    event,
  }
}

export type EventInput = {
  title: string
  slug: string
  summary?: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  capacity: number
  waitlistEnabled: boolean
  status: 'draft' | 'published' | 'closed'
  drawPool: 'checked_in' | 'all'
}

/** 新增或更新活動。slug 需唯一。 */
export async function saveEvent(input: EventInput, id?: string): Promise<EventRecord> {
  const firestore = db()

  const clash = await firestore.collection(COL.events).where('slug', '==', input.slug).get()
  if (clash.docs.some((d) => d.id !== id)) {
    throw new Error('這個網址代稱已經被使用了。')
  }

  const fields = {
    slug: input.slug,
    title: input.title.trim(),
    summary: (input.summary ?? '').trim(),
    description: (input.description ?? '').trim(),
    location: (input.location ?? '').trim(),
    coverImageUrl: null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt || null,
    registrationClosesAt: input.registrationClosesAt || null,
    capacity: Math.max(0, Math.floor(input.capacity)),
    waitlistEnabled: input.waitlistEnabled,
    status: input.status,
    drawPool: input.drawPool,
    updatedAt: new Date().toISOString(),
  }

  if (id) {
    await firestore.collection(COL.events).doc(id).set(fields, { merge: true })
    return (await findEventById(id))!
  }

  // 用 slug 當文件 ID，網址與資料一致，也天然防止重複
  const ref = firestore.collection(COL.events).doc(input.slug)
  await ref.set({ ...fields, confirmedCount: 0, waitlistCount: 0, createdAt: new Date().toISOString() })
  return (await findEventById(ref.id))!
}
