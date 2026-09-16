import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { listMyRegistrations } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'My Tickets' }
export const dynamic = 'force-dynamic'

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>
}) {
  const { cancelled } = await searchParams
  const user = (await getCurrentUser())!

  const all = await listMyRegistrations(user.id)
  const now = Date.now()
  const active = all.filter(
    (r) => r.status !== 'cancelled' && new Date(r.event!.endsAt).getTime() > now,
  )

  return (
    <div>
      {cancelled && (
        <p className="mb-6 card p-4 text-dim" role="status">
          已取消報名。若該活動有候補名單，名額已自動遞補給下一位。
        </p>
      )}

      {active.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-dim">目前沒有即將到來的票券。</p>
          <Link href="/events" className="btn-primary mt-5">去看看有哪些活動</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((reg) => (
            <li key={reg.id}>
              <Link href={`/member/ticket/${reg.id}`} className="card block p-5 transition hover:border-white/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={reg.status === 'confirmed' ? 'badge-on' : 'badge'}>
                    {reg.status === 'confirmed' ? '報名成功' : '候補中'}
                  </span>
                  {reg.checkedInAt && <span className="badge-done">已報到</span>}
                </div>
                <h2 className="display mt-3 text-lg">{reg.event!.title}</h2>
                <p className="mt-1.5 mono text-xs text-dim">
                  {formatDateRange(reg.event!.startsAt, reg.event!.endsAt)}
                  {reg.event!.location && ` · ${reg.event!.location}`}
                </p>
                <p className="mt-3 micro text-red">出示票券 →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
