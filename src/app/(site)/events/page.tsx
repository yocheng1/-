import type { Metadata } from 'next'
import Link from 'next/link'
import { WindowBadge, CapacityText } from '@/components/badges'
import { getAvailability, listPublicEvents, windowOf } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const events = await listPublicEvents()

  return (
    <div>
      <header className="mb-8">
        <p className="micro-lg text-dim">Events</p>
        <h1 className="display mt-3 text-3xl">活動列表</h1>
      </header>

      {events.length === 0 ? (
        <p className="card p-12 text-center text-dim">目前沒有開放中的活動。</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => {
            const availability = getAvailability(event)
            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.slug}`}
                  className="card flex h-full flex-col p-6 transition hover:border-white/40"
                >
                  <WindowBadge window={windowOf(event)} availability={availability} />
                  <h2 className="display mt-3 text-lg">{event.title}</h2>
                  {event.summary && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-dim">{event.summary}</p>
                  )}

                  <dl className="mt-5 space-y-1.5 mono text-xs">
                    <div className="flex gap-3">
                      <dt className="text-faint">TIME</dt>
                      <dd className="text-dim">{formatDateRange(event.startsAt, event.endsAt)}</dd>
                    </div>
                    {event.location && (
                      <div className="flex gap-3">
                        <dt className="text-faint">SITE</dt>
                        <dd className="text-dim">{event.location}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-5 flex items-center justify-between border-t hairline pt-3 text-sm">
                    <CapacityText availability={availability} />
                    <span className="micro text-red">詳情 →</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
