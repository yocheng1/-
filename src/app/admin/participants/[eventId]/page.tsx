import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listRoster } from '@/lib/fs/checkin'
import { findEventById } from '@/lib/fs/events'
import { formatDateTime } from '@/lib/format'
import { formatPhone } from '@/lib/validation'

export const metadata: Metadata = { title: 'Participants' }
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function ParticipantsPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { tab = 'registered' } = await searchParams

  const event = await findEventById(eventId)
  if (!event) notFound()

  const roster = await listRoster(eventId)

  const registered = roster
  const checkedIn = roster.filter((r) => r.checkedInAt)
  const noShow = roster.filter((r) => !r.checkedInAt && r.status === 'confirmed')

  const tabs = [
    { key: 'registered', label: 'Registered', rows: registered },
    { key: 'checked-in', label: 'Checked-in', rows: checkedIn },
    { key: 'no-show', label: 'No-show', rows: noShow },
  ]
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]

  return (
    <div>
      <Link href="/admin/participants" className="mb-4 inline-block micro text-dim hover:text-shell">
        ← Participants
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-2xl">{event.title}</h1>
        <div className="flex gap-2">
          <Link href={`/admin/checkin/${event.id}`} className="btn-secondary">前往報到</Link>
          <a href={`/admin/participants/${event.id}/export`} className="btn-secondary">匯出 CSV</a>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/participants/${event.id}?tab=${t.key}`}
            className={t.key === active.key ? 'badge-on' : 'badge'}
          >
            {t.label} {t.rows.length}
          </Link>
        ))}
      </div>

      {active.rows.length === 0 ? (
        <p className="card p-10 text-center text-dim">這個分類目前沒有資料。</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="border-b hairline text-left">
              <tr>
                {['#', '姓名', '電話', '報名狀態', '報到時間'].map((h) => (
                  <th key={h} className="px-4 py-3 micro text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {active.rows.map((row, index) => (
                <tr key={row.registrationId}>
                  <td className="px-4 py-3 mono text-faint">{index + 1}</td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 mono text-dim">{formatPhone(row.phone)}</td>
                  <td className="px-4 py-3">
                    <span className={row.status === 'confirmed' ? 'badge-on' : 'badge'}>
                      {row.status === 'confirmed' ? '報名成功' : row.status === 'waitlist' ? '候補' : row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-xs text-dim">
                    {row.checkedInAt ? formatDateTime(row.checkedInAt) : '—'}
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
