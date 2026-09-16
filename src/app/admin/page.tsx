import type { Metadata } from 'next'
import Link from 'next/link'
import { COL, db } from '@/lib/firebase/admin'
import { getAvailability, listAllEvents, windowOf } from '@/lib/fs/events'
import { formatDateRange } from '@/lib/format'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const events = await listAllEvents()
  const now = Date.now()

  const upcoming = events
    .filter((e) => e.status === 'published' && new Date(e.endsAt).getTime() > now)
    .slice(0, 5)

  const firestore = db()
  const [regsSnap, checkinsSnap, winnersSnap] = await Promise.all([
    firestore.collection(COL.registrations).where('status', '==', 'confirmed').get(),
    firestore.collection(COL.checkins).get(),
    firestore.collection(COL.winners).get(),
  ])

  const stats = [
    { label: 'Events', value: events.filter((e) => e.status === 'published').length, hint: '已發佈' },
    { label: 'Registered', value: regsSnap.size, hint: '報名成功總數' },
    { label: 'Checked-in', value: checkinsSnap.size, hint: '累積報到人次' },
    { label: 'Prizes won', value: winnersSnap.size, hint: '已抽出獎項' },
  ]

  return (
    <div>
      <h1 className="display mb-6 text-2xl">Dashboard</h1>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="micro text-faint">{stat.label}</p>
            <p className="display mt-2 text-3xl">{stat.value}</p>
            <p className="mt-1 text-sm text-dim">{stat.hint}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="display mb-3 text-lg">即將到來的活動</h2>
        {upcoming.length === 0 ? (
          <p className="card p-8 text-center text-dim">目前沒有即將到來的活動。</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => {
              const availability = getAvailability(event)
              return (
                <li key={event.id} className="card flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/participants/${event.id}`}
                      className="font-semibold transition hover:text-red"
                    >
                      {event.title}
                    </Link>
                    <p className="mt-0.5 mono text-xs text-dim">
                      {formatDateRange(event.startsAt, event.endsAt)}
                    </p>
                  </div>
                  <span className="mono text-sm text-dim">
                    {availability.confirmed}
                    {event.capacity > 0 && ` / ${event.capacity}`} 人
                  </span>
                  <Link href={`/admin/checkin/${event.id}`} className="btn-secondary px-3 py-1.5">
                    報到
                  </Link>
                  <Link href={`/admin/draw/${event.id}`} className="btn-primary px-3 py-1.5">
                    抽獎
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
