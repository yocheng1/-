import { COL, db } from '../firebase/admin'
import { countAttendance } from './checkin'

/** 集滿幾場換一次。 */
export const REWARD_THRESHOLD = Number(process.env.REWARD_THRESHOLD ?? 3)

/** 限定兌換門市。 */
export const REWARD_STORE = process.env.REWARD_STORE ?? '林口文化門市'

export type RewardStatus = {
  /** 實際完成報到的場次 */
  attended: number
  earned: number
  redeemed: number
  available: number
  toNext: number
  threshold: number
  store: string
  history: { id: string; store: string; redeemedAt: string }[]
}

/**
 * 集點狀態。
 *
 * 算的是「實際報到」的場次，不是報名數 ——
 * 否則有人報名三場、一場都沒去，照樣換得到咖啡。
 */
export async function getRewardStatus(userId: string): Promise<RewardStatus> {
  const [attended, rewardsSnap] = await Promise.all([
    countAttendance(userId),
    db().collection(COL.rewards).where('userId', '==', userId).get(),
  ])

  const history = rewardsSnap.docs
    .map((d) => {
      const data = d.data() as { store: string; redeemedAt: string }
      return { id: d.id, store: data.store, redeemedAt: data.redeemedAt }
    })
    .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))

  const earned = Math.floor(attended / REWARD_THRESHOLD)

  return {
    attended,
    earned,
    redeemed: history.length,
    available: Math.max(0, earned - history.length),
    toNext: (REWARD_THRESHOLD - (attended % REWARD_THRESHOLD)) % REWARD_THRESHOLD,
    threshold: REWARD_THRESHOLD,
    store: REWARD_STORE,
    history,
  }
}

export type RedeemResult =
  | { ok: true; store: string; remaining: number }
  | { ok: false; error: string }

/**
 * 核銷一次獎勵。必須由工作人員操作（呼叫端需先確認 staff 權限）。
 *
 * 用固定的文件 ID（使用者_第幾杯）寫入，就算門市人員連按兩次、
 * 或兩台裝置同時核銷，也只會產生一筆。
 */
export async function redeemReward(userId: string, staffUid: string): Promise<RedeemResult> {
  const firestore = db()

  const status = await getRewardStatus(userId)
  if (status.available <= 0) {
    return { ok: false, error: '目前沒有可兌換的獎勵。' }
  }

  // 第 N 杯的文件 ID 是固定的 —— 重複核銷會撞到同一份文件而失敗
  const sequence = status.redeemed + 1
  const ref = firestore.collection(COL.rewards).doc(`${userId}_${sequence}`)

  try {
    await ref.create({
      userId,
      type: 'coffee',
      store: REWARD_STORE,
      sequence,
      attendedCount: status.attended,
      redeemedAt: new Date().toISOString(),
      redeemedBy: staffUid,
    })
    return { ok: true, store: REWARD_STORE, remaining: status.available - 1 }
  } catch {
    // create 在文件已存在時會失敗 —— 代表剛剛已經核銷過了
    return { ok: false, error: '這杯剛剛已經核銷過了，請重新整理確認。' }
  }
}
