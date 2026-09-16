import type { Metadata } from 'next'
import Link from 'next/link'
import { WindowBadge } from '@/components/badges'
import { formatDateRange } from '@/lib/format'
import { listAllEvents, registrationWindow } from '@/lib/repo/events'
import { getAvailability } from '@/lib/repo/registrations'

export const metadata: Metadata = { title: '後台管理' }
export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>
}) {
  const { saved, deleted } = await searchParams
  const events = listAllEvents()

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl display tracking-tight text-shell">後台管理</h1>
          <p className="mt-1.5 text-dim">管理活動與報名名單。</p>
        </div>
        <Link href="/admin/events/new" className="btn-primary">
          + 新增活動
        </Link>
      </header>

      {(saved || deleted) && (
        <div
          className="mb-6 rounded-xl border hairline bg-white/5 text-shell"
          role="status"
        >
          {saved ? '活動已儲存。' : '活動已刪除。'}
        </div>
      )}

      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-dim">還沒有任何活動</p>
          <Link href="/admin/events/new" className="btn-primary mt-4">
            建立第一場活動
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b hairline bg-transparent/5 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-dim">活動</th>
                <th className="px-4 py-3 font-semibold text-dim">時間</th>
                <th className="px-4 py-3 font-semibold text-dim">狀態</th>
                <th className="px-4 py-3 font-semibold text-dim">報名</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {events.map((event) => {
                const availability = getAvailability(event)
                return (
                  <tr key={event.id} className="hover:bg-transparent/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="font-semibold text-shell hover:text-shell"
                      >
                        {event.title}
                      </Link>
                      <div className="font-mono text-xs text-faint">/{event.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {formatDateRange(event.startsAt, event.endsAt)}
                    </td>
                    <td className="px-4 py-3">
                      <WindowBadge
                        window={registrationWindow(event)}
                        availability={availability}
                      />
                    </td>
                    <td className="px-4 py-3 text-shell">
                      <span className="font-semibold">{availability.confirmed}</span>
                      {event.capacity > 0 && ` / ${event.capacity}`}
                      {availability.waitlisted > 0 && (
                        <span className="ml-1 text-dim">
                          (候補 {availability.waitlisted})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="font-semibold text-shell hover:text-shell"
                      >
                        管理 →
                      </Link>
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
