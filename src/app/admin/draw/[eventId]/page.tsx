import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPrizeAction, drawPrizeAction, redrawWinnerAction } from '@/app/actions/fs'
import { COL, db } from '@/lib/firebase/admin'
import { listEligible } from '@/lib/fs/draw'
import { findEventById } from '@/lib/fs/events'
import { PrizeForm } from './prize-form'

export const metadata: Metadata = { title: 'Draw' }
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function DrawConsolePage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { error } = await searchParams

  const event = await findEventById(eventId)
  if (!event) notFound()

  const firestore = db()
  const [prizesSnap, winnersSnap, eligible] = await Promise.all([
    firestore.collection(COL.prizes).where('eventId', '==', eventId).get(),
    firestore.collection(COL.winners).where('eventId', '==', eventId).get(),
    listEligible(eventId),
  ])

  type PrizeRow = {
    id: string
    name: string
    quantity: number
    isBonus: boolean
    sortOrder: number
    drawSeed: string | null
    drawnAt: string | null
  }

  const prizes: PrizeRow[] = prizesSnap.docs
    .map((d) => {
      const data = d.data() as Omit<PrizeRow, 'id'>
      return {
        id: d.id,
        name: String(data.name ?? ''),
        quantity: Number(data.quantity ?? 1),
        isBonus: Boolean(data.isBonus),
        sortOrder: Number(data.sortOrder ?? 0),
        drawSeed: data.drawSeed ?? null,
        drawnAt: data.drawnAt ?? null,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const winnersByPrize = new Map<string, { id: string; name: string; maskedPhone: string }[]>()
  winnersSnap.docs.forEach((d) => {
    const data = d.data() as { prizeId: string; name: string; maskedPhone: string }
    if (!winnersByPrize.has(data.prizeId)) winnersByPrize.set(data.prizeId, [])
    winnersByPrize.get(data.prizeId)!.push({
      id: d.id, name: data.name, maskedPhone: data.maskedPhone,
    })
  })

  return (
    <div>
      <Link href="/admin/events" className="mb-4 inline-block micro text-dim hover:text-shell">
        ← Events
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-2xl">{event.title}</h1>
          <p className="mt-1 micro text-faint">Live draw console</p>
        </div>
        <Link href={`/draw/${event.slug}`} target="_blank" className="btn-secondary">
          開啟大螢幕 ↗
        </Link>
      </header>

      {error && (
        <div className="mb-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red" role="alert">
          {error}
        </div>
      )}

      <div className="mb-8 card p-5">
        <p className="micro text-faint">可抽人數</p>
        <p className="display mt-1 text-3xl">{eligible.length}</p>
        <p className="mt-1 text-sm text-dim">
          {event.drawPool === 'all'
            ? '此活動抽獎對象為「所有報名者」'
            : '此活動只抽「已完成現場報到」的人'}
          ，且排除已中獎者。
        </p>
      </div>

      <section className="mb-8">
        <h2 className="display mb-3 text-lg">獎項</h2>

        {prizes.length === 0 ? (
          <p className="card p-8 text-center text-dim">還沒有獎項，用下面的表單新增。</p>
        ) : (
          <ul className="space-y-3">
            {prizes.map((prize) => {
              const winners = winnersByPrize.get(prize.id) ?? []
              const drawn = Boolean(prize.drawnAt)

              return (
                <li key={prize.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="display text-base">{prize.name}</h3>
                        {prize.isBonus && <span className="badge-on">加碼</span>}
                        <span className="micro text-faint">抽 {prize.quantity} 位</span>
                      </div>
                    </div>

                    {!drawn && (
                      <form action={drawPrizeAction}>
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="prizeId" value={prize.id} />
                        <button type="submit" className="btn-primary" disabled={eligible.length === 0}>
                          抽出這個獎項
                        </button>
                      </form>
                    )}
                  </div>

                  {drawn && (
                    <div className="mt-4 border-t hairline pt-3">
                      <p className="micro text-faint">中獎名單</p>
                      <ul className="mt-2 space-y-2">
                        {winners.map((winner) => (
                          <li key={winner.id} className="flex flex-wrap items-center gap-3">
                            <span className="font-semibold">{winner.name}</span>
                            <span className="mono text-xs text-dim">{winner.maskedPhone}</span>
                            <form action={redrawWinnerAction} className="ml-auto">
                              <input type="hidden" name="eventId" value={eventId} />
                              <input type="hidden" name="winnerId" value={winner.id} />
                              <button type="submit" className="micro text-faint underline hover:text-dim">
                                不在場，補抽
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 mono text-[10px] text-faint">
                        種子 {prize.drawSeed}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card p-6">
        <h2 className="display mb-1 text-lg">新增獎項</h2>
        <p className="mb-5 text-sm text-dim">
          活動進行中也可以隨時新增 —— 這就是加碼環節的作法。
        </p>
        <PrizeForm eventId={eventId} />
      </section>
    </div>
  )
}
