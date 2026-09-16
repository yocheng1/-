import { COL, db, registrationId as regIdOf } from '../firebase/admin'

/**
 * 現場報到。
 *
 * 取代原本那份獨立的報到頁，並修掉它的三個問題：
 * 1. 原本用「試算表列號」認人 —— 有人插入或排序就會報到錯人。
 *    這裡用報名文件 ID（活動ID_使用者ID），永遠不會位移。
 * 2. 原本網路失敗仍回報成功。這裡寫入失敗就回傳失敗，畫面不會騙人。
 * 3. 原本完全沒有權限控管。現在報到資料需 staff 權限才讀得到（見 firestore.rules）。
 */

export type CheckinRecord = {
  id: string
  eventId: string
  registrationId: string
  userId: string
  name: string
  checkedInAt: string
  checkedInBy: string
}

function checkinId(eventId: string, registrationId: string): string {
  return `${eventId}_${registrationId}`
}

export type CheckinResult =
  | { ok: true; alreadyCheckedIn: boolean; checkedInAt: string }
  | { ok: false; error: string }

/**
 * 報到。重複點選不會出錯，會回報「已經報到過」以及原本的時間 ——
 * 現場好幾支手機同時操作時，這點很重要。
 */
export async function checkIn(
  eventId: string,
  registrationId: string,
  staffUid: string,
): Promise<CheckinResult> {
  const firestore = db()
  const regRef = firestore.collection(COL.registrations).doc(registrationId)
  const ref = firestore.collection(COL.checkins).doc(checkinId(eventId, registrationId))

  try {
    return await firestore.runTransaction(async (tx): Promise<CheckinResult> => {
      const regSnap = await tx.get(regRef)
      if (!regSnap.exists) return { ok: false, error: '找不到這筆報名紀錄。' }

      const reg = regSnap.data() as { eventId: string; userId: string; name: string; status: string }
      if (reg.eventId !== eventId) return { ok: false, error: '這筆報名不屬於這場活動。' }
      if (reg.status === 'cancelled') return { ok: false, error: '這筆報名已取消，無法報到。' }

      const existing = await tx.get(ref)
      if (existing.exists) {
        return {
          ok: true,
          alreadyCheckedIn: true,
          checkedInAt: existing.data()!.checkedInAt as string,
        }
      }

      const checkedInAt = new Date().toISOString()
      tx.set(ref, {
        eventId,
        registrationId,
        userId: reg.userId,
        name: reg.name,
        checkedInAt,
        checkedInBy: staffUid,
      })

      return { ok: true, alreadyCheckedIn: false, checkedInAt }
    })
  } catch (error) {
    // 寫入失敗就明確回報失敗，絕不回傳假的成功
    console.error('[checkin] 報到失敗：', error)
    return { ok: false, error: '報到失敗，請確認網路後再試一次。' }
  }
}

export async function undoCheckIn(
  eventId: string,
  registrationId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await db().collection(COL.checkins).doc(checkinId(eventId, registrationId)).delete()
    return { ok: true }
  } catch (error) {
    console.error('[checkin] 取消報到失敗：', error)
    return { ok: false, error: '取消報到失敗，請稍後再試。' }
  }
}

export type RosterEntry = {
  registrationId: string
  userId: string
  name: string
  phone: string
  code: string
  status: string
  checkedInAt: string | null
}

/** 現場報到名單。僅供工作人員使用（安全規則已限制）。 */
export async function listRoster(eventId: string): Promise<RosterEntry[]> {
  const firestore = db()

  const [regs, checkins] = await Promise.all([
    firestore.collection(COL.registrations).where('eventId', '==', eventId).get(),
    firestore.collection(COL.checkins).where('eventId', '==', eventId).get(),
  ])

  const checkedIn = new Map<string, string>()
  checkins.docs.forEach((d) => {
    const data = d.data() as { registrationId: string; checkedInAt: string }
    checkedIn.set(data.registrationId, data.checkedInAt)
  })

  return regs.docs
    .filter((d) => (d.data() as { status: string }).status !== 'cancelled')
    .map((d) => {
      const data = d.data() as {
        userId: string; name: string; phone: string; status: string; code?: string
      }
      return {
        registrationId: d.id,
        userId: data.userId,
        name: data.name,
        phone: data.phone,
        code: data.code ?? '',
        status: data.status,
        checkedInAt: checkedIn.get(d.id) ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
}

/** 某人在某場活動有沒有報到。 */
export async function hasCheckedIn(eventId: string, userId: string): Promise<boolean> {
  const snap = await db()
    .collection(COL.checkins)
    .doc(checkinId(eventId, regIdOf(eventId, userId)))
    .get()
  return snap.exists
}

/** 某使用者總共實際出席過幾場（集點用）。 */
export async function countAttendance(userId: string): Promise<number> {
  const snap = await db().collection(COL.checkins).where('userId', '==', userId).get()
  // 同一場活動只算一次（報到文件本來就是一場一筆，這裡再保險一次）
  return new Set(snap.docs.map((d) => d.data().eventId as string)).size
}

/**
 * 以票券代碼報到 —— 掃 QR 或工作人員手動輸入都走這裡。
 *
 * 代碼不分大小寫，也允許使用者念出來時夾雜空白或連字號。
 */
export async function checkInByCode(
  eventId: string,
  rawCode: string,
  staffUid: string,
): Promise<CheckinResult & { name?: string }> {
  const code = String(rawCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (code.length < 4) return { ok: false, error: '請輸入完整的票券代碼。' }

  const snap = await db()
    .collection(COL.registrations)
    .where('eventId', '==', eventId)
    .where('code', '==', code)
    .limit(2)
    .get()

  if (snap.empty) return { ok: false, error: '查無此票券代碼，請確認是否為本場活動。' }
  if (snap.size > 1) {
    // 理論上不會發生（8 碼、31 種字元）。真的發生就別猜，改用姓名搜尋。
    return { ok: false, error: '代碼重複，請改用姓名搜尋報到。' }
  }

  const doc = snap.docs[0]
  const result = await checkIn(eventId, doc.id, staffUid)
  return { ...result, name: (doc.data() as { name: string }).name }
}
