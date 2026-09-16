import { FieldValue } from 'firebase-admin/firestore'
import { COL, db, registrationId } from '../firebase/admin'
import { normalizePhone } from '../validation'

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'entered' | 'cancelled'

export type RegisterInput = {
  name: string
  phone: string
  email?: string
  helmetSize?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  notes?: string
}

export type RegisterResult =
  | { ok: true; id: string; status: RegistrationStatus }
  | { ok: false; error: string }

/**
 * 建立報名。
 *
 * ── 名額為什麼不會超收 ──
 * Firestore 的交易會在「讀到的資料被別人改動時」自動重試，
 * 所以把「讀活動的已確認人數 → 判斷 → 寫入並累加人數」放在同一個交易裡，
 * 兩個人同時搶最後一個名額時，後成功的那筆會重跑一次並讀到新的人數。
 *
 * 人數存在活動文件的 confirmedCount 欄位，而不是每次去數報名筆數 ——
 * Firestore 的交易沒辦法可靠地做聚合查詢，而且活動一大就會很慢。
 *
 * ── 重複報名 ──
 * 文件 ID 固定為「活動ID_使用者ID」，同一人不可能有第二份文件。
 */
export async function createRegistration(
  eventId: string,
  userId: string,
  input: RegisterInput,
): Promise<RegisterResult> {
  const phone = normalizePhone(input.phone)
  if (!input.name?.trim()) return { ok: false, error: '請輸入姓名。' }
  if (!phone) return { ok: false, error: '手機號碼格式不正確。' }

  const firestore = db()
  const eventRef = firestore.collection(COL.events).doc(eventId)
  const regRef = firestore.collection(COL.registrations).doc(registrationId(eventId, userId))

  try {
    return await firestore.runTransaction(async (tx): Promise<RegisterResult> => {
      const eventSnap = await tx.get(eventRef)
      if (!eventSnap.exists) return { ok: false, error: '找不到這場活動。' }

      const event = eventSnap.data() as {
        status: string
        capacity: number
        waitlistEnabled: boolean
        allocationMode?: string
        confirmedCount?: number
        registrationOpensAt?: string
        registrationClosesAt?: string
        endsAt?: string
      }

      const window = registrationWindow(event)
      if (window !== 'open') {
        return { ok: false, error: `目前無法報名：${WINDOW_LABEL[window]}。` }
      }

      const existing = await tx.get(regRef)
      if (existing.exists && existing.data()!.status !== 'cancelled') {
        return { ok: false, error: '您已經報名過這場活動了。' }
      }

      const confirmed = event.confirmedCount ?? 0
      const unlimited = event.capacity === 0

      let status: RegistrationStatus
      if (event.allocationMode === 'lottery') {
        // 抽籤：報名期間只登記，截止後才抽 —— 不需要判斷名額
        status = 'entered'
      } else if (unlimited || confirmed < event.capacity) {
        status = 'confirmed'
      } else if (event.waitlistEnabled) {
        status = 'waitlist'
      } else {
        return { ok: false, error: '很抱歉，這場活動名額已滿。' }
      }

      const now = new Date().toISOString()

      tx.set(regRef, {
        eventId,
        userId,
        status,
        name: input.name.trim(),
        phone,
        email: (input.email ?? '').trim().toLowerCase() || null,
        helmetSize: input.helmetSize || null,
        emergencyContactName: (input.emergencyContactName ?? '').trim() || null,
        emergencyContactPhone: normalizePhone(input.emergencyContactPhone ?? '') || null,
        notes: (input.notes ?? '').trim() || null,
        createdAt: existing.exists ? existing.data()!.createdAt : now,
        updatedAt: now,
        cancelledAt: null,
      })

      if (status === 'confirmed') {
        tx.update(eventRef, { confirmedCount: FieldValue.increment(1) })
      } else if (status === 'waitlist') {
        tx.update(eventRef, { waitlistCount: FieldValue.increment(1) })
      }

      return { ok: true, id: regRef.id, status }
    })
  } catch (error) {
    console.error('[registration] 交易失敗：', error)
    return { ok: false, error: '報名失敗，請稍後再試。' }
  }
}

export type CancelResult =
  | { ok: true; promotedRegistrationId: string | null }
  | { ok: false; error: string }

/**
 * 取消報名。若空出來的是確認名額且有候補，同一個交易內自動遞補。
 */
