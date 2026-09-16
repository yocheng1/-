import type { Metadata } from 'next'
import Link from 'next/link'
import { getAvailability, listPublicEvents, windowOf } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'KPLUS RIDE & RUN' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const events = await listPublicEvents()
  const open = events.filter((e) => windowOf(e) === 'open').slice(0, 3)

  return (
    <div>
      <section className="border-b hairline py-16 text-center sm:py-24">
        <p className="micro-lg text-dim">KPLUS</p>
        <h1 className="display mt-4 text-4xl leading-tight sm:text-6xl">
          RIDE &amp; RUN
        </h1>
        <p className="mx-auto mt-5 max-w-md text-dim">
          與 KPlus 一起騎、一起跑。報名活動、現場報到、集點兌換，都在這裡。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/events" className="btn-primary">看看有哪些活動</Link>
          <Link href="/member/tickets" className="btn-secondary">我的票券</Link>
        </div>
      </section>

      <section className="py-12">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="display text-xl">開放報名中</h2>
          <Link href="/events" className="micro text-dim hover:text-shell">全部活動 →</Link>
        </div>

        {open.length === 0 ? (
          <p className="card p-10 text-center text-dim">目前沒有開放報名的活動，請稍後再回來。</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((event) => {
              const availability = getAvailability(event)
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.slug}`}
                    className="card flex h-full flex-col p-5 transition hover:border-white/40"
                  >
                    <span className="badge-on self-start">開放報名中</span>
                    <h3 className="display mt-3 text-lg">{event.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-sm text-dim">{event.summary}</p>
                    <p className="mt-4 mono text-xs text-dim">
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
    </div>
  )
}
