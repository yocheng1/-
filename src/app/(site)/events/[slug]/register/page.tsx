import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { registrationId } from '@/lib/firebase/admin'
import { findEventBySlug, findRegistration, getAvailability, windowOf } from '@/lib/fs/events'
import { WINDOW_LABEL } from '@/lib/fs/registrations'
import { formatDateRange } from '@/lib/format'
import { formatPhone } from '@/lib/validation'
import { RegistrationForm } from './registration-form'

export const metadata: Metadata = { title: 'Register' }
export const dynamic = 'force-dynamic'

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/events/${slug}/register`)}&error=login_required`)
  }

  const event = await findEventBySlug(slug)
  if (!event) notFound()

  // 已經報名過就直接帶到票券，不要讓人重複填一次表單
  const existing = await findRegistration(registrationId(event.id, user.id))
  if (existing && existing.status !== 'cancelled') {
    redirect(`/member/ticket/${existing.id}`)
  }

  const availability = getAvailability(event)
  const window = windowOf(event)

  if (window !== 'open' || (availability.isFull && !event.waitlistEnabled)) {
    return (
      <div className="mx-auto max-w-lg py-8 text-center">
        <h1 className="display text-2xl">無法報名</h1>
        <p className="mt-3 text-dim">
          {availability.isFull ? '這場活動名額已滿，且未開放候補。' : WINDOW_LABEL[window]}
        </p>
        <Link href={`/events/${slug}`} className="btn-secondary mt-6">回活動頁</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/events/${slug}`} className="mb-5 inline-block micro text-dim hover:text-shell">
        ← {event.title}
      </Link>

      <p className="micro-lg text-dim">Register</p>
      <h1 className="display mt-3 text-2xl">報名 {event.title}</h1>
      <p className="mt-2 mono text-xs text-dim">
        {formatDateRange(event.startsAt, event.endsAt)}
        {event.location && ` · ${event.location}`}
      </p>

      <div className="mt-8">
        <RegistrationForm
          slug={slug}
          waitlist={availability.isFull}
          defaults={{
            name: user.name ?? '',
            phone: user.phone ? formatPhone(user.phone) : '',
            email: user.email ?? '',
          }}
        />
      </div>
    </div>
  )
}
