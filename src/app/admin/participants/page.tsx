import type { Metadata } from 'next'
import Link from 'next/link'
import { listAllEvents } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'Participants' }
export const dynamic = 'force-dynamic'

export default async function ParticipantsIndexPage() {
  const events = await listAllEvents()

  return (
    <div>
      <h1 className="display mb-6 text-2xl">Participants</h1>
      <p className="mb-4 text-dim">選擇一場活動查看報名、報到與未到名單。</p>

      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/admin/participants/${event.id}`} className="card block p-4 transition hover:border-white/40">
              <p className="font-semibold">{event.title}</p>
              <p className="mt-0.5 mono text-xs text-dim">
                {formatDateRange(event.startsAt, event.endsAt)} · {event.confirmedCount} 人報名
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
