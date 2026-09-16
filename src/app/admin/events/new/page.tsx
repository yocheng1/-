import type { Metadata } from 'next'
import Link from 'next/link'
import { EventForm } from '../event-form'

export const metadata: Metadata = { title: 'Create Event' }

export default function NewEventPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/admin/events" className="mb-4 inline-block micro text-dim hover:text-shell">← Events</Link>
      <h1 className="display mb-6 text-2xl">新增活動</h1>
      <EventForm />
    </div>
  )
}
