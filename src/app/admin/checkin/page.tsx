import type { Metadata } from 'next'
import Link from 'next/link'
import { listAllEvents } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'Check-in' }
export const dynamic = 'force-dynamic'

export default async function CheckinIndexPage() {
  const events = (await listAllEvents()).filter((e) => e.status !== 'draft')

  return (
    <div>
      <h1 className="display mb-2 text-2xl">Check-in</h1>
      <p className="mb-6 text-dim">選擇場次開始現場報到。</p>

      {events.length === 0 ? (
        <p className="card p-10 text-center text-dim">目前沒有可報到的場次。</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/checkin/${event.id}`}
                className="card flex items-center justify-between gap-4 p-5 transition hover:border-white/40"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{event.title}</p>
                  <p className="mt-0.5 mono text-xs text-dim">
                    {formatDateRange(event.startsAt, event.endsAt)} · {event.confirmedCount} 人報名
                  </p>
                </div>
                <span className="micro text-red whitespace-nowrap">報到 →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
