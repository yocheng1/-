'use client'

import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clientDb } from '@/lib/firebase/client'

type Prize = {
  id: string
  name: string
  quantity: number
  isBonus: boolean
  drawnAt: string | null
  sortOrder: number
}

type Winner = { id: string; prizeId: string; name: string; maskedPhone: string; rank: number }

/**
 * 現場大螢幕。
 *
 * 直接訂閱 Firestore，主持人一抽完，所有人的畫面就自己更新 ——
 * 中間不經過我們的伺服器，所以幾百人同時看也不會塞住。
 */
export function LiveDraw({
  eventId,
  title,
  initialPrizes,
  initialWinners,
}: {
  eventId: string
  title: string
  initialPrizes: Prize[]
  initialWinners: Winner[]
}) {
  const [prizes, setPrizes] = useState(initialPrizes)
  const [winners, setWinners] = useState(initialWinners)
  const [live, setLive] = useState(false)
  const [suspense, setSuspense] = useState(false)
  const [flash, setFlash] = useState('')
  const [bonus, setBonus] = useState<string | null>(null)

  const knownPrizes = useRef(new Set(initialPrizes.map((p) => p.id)))
  const winnerCount = useRef(initialWinners.length)

  useEffect(() => {
    const db = clientDb()

    const unsubPrizes = onSnapshot(
      query(collection(db, 'prizes'), where('eventId', '==', eventId)),
      (snap) => {
        setLive(true)
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Prize, 'id'>) }))
        rows.sort((a, b) => a.sortOrder - b.sortOrder)

        // 新出現的加碼獎項 → 跳出快報
        rows.forEach((prize) => {
          if (!knownPrizes.current.has(prize.id)) {
            knownPrizes.current.add(prize.id)
            if (prize.isBonus) {
              setBonus(prize.name)
              setTimeout(() => setBonus(null), 6000)
            }
          }
        })

        setPrizes(rows)
      },
      () => setLive(false),
    )

    const unsubWinners = onSnapshot(
      query(collection(db, 'winners'), where('eventId', '==', eventId)),
      (snap) => {
        setLive(true)
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Winner, 'id'>) }))

        // 有新中獎者 → 先跑懸疑動畫再揭曉
        if (rows.length > winnerCount.current) {
          setSuspense(true)
          setTimeout(() => {
            setSuspense(false)
            setWinners(rows)
          }, 2200)
        } else {
          setWinners(rows)
        }
        winnerCount.current = rows.length
      },
      () => setLive(false),
    )

    return () => {
      unsubPrizes()
      unsubWinners()
    }
  }, [eventId])

  useEffect(() => {
    if (!suspense) return
    const pool = winners.map((w) => w.name)
    const names = pool.length > 0 ? pool : ['？？？', '○○○', '☆☆☆']
    const timer = setInterval(() => {
      setFlash(names[Math.floor(Math.random() * names.length)])
    }, 80)
    return () => clearInterval(timer)
  }, [suspense, winners])

  const drawn = useMemo(() => prizes.filter((p) => p.drawnAt), [prizes])
  const pending = useMemo(() => prizes.filter((p) => !p.drawnAt), [prizes])
  const latest = drawn[drawn.length - 1]
  const winnersFor = (prizeId: string) =>
    winners.filter((w) => w.prizeId === prizeId).sort((a, b) => a.rank - b.rank)

  return (
    <div className="mx-auto w-full max-w-3xl">
      {bonus && (
        <div className="mb-6 border border-shell bg-shell px-5 py-5 text-center text-ink" role="status">
          <p className="micro animate-pulse opacity-60">加碼獎項登場</p>
          <p className="display mt-2 text-2xl">{bonus}</p>
        </div>
      )}

      <header className="mb-6 text-center">
        <h1 className="display text-2xl sm:text-3xl">{title}</h1>
        <p className="mt-3 flex items-center justify-center gap-2 micro text-dim">
          <span
            className={`inline-block size-2 rounded-full ${live ? 'bg-red' : 'bg-white/35 animate-pulse'}`}
            aria-hidden="true"
          />
          {live ? '連線中，結果會自動更新' : '連線中…'}
        </p>
      </header>

      <section className="card overflow-hidden">
        {suspense ? (
          <div className="px-6 py-20 text-center">
            <p className="micro-lg animate-pulse text-dim">Drawing</p>
            <p className="display mt-6 text-4xl sm:text-6xl">{flash || '···'}</p>
          </div>
        ) : latest ? (
          <div className="px-6 py-10 text-center">
            {latest.isBonus && <span className="badge-on mb-3 inline-block">加碼獎項</span>}
            <p className="micro-lg text-dim">Winner</p>
            <h2 className="display mt-2 text-xl">{latest.name}</h2>

            <ul className="mt-6 flex flex-wrap justify-center gap-3">
              {winnersFor(latest.id).map((w) => (
                <li key={w.id} className="border border-white/25 px-7 py-5">
                  <p className="display text-2xl sm:text-3xl">{w.name}</p>
                  <p className="mt-1.5 mono text-xs text-faint">{w.maskedPhone}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="micro-lg text-dim">Standing by</p>
            <p className="mt-4 text-lg">抽獎即將開始</p>
            <p className="mt-1.5 text-sm text-faint">請留在這個畫面，結果會自動跳出來</p>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 micro text-faint">尚未抽出</h2>
          <ul className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <li key={p.id} className="border hairline px-3.5 py-2 text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="ml-1.5 text-faint">{p.quantity} 位</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drawn.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 micro text-faint">已公布名單</h2>
          <ul className="space-y-3">
            {drawn.slice(0, -1).reverse().map((prize) => (
              <li key={prize.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="display text-base">{prize.name}</h3>
                  {prize.isBonus && <span className="badge-on">加碼</span>}
                </div>
                <p className="mt-1.5 text-dim">
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
