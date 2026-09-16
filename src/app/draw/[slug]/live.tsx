'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Prize = {
  id: string
  name: string
  description: string
  quantity: number
  isBonus: boolean
  drawnAt: string | null
  drawSeed: string | null
}

type Winner = { id: string; prizeId: string; name: string; phone: string; rank: number }

type State = {
  event: { id: string; slug: string; title: string }
  remaining: number
  prizes: Prize[]
  winners: Winner[]
}

type Connection = 'connecting' | 'live' | 'reconnecting'

export function LiveDraw({ slug, initial }: { slug: string; initial: State }) {
  const [state, setState] = useState<State>(initial)
  const [connection, setConnection] = useState<Connection>('connecting')
  // 抽獎揭曉前的懸疑動畫
  const [suspensePrizeId, setSuspensePrizeId] = useState<string | null>(null)
  const [flashName, setFlashName] = useState('')
  const [bonusAlert, setBonusAlert] = useState<string | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/draw/${slug}/state`, { cache: 'no-store' })
      if (res.ok) setState(await res.json())
    } catch {
      // 網路瞬斷，等下一次事件或心跳
    }
  }, [slug])

  // ---------------------------------------------------------- 即時連線
  useEffect(() => {
    const source = new EventSource(`/api/draw/${slug}/stream`)

    source.onopen = () => setConnection('live')
    source.onerror = () => setConnection('reconnecting') // EventSource 會自動重連

    source.onmessage = (message) => {
      let payload: { type: string; prizeId?: string; isBonus?: boolean }
      try {
        payload = JSON.parse(message.data)
      } catch {
        return
      }

      if (payload.type === 'hello') {
        setConnection('live')
        return
      }

      if (payload.type === 'drawn' && payload.prizeId) {
        // 先跑 2.2 秒的滾動動畫再揭曉，現場才有戲劇效果
        setSuspensePrizeId(payload.prizeId)
        setTimeout(() => {
          setSuspensePrizeId(null)
          void refresh()
        }, 2200)
        return
      }

      if (payload.type === 'prize-added' && payload.isBonus) {
        void refresh().then(() => {
          const prize = stateRef.current.prizes.find((p) => p.id === payload.prizeId)
          setBonusAlert(prize?.name ?? '加碼獎項')
          setTimeout(() => setBonusAlert(null), 6000)
        })
        return
      }

      void refresh()
    }

    return () => source.close()
  }, [slug, refresh])

  // 動畫期間快速輪播名字
  useEffect(() => {
    if (!suspensePrizeId) return
    const names = state.winners.map((w) => w.name)
    const pool = names.length > 0 ? names : ['？？？', '○○○', '☆☆☆']

    const timer = setInterval(() => {
      setFlashName(pool[Math.floor(Math.random() * pool.length)])
    }, 80)

    return () => clearInterval(timer)
  }, [suspensePrizeId, state.winners])

  const winnersFor = (prizeId: string) =>
    state.winners.filter((w) => w.prizeId === prizeId).sort((a, b) => a.rank - b.rank)

  const drawn = state.prizes.filter((p) => p.drawnAt)
  const latest = drawn[drawn.length - 1]
  const pending = state.prizes.filter((p) => !p.drawnAt)

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* 加碼快報 */}
      {bonusAlert && (
        <div
          className="mb-6 border border-paper bg-paper px-5 py-5 text-center text-ink"
          role="status"
        >
          <p className="micro animate-pulse opacity-60">加碼獎項登場</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{bonusAlert}</p>
        </div>
      )}

      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {state.event.title}
        </h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 micro text-dim">
          <span
            className={`inline-block size-2 rounded-full ${
              connection === 'live' ? 'bg-paper' : 'bg-white/35 animate-pulse'
            }`}
            aria-hidden="true"
          />
          {connection === 'live' ? '連線中，結果會自動更新' : '連線中斷，重新連線中…'}
          <span className="text-faint">·</span>
          尚未中獎 {state.remaining} 人
        </p>
      </header>

      {/* 最新開出的獎項 */}
      <section className="card overflow-hidden">
        {suspensePrizeId ? (
          <div className="bg-transparent/10 px-6 py-14 text-center text-white">
            <p className="text-sm font-bold tracking-[0.3em] opacity-80">抽獎中</p>
            <p className="mt-4 text-4xl font-black tabular-nums sm:text-5xl">
              {flashName || '···'}
            </p>
          </div>
        ) : latest ? (
          <div className="px-6 py-10 text-center">
            {latest.isBonus && (
              <span className="mb-3 inline-block badge-on">
                加碼獎項
              </span>
            )}
            <p className="micro-lg text-dim">Winner</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{latest.name}</h2>

            <ul className="mt-6 flex flex-wrap justify-center gap-3">
              {winnersFor(latest.id).map((winner) => (
                <li
                  key={winner.id}
                  className="rounded-xl border hairline bg-transparent/5 px-5 py-3"
                >
                  <p className="text-xl font-black text-paper">{winner.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-dim">{winner.phone}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="micro-lg text-dim">Standing by</p>
            <p className="mt-4 text-lg">抽獎即將開始</p>
            <p className="mt-1.5 text-sm text-faint">請留在這個畫面，結果會自動跳出來</p>
          </div>
        )}
      </section>

      {/* 即將抽出的獎項（加碼獎項在新增前不會出現在這裡） */}
      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 micro text-faint">尚未抽出</h2>
          <ul className="flex flex-wrap gap-2">
            {pending.map((prize) => (
              <li
                key={prize.id}
                className="border hairline px-3.5 py-2 text-sm"
              >
                <span className="font-semibold text-paper">{prize.name}</span>
                <span className="ml-1.5 text-faint">{prize.quantity} 位</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 歷史紀錄 */}
      {drawn.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 micro text-faint">已公布名單</h2>
          <ul className="space-y-3">
            {drawn
              .slice(0, -1)
              .reverse()
              .map((prize) => (
                <li key={prize.id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-paper">{prize.name}</h3>
                    {prize.isBonus && (
                      <span className="badge-on">
                        加碼
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-paper">
                    {winnersFor(prize.id).map((w) => w.name).join('、') || '—'}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
