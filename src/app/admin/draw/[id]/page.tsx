import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deletePrizeAction, drawPrizeAction, resetPrizeAction } from '@/app/actions/draw'
import { listEligible, listPrizes, listPrizeWinners, verifyPrizeDraw } from '@/lib/repo/draw'
import { findEventById } from '@/lib/repo/events'
import { formatPhone } from '@/lib/validation'
import { PrizeForm } from './prize-form'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const event = findEventById(id)
  return { title: event ? `抽獎控制台：${event.title}` : '找不到活動' }
}

export default async function DrawConsolePage({ params }: PageProps) {
  const { id } = await params
  const event = findEventById(id)
  if (!event) notFound()

  const prizes = listPrizes(event.id)
  const eligible = listEligible(event.id)

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm text-dim hover:text-shell">
        ← 回後台
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl display tracking-tight text-shell">抽獎控制台</h1>
          <p className="mt-1.5 text-dim">{event.title}</p>
        </div>
        <Link href={`/draw/${event.slug}`} className="btn-secondary" target="_blank">
          開啟現場大螢幕 ↗
        </Link>
      </header>

      <div className="mb-6 rounded-xl border hairline bg-transparent/5 px-4 py-3">
        <p className="text-shell">
          目前可抽人數：<strong className="text-xl">{eligible.length}</strong> 人
          <span className="ml-2 text-sm text-shell">（報名成功且尚未中獎）</span>
        </p>
      </div>

      {/* ------------------------------------------- 獎項與抽獎 */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl display text-shell">獎項</h2>

        {prizes.length === 0 ? (
          <p className="card p-8 text-center text-dim">
            還沒有獎項，用下面的表單新增。
          </p>
        ) : (
          <ul className="space-y-3">
            {prizes.map((prize) => {
              const winners = listPrizeWinners(prize.id)
              const verification = prize.drawnAt ? verifyPrizeDraw(prize.id) : null

              return (
                <li key={prize.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg display text-shell">{prize.name}</h3>
                        {prize.isBonus && (
                          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-dim">
                            加碼
                          </span>
                        )}
                        <span className="text-sm text-faint">抽 {prize.quantity} 位</span>
                      </div>
                      {prize.description && (
                        <p className="mt-1 text-sm text-dim">{prize.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!prize.drawnAt ? (
                        <form action={drawPrizeAction}>
                          <input type="hidden" name="prizeId" value={prize.id} />
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={eligible.length === 0}
                          >
                            抽出這個獎項
                          </button>
                        </form>
                      ) : (
                        <form action={resetPrizeAction}>
                          <input type="hidden" name="prizeId" value={prize.id} />
                          <button type="submit" className="btn-secondary">
                            重抽
                          </button>
                        </form>
                      )}

                      {!prize.drawnAt && (
                        <form action={deletePrizeAction}>
                          <input type="hidden" name="prizeId" value={prize.id} />
                          <button type="submit" className="btn-secondary">
                            刪除
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {prize.drawnAt && (
                    <div className="mt-4 border-t hairline pt-3">
                      <p className="text-sm font-semibold text-dim">中獎名單</p>
                      <ul className="mt-1.5 flex flex-wrap gap-2">
                        {winners.map((winner) => (
                          <li
                            key={winner.id}
                            className="rounded-lg bg-white/5 px-3 py-1.5 text-sm"
                          >
                            <span className="font-semibold text-shell">{winner.name}</span>
                            <span className="ml-2 font-mono text-xs text-shell">
                              {formatPhone(winner.phone)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <p className="mt-3 text-xs text-faint">
                        抽獎種子 <code className="font-mono">{prize.drawSeed}</code>
                        {verification && (
                          <span
                            className={`ml-2 font-semibold ${
                              verification.ok ? 'text-shell' : 'text-red-400'
                            }`}
                          >
                            {verification.ok ? '✓ 結果驗算相符' : '✗ 驗算不符，請檢查'}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------- 新增獎項 */}
      <section className="card p-6">
        <h2 className="mb-1 text-xl display text-shell">新增獎項</h2>
        <p className="mb-5 text-sm text-dim">
          活動進行中也可以隨時新增 —— 這就是加碼環節的作法。
        </p>
        <PrizeForm eventId={event.id} />
      </section>
    </div>
  )
}
