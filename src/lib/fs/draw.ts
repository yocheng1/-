import { createHash, randomBytes } from 'node:crypto'
import { COL, db, winnerId } from '../firebase/admin'

export type Prize = {
  id: string
  eventId: string
  name: string
  description: string
  quantity: number
  isBonus: boolean
  sortOrder: number
  drawSeed: string | null
  drawnAt: string | null
}

export type Winner = {
  id: string
  eventId: string
  prizeId: string
  registrationId: string
  name: string
  /** 只存遮罩後的電話 —— 這份文件是公開可讀的 */
  maskedPhone: string
  rank: number
}

/** 0912345678 → 0912***678 */
export function maskPhone(phone: string): string {
  const local = phone.startsWith('+886') ? `0${phone.slice(4)}` : phone
  if (local.length < 7) return '***'
  return `${local.slice(0, 4)}***${local.slice(-3)}`
}

export async function createPrize(
  eventId: string,
  input: { name: string; description?: string; quantity: number; isBonus?: boolean },
): Promise<Prize> {
  const firestore = db()

  const existing = await firestore.collection(COL.prizes).where('eventId', '==', eventId).get()
  const sortOrder = existing.size + 1

  const ref = firestore.collection(COL.prizes).doc()
  const prize = {
    eventId,
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    quantity: Math.max(1, Math.floor(input.quantity)),
    isBonus: Boolean(input.isBonus),
    sortOrder,
    drawSeed: null,
    drawnAt: null,
    createdAt: new Date().toISOString(),
  }
  await ref.set(prize)
  return { id: ref.id, ...prize }
}

/** 還沒中過獎的參加者 —— 一場活動每人最多中一次。 */
export async function listEligible(
  eventId: string,
): Promise<{ registrationId: string; name: string; phone: string }[]> {
  const firestore = db()

  const [regs, winners] = await Promise.all([
    firestore
      .collection(COL.registrations)
      .where('eventId', '==', eventId)
      .where('status', '==', 'confirmed')
      .get(),
    firestore.collection(COL.winners).where('eventId', '==', eventId).get(),
  ])

  const alreadyWon = new Set(winners.docs.map((d) => d.data().registrationId as string))

  return regs.docs
    .filter((d) => !alreadyWon.has(d.id))
    .map((d) => {
      const data = d.data() as { name: string; phone: string }
      return { registrationId: d.id, name: data.name, phone: data.phone }
    })
}

export type DrawResult =
  | { ok: true; winners: Winner[]; seed: string; poolSize: number }
  | { ok: false; error: string }

/**
 * 抽出某個獎項的中獎者。
 *
 * 公平性：順序不是用 Math.random()，而是
 *     排序鍵 = SHA256(種子 + ':' + 報名編號)
 * 由小到大排序。種子存在獎項文件上，事後公開即可讓任何人重算驗證。
 *
 * 防重複：中獎文件的 ID 固定為「活動ID_報名ID」，且用 create 寫入
 * （文件已存在就會失敗），所以同一人在同一場活動不可能中兩次。
 */
export async function drawPrize(prizeId: string): Promise<DrawResult> {
  const firestore = db()
  const prizeRef = firestore.collection(COL.prizes).doc(prizeId)

  const prizeSnap = await prizeRef.get()
  if (!prizeSnap.exists) return { ok: false, error: '找不到這個獎項。' }

  const prize = prizeSnap.data() as { eventId: string; quantity: number; drawnAt: string | null }
  if (prize.drawnAt) return { ok: false, error: '這個獎項已經抽過了。' }

  // 查詢不能放在交易裡，所以先取候選名單
  const pool = await listEligible(prize.eventId)
  if (pool.length === 0) {
    return { ok: false, error: '沒有可抽獎的參加者了（所有人都已中獎或沒有人報名）。' }
  }

  const seed = randomBytes(16).toString('hex')

  const ordered = pool
    .map((entry) => ({
      entry,
      key: createHash('sha256').update(`${seed}:${entry.registrationId}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.min(prize.quantity, pool.length))

  const now = new Date().toISOString()

  try {
    const winners = await firestore.runTransaction(async (tx): Promise<Winner[]> => {
      // 交易內再確認一次，避免兩個人同時按下抽獎
      const fresh = await tx.get(prizeRef)
      if (fresh.data()?.drawnAt) throw new Error('ALREADY_DRAWN')

      const created: Winner[] = []

      ordered.forEach((item, index) => {
        const id = winnerId(prize.eventId, item.entry.registrationId)
        const ref = firestore.collection(COL.winners).doc(id)

        const winner = {
          eventId: prize.eventId,
          prizeId,
          registrationId: item.entry.registrationId,
          name: item.entry.name,
          // 完整電話不寫進來 —— 這份文件公開可讀
          maskedPhone: maskPhone(item.entry.phone),
          rank: index + 1,
          createdAt: now,
        }

        // create：文件已存在就整筆交易失敗，等於唯一索引
        tx.create(ref, winner)
        created.push({ id, ...winner })
      })

      tx.update(prizeRef, { drawSeed: seed, drawnAt: now })

      return created
    })

    return { ok: true, winners, seed, poolSize: pool.length }
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_DRAWN') {
      return { ok: false, error: '這個獎項已經抽過了。' }
    }
    console.error('[draw] 抽獎失敗：', error)
    return { ok: false, error: '抽獎失敗，請稍後再試。' }
  }
}

/** 用公開的種子重算一次，核對名單沒有被竄改。 */
export async function verifyPrizeDraw(prizeId: string): Promise<{
  ok: boolean
  reason?: string
  seed?: string
  expected?: string[]
  actual?: string[]
}> {
  const firestore = db()
  const prizeSnap = await firestore.collection(COL.prizes).doc(prizeId).get()
  if (!prizeSnap.exists) return { ok: false, reason: '找不到這個獎項。' }

  const prize = prizeSnap.data() as {
    eventId: string
    quantity: number
    drawSeed: string | null
    drawnAt: string | null
  }
  if (!prize.drawnAt || !prize.drawSeed) return { ok: false, reason: '這個獎項尚未抽獎。' }

  const winnersSnap = await firestore
    .collection(COL.winners)
    .where('prizeId', '==', prizeId)
    .get()

  const actual = winnersSnap.docs
    .map((d) => d.data() as { registrationId: string; rank: number })
    .sort((a, b) => a.rank - b.rank)
    .map((w) => w.registrationId)

  // 重建當時的候選池：這次的中獎者 + 目前仍可抽的人
  const stillEligible = await listEligible(prize.eventId)
  const poolIds = actual.concat(stillEligible.map((e) => e.registrationId))

  const expected = poolIds
    .map((id) => ({
      id,
      key: createHash('sha256').update(`${prize.drawSeed}:${id}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.min(prize.quantity, poolIds.length))
    .map((x) => x.id)

  return {
    ok: expected.length === actual.length && expected.every((id, i) => id === actual[i]),
    seed: prize.drawSeed,
    expected,
    actual,
  }
}
