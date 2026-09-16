/**
 * 抽獎現場的即時推播。
 *
 * 主持人按下抽獎後，所有正在看的人畫面要立刻跳出結果，
 * 而不是叫大家自己重新整理。作法是 Server-Sent Events：
 * 每個觀眾開一條長連線，伺服器有事件時直接推過去。
 *
 * 這是「一台伺服器內」的廣播。本專案就是單機部署，所以夠用；
 * 若哪天要跑多台機器，這裡要換成 Redis pub/sub 之類的外部通道，
 * 否則連到 A 機器的觀眾收不到 B 機器發出的事件。
 */

export type DrawEvent =
  | { type: 'state' }
  | { type: 'drawing'; prizeId: string; prizeName: string }
  | { type: 'drawn'; prizeId: string }
  | { type: 'prize-added'; prizeId: string; isBonus: boolean }
  | { type: 'reset'; prizeId: string }

type Subscriber = (event: DrawEvent) => void

// dev 模式會重新載入模組，訂閱者掛在 globalThis 才不會每次熱更新就斷線
const globalForBus = globalThis as unknown as {
  __kplusDrawBus?: Map<string, Set<Subscriber>>
}

function channels(): Map<string, Set<Subscriber>> {
  if (!globalForBus.__kplusDrawBus) globalForBus.__kplusDrawBus = new Map()
  return globalForBus.__kplusDrawBus
}

export function subscribe(eventId: string, fn: Subscriber): () => void {
  const map = channels()
  if (!map.has(eventId)) map.set(eventId, new Set())
  map.get(eventId)!.add(fn)

  return () => {
    const set = map.get(eventId)
    if (!set) return
    set.delete(fn)
    if (set.size === 0) map.delete(eventId)
  }
}

export function publish(eventId: string, event: DrawEvent): void {
  const set = channels().get(eventId)
  if (!set) return

  for (const fn of set) {
    // 單一訂閱者出錯不能影響其他人收訊
    try {
      fn(event)
    } catch (error) {
      console.error('[draw-bus] 推播失敗：', error)
    }
  }
}

/** 目前有多少人正在看這場抽獎（壓力測試與後台顯示用）。 */
export function subscriberCount(eventId: string): number {
  return channels().get(eventId)?.size ?? 0
}
