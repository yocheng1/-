import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { findEventById } from '@/lib/fs/events'
import { EventForm } from '../../event-form'

export const metadata: Metadata = { title: 'Edit Event' }
export const dynamic = 'force-dynamic'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await findEventById(id)
  if (!event) notFound()

  return (
    <div className="max-w-2xl">
      <Link href="/admin/events" className="mb-4 inline-block micro text-dim hover:text-shell">← Events</Link>
      <h1 className="display mb-6 text-2xl">編輯活動</h1>
      <EventForm event={event} />
    </div>
  )
}
