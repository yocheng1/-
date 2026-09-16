import { COL, db } from '../firebase/admin'
import { REWARD_THRESHOLD, REWARD_STORE } from './rewards'

export type MemberSummary = {
  userId: string
  name: string
  phone: string
  registered: number
  attended: number
  earned: number
  redeemed: number
  available: number
}

/**
 * 會員總覽。
 *
 * 目前沒有獨立的會員主檔（登入仍在既有 session），
 * 所以直接由報名、報到與兌換紀錄彙整 —— 換成 Firebase Auth 後
 * 這裡可以改讀 users 集合，其餘邏輯不用動。
 */
export async function listMembers(): Promise<MemberSummary[]> {
  const firestore = db()
  const [regs, checkins, rewards] = await Promise.all([
    firestore.collection(COL.registrations).get(),
    firestore.collection(COL.checkins).get(),
    firestore.collection(COL.rewards).get(),
  ])

  const members = new Map<string, MemberSummary>()

  const ensure = (userId: string, name: string, phone: string) => {
    if (!members.has(userId)) {
      members.set(userId, {
        userId, name, phone,
        registered: 0, attended: 0, earned: 0, redeemed: 0, available: 0,
      })
    }
    return members.get(userId)!
  }

  regs.docs.forEach((d) => {
    const data = d.data() as { userId: string; name: string; phone: string; status: string }
    const member = ensure(data.userId, data.name, data.phone)
    if (data.status !== 'cancelled') member.registered++
  })

  // 同一場活動只算一次出席
  const attendance = new Map<string, Set<string>>()
  checkins.docs.forEach((d) => {
    const data = d.data() as { userId: string; eventId: string; name: string }
    if (!attendance.has(data.userId)) attendance.set(data.userId, new Set())
    attendance.get(data.userId)!.add(data.eventId)
    ensure(data.userId, data.name, '')
  })

  const redeemed = new Map<string, number>()
  rewards.docs.forEach((d) => {
    const userId = (d.data() as { userId: string }).userId
    redeemed.set(userId, (redeemed.get(userId) ?? 0) + 1)
  })

  for (const member of members.values()) {
    member.attended = attendance.get(member.userId)?.size ?? 0
    member.earned = Math.floor(member.attended / REWARD_THRESHOLD)
    member.redeemed = redeemed.get(member.userId) ?? 0
    member.available = Math.max(0, member.earned - member.redeemed)
  }

  return [...members.values()].sort((a, b) => b.attended - a.attended)
}

export { REWARD_THRESHOLD, REWARD_STORE }
