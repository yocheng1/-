import type { Metadata } from 'next'
import Link from 'next/link'
import { EventForm } from '@/app/admin/event-form'

export const metadata: Metadata = { title: '新增活動' }

export default function NewEventPage() {
  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm text-dim hover:text-paper">
        ← 回後台
      </Link>
      <h1 className="mb-6 text-3xl font-black tracking-tight text-paper">新增活動</h1>
      <EventForm />
    </div>
  )
}
