import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listRoster } from '@/lib/fs/checkin'
import { findEventById } from '@/lib/fs/events'
import { Roster } from './roster'

export const metadata: Metadata = { title: 'Check-in' }
export const dynamic = 'force-dynamic'

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const event = await findEventById(eventId)
  if (!event) notFound()

  const roster = await listRoster(eventId)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/checkin" className="mb-4 inline-block micro text-dim hover:text-shell">
        ← 換一個場次
      </Link>

      <h1 className="display mb-1 text-2xl">{event.title}</h1>
      <p className="mb-6 micro text-faint">Staff check-in</p>

      <Roster
        eventId={eventId}
        rows={roster.map((r) => ({
          registrationId: r.registrationId,
          name: r.name,
          phone: r.phone,
          status: r.status,
          checkedInAt: r.checkedInAt,
        }))}
      />
    </div>
  )
}
