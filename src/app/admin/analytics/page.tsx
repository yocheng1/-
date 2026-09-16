import type { Metadata } from 'next'
import { COL, db } from '@/lib/firebase/admin'
import { listRoster } from '@/lib/fs/checkin'
import { listAllEvents } from '@/lib/fs/events'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Analytics' }
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const events = (await listAllEvents()).filter((e) => e.status !== 'draft')

  const rows = await Promise.all(
    events.map(async (event) => {
      const roster = await listRoster(event.id)
      const registered = roster.filter((r) => r.status === 'confirmed').length
      const attended = roster.filter((r) => r.checkedInAt).length
      return {
        event,
        registered,
        attended,
        noShow: registered - attended,
        rate: registered > 0 ? Math.round((attended / registered) * 100) : 0,
      }
    }),
  )

  const totals = rows.reduce(
    (acc, r) => ({
      registered: acc.registered + r.registered,
      attended: acc.attended + r.attended,
    }),
    { registered: 0, attended: 0 },
  )
  const overallRate = totals.registered > 0
    ? Math.round((totals.attended / totals.registered) * 100)
    : 0

  const winners = await db().collection(COL.winners).get()

  return (
    <div>
      <h1 className="display mb-6 text-2xl">Analytics</h1>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total registered', value: totals.registered },
          { label: 'Total attended', value: totals.attended },
          { label: 'Attendance rate', value: `${overallRate}%` },
          { label: 'Prizes awarded', value: winners.size },
        ].map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="micro text-faint">{stat.label}</p>
            <p className="display mt-2 text-3xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <h2 className="display mb-3 text-lg">各場次出席狀況</h2>
      {rows.length === 0 ? (
        <p className="card p-10 text-center text-dim">還沒有可分析的活動。</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b hairline text-left">
              <tr>
                {['活動', '日期', '報名', '出席', '未到', '出席率'].map((h) => (
                  <th key={h} className="px-4 py-3 micro text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map(({ event, registered, attended, noShow, rate }) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-medium">{event.title}</td>
                  <td className="px-4 py-3 mono text-xs text-dim">{formatDate(event.startsAt)}</td>
                  <td className="px-4 py-3 mono text-dim">{registered}</td>
                  <td className="px-4 py-3 mono text-dim">{attended}</td>
                  <td className="px-4 py-3 mono text-dim">{noShow}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-20 bg-white/10">
                        <div className="h-full bg-red" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="mono text-xs text-dim">{rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
