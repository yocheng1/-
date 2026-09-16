import type { Metadata } from 'next'
import Link from 'next/link'
import { getAvailability, listPublicEvents, windowOf } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'KPLUS RIDE & RUN' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const events = await listPublicEvents()
  const open = events.filter((e) => windowOf(e) === 'open')
  const next = open[0]

  return (
    <div className="-mt-10">
      {/* ---------------------------------------------- 開場 */}
      <section
        className="relative isolate flex min-h-[78svh] flex-col justify-end overflow-hidden"
        style={{ marginInline: 'calc(50% - 50vw)' }}
      >
        {/* 影片只當背景：靜音、不可互動、螢幕閱讀器略過 */}
        <video
          className="absolute inset-0 -z-10 size-full object-cover"
          src="/media/hero.mp4"
          poster="/media/shot-1.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          tabIndex={-1}
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-ink/40 to-ink"
          aria-hidden="true"
        />

        <div className="mx-auto w-full max-w-5xl px-5 pb-14">
          <p className="micro-lg text-shell/70">KPLUS</p>
          <h1 className="display mt-4 text-[clamp(2.75rem,11vw,6.5rem)] leading-[0.95] tracking-tight">
            RIDE
            <br />
            &amp; RUN
          </h1>

          {next ? (
            <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="micro text-shell/60">下一場</p>
                <p className="mt-1.5 text-lg font-semibold">{next.title}</p>
                <p className="mt-0.5 mono text-xs text-shell/60">
                  {formatDateRange(next.startsAt, next.endsAt)}
                </p>
              </div>
              <Link href={`/events/${next.slug}`} className="btn-primary">
                立即報名
              </Link>
            </div>
          ) : (
            <p className="mt-8 text-shell/70">下一場活動籌備中，敬請期待。</p>
          )}

          <p className="mt-12 micro text-shell/40">SCROLL</p>
        </div>
      </section>

      {/* ---------------------------------------------- 開放報名 */}
      <section className="mx-auto w-full max-w-5xl px-5 py-16">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <h2 className="display text-xl">開放報名中</h2>
          <Link href="/events" className="micro text-dim transition hover:text-shell">
            全部活動 →
          </Link>
        </div>

        {open.length === 0 ? (
          <p className="card p-12 text-center text-dim">目前沒有開放報名的活動。</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.slice(0, 3).map((event) => {
              const availability = getAvailability(event)
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.slug}`}
                    className="card flex h-full flex-col p-5 transition hover:border-white/40"
                  >
                    <span className="badge-on self-start">開放報名中</span>
                    <h3 className="display mt-3 text-lg">{event.title}</h3>
                    {event.summary && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-dim">{event.summary}</p>
                    )}
                    <p className="mt-auto pt-4 mono text-xs text-dim">
                      {formatDateRange(event.startsAt, event.endsAt)}
                    </p>
                    <p className="mt-1 mono text-xs text-faint">
                      {availability.remaining === null
                        ? '不限名額'
                        : `剩餘 ${availability.remaining} / ${availability.capacity}`}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------- 參加流程 */}
      <section className="border-t hairline">
        <div className="mx-auto w-full max-w-5xl px-5 py-16">
          <h2 className="display mb-8 text-xl">怎麼參加</h2>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['報名', '挑一場活動，填好資料送出。'],
              ['票券', '報名完成就會拿到一張票券，存在手機裡。'],
              ['報到', '活動當天出示票券，工作人員掃一下就完成。'],
              ['集點', '完成報到自動累積，滿三場兌換咖啡。'],
            ].map(([title, desc], i) => (
              <li key={title}>
                <p className="mono text-xs text-red">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="display mt-2 text-base">{title}</h3>
                <p className="mt-1.5 text-sm text-dim">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}