export async function cancelRegistration(
  eventId: string,
  userId: string,
  actorUserId: string,
  isStaff = false,
): Promise<CancelResult> {
  const firestore = db()
  const eventRef = firestore.collection(COL.events).doc(eventId)
  const regRef = firestore.collection(COL.registrations).doc(registrationId(eventId, userId))

  // 候補名單在交易外先查好 —— Firestore 交易裡不能跑查詢
  const waitlistSnap = await firestore
    .collection(COL.registrations)
    .where('eventId', '==', eventId)
    .where('status', '==', 'waitlist')
    .get()

  type WaitlistEntry = { id: string; drawRank?: number; createdAt?: string }

  const waitlist: WaitlistEntry[] = waitlistSnap.docs
    .map((d) => {
      const data = d.data() as { drawRank?: number; createdAt?: string }
      return { id: d.id, drawRank: data.drawRank, createdAt: data.createdAt }
    })
    // 抽過籤的活動照抽籤名次遞補；先到先得的照報名時間
    .sort((a, b) => {
      const rankA = Number(a.drawRank ?? 0)
      const rankB = Number(b.drawRank ?? 0)
      if (rankA && rankB) return rankA - rankB
      return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    })

  try {
    return await firestore.runTransaction(async (tx): Promise<CancelResult> => {
      const snap = await tx.get(regRef)
      if (!snap.exists) return { ok: false, error: '找不到這筆報名紀錄。' }

      const reg = snap.data() as { userId: string; status: RegistrationStatus }
      if (!isStaff && reg.userId !== actorUserId) {
        return { ok: false, error: '您沒有權限取消這筆報名。' }
      }
      if (reg.status === 'cancelled') {
        return { ok: false, error: '這筆報名已經取消過了。' }
      }

      const eventSnap = await tx.get(eventRef)
      const event = eventSnap.data() as { capacity: number; confirmedCount?: number }

      const now = new Date().toISOString()
      tx.update(regRef, { status: 'cancelled', cancelledAt: now, updatedAt: now })

      if (reg.status !== 'confirmed') {
        if (reg.status === 'waitlist') {
          tx.update(eventRef, { waitlistCount: FieldValue.increment(-1) })
        }
        return { ok: true, promotedRegistrationId: null }
      }

      const confirmedAfter = (event.confirmedCount ?? 1) - 1

      // 名額有上限、還有候補、且確實空出位子 → 遞補最前面那位
      const next =
        event.capacity > 0 && confirmedAfter < event.capacity
          ? waitlist.find((w) => w.id !== regRef.id)
          : undefined

      if (!next) {
        tx.update(eventRef, { confirmedCount: FieldValue.increment(-1) })
        return { ok: true, promotedRegistrationId: null }
      }

      tx.update(firestore.collection(COL.registrations).doc(next.id), {
        status: 'confirmed',
        updatedAt: now,
      })
      // 一出一進，確認人數不變；候補少一位
      tx.update(eventRef, { waitlistCount: FieldValue.increment(-1) })

      return { ok: true, promotedRegistrationId: next.id }
    })
  } catch (error) {
    console.error('[registration] 取消失敗：', error)
    return { ok: false, error: '取消失敗，請稍後再試。' }
  }
}

// ---------------------------------------------------------------- 報名開放時間

export type RegistrationWindow =
  | 'open' | 'not_published' | 'not_open_yet' | 'closed' | 'event_ended'

export const WINDOW_LABEL: Record<RegistrationWindow, string> = {
  open: '開放報名中',
  not_published: '尚未開放',
  not_open_yet: '報名尚未開始',
  closed: '報名已截止',
  event_ended: '活動已結束',
}

export function registrationWindow(
  // Firestore 的空值慣例是 null，所以這裡兩種都接受
  event: {
    status: string
    endsAt?: string | null
    registrationOpensAt?: string | null
    registrationClosesAt?: string | null
  },
  now: Date = new Date(),
): RegistrationWindow {
  const at = now.getTime()
  if (event.status === 'draft') return 'not_published'
  if (event.status === 'closed') return 'closed'
  if (event.endsAt && new Date(event.endsAt).getTime() <= at) return 'event_ended'
  if (event.registrationOpensAt && at < new Date(event.registrationOpensAt).getTime()) {
    return 'not_open_yet'
  }
  if (event.registrationClosesAt && at >= new Date(event.registrationClosesAt).getTime()) {
    return 'closed'
  }
  return 'open'
}
