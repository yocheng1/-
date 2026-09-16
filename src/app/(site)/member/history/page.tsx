import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { listMyRegistrations } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'My History' }
export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const user = (await getCurrentUser())!
  const all = await listMyRegistrations(user.id)

  const now = Date.now()
  const past = all.filter(
    (r) => new Date(r.event!.endsAt).getTime() <= now || r.status === 'cancelled',
  )

  return (
    <div>
      {past.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-dim">還沒有參加紀錄。</p>
          <Link href="/events" className="btn-primary mt-5">看看有哪些活動</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {past.map((reg) => (
            <li key={reg.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{reg.event!.title}</p>
                <p className="mt-0.5 mono text-xs text-dim">
                  {formatDateRange(reg.event!.startsAt, reg.event!.endsAt)}
                </p>
              </div>
              {reg.status === 'cancelled' ? (
                <span className="badge-off">已取消</span>
              ) : reg.checkedInAt ? (
                <span className="badge-done">已出席</span>
              ) : (
                <span className="badge">未報到</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
