import type { Metadata } from 'next'
import Link from 'next/link'
import { getAvailability, listAllEvents, windowOf } from '@/lib/fs/events'
import { WINDOW_LABEL } from '@/lib/fs/registrations'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  const events = await listAllEvents()

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-2xl">Events</h1>
        <Link href="/admin/events/new" className="btn-primary">+ 新增活動</Link>
      </header>

      {events.length === 0 ? (
        <p className="card p-10 text-center text-dim">還沒有任何活動。</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b hairline text-left">
              <tr>
                {['活動', '時間', '狀態', '名額', '抽獎對象', ''].map((h) => (
                  <th key={h} className="px-4 py-3 micro text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {events.map((event) => {
                const availability = getAvailability(event)
                return (
                  <tr key={event.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/participants/${event.id}`}
                        className="font-semibold transition hover:text-red"
                      >
                        {event.title}
                      </Link>
                      <div className="mono text-xs text-faint">/{event.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {formatDateRange(event.startsAt, event.endsAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={event.status === 'published' ? 'badge-on' : 'badge-off'}>
                        {WINDOW_LABEL[windowOf(event)]}
                      </span>
                    </td>
                    <td className="px-4 py-3 mono text-dim">
                      {availability.confirmed}
                      {event.capacity > 0 ? ` / ${event.capacity}` : ' / ∞'}
                      {availability.waitlisted > 0 && ` (候補 ${availability.waitlisted})`}
                    </td>
                    <td className="px-4 py-3 micro text-dim">
                      {event.drawPool === 'all' ? '所有報名者' : '限已報到'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/checkin/${event.id}`} className="micro text-dim hover:text-shell">報到</Link>
                      <span className="mx-2 text-faint">·</span>
                      <Link href={`/admin/draw/${event.id}`} className="micro text-red">抽獎</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
