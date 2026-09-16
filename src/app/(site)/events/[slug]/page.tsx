import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CapacityText, WindowBadge } from '@/components/badges'
import { getCurrentUser } from '@/lib/auth/session'
import { registrationId } from '@/lib/firebase/admin'
import { findEventBySlug, findRegistration, getAvailability, windowOf } from '@/lib/fs/events'
import { WINDOW_LABEL } from '@/lib/fs/registrations'
import { formatDateRange, formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const event = await findEventBySlug(slug)
  return { title: event?.title ?? '找不到活動' }
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params
  const user = await getCurrentUser()

  const event = await findEventBySlug(slug)
  if (!event || (event.status === 'draft' && user?.role !== 'admin')) notFound()

  const availability = getAvailability(event)
  const window = windowOf(event)

  const existing = user ? await findRegistration(registrationId(event.id, user.id)) : null
  const active = existing && existing.status !== 'cancelled' ? existing : null

  const canRegister = window === 'open' && (!availability.isFull || event.waitlistEnabled)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/events" className="mb-5 inline-block micro text-dim hover:text-shell">
        ← Events
      </Link>

      <WindowBadge window={window} availability={availability} />
      <h1 className="display mt-4 text-3xl">{event.title}</h1>
      {event.summary && <p className="mt-3 text-dim">{event.summary}</p>}

      <dl className="mt-8 grid gap-4 border-y hairline py-6 sm:grid-cols-2">
        <div>
          <dt className="micro text-faint">TIME</dt>
          <dd className="mt-1">{formatDateRange(event.startsAt, event.endsAt)}</dd>
        </div>
        {event.location && (
          <div>
            <dt className="micro text-faint">SITE</dt>
            <dd className="mt-1">{event.location}</dd>
          </div>
        )}
        <div>
          <dt className="micro text-faint">CAPACITY</dt>
          <dd className="mt-1"><CapacityText availability={availability} /></dd>
        </div>
        {event.registrationClosesAt && (
          <div>
            <dt className="micro text-faint">DEADLINE</dt>
            <dd className="mt-1">{formatDateTime(event.registrationClosesAt)}</dd>
          </div>
        )}
      </dl>

      {event.description && (
        <div className="mt-8">
          <h2 className="display text-lg">活動說明</h2>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-dim">{event.description}</p>
        </div>
      )}

      <div className="mt-10 border-t hairline pt-8">
        {active ? (
          <div>
            <span className="badge-on">已報名</span>
            <p className="mt-3 text-dim">您已完成報名，活動當天請出示票券。</p>
            <Link href={`/member/ticket/${active.id}`} className="btn-primary mt-4">
              查看我的票券
            </Link>
          </div>
        ) : !user ? (
          <Link
            href={`/login?redirectTo=${encodeURIComponent(`/events/${slug}/register`)}`}
            className="btn-primary"
          >
            登入後報名
          </Link>
        ) : canRegister ? (
          <Link href={`/events/${slug}/register`} className="btn-primary">
            {availability.isFull ? '加入候補名單' : '立即報名'}
          </Link>
        ) : (
          <p className="card p-4 text-dim">
            {window === 'open' && availability.isFull
              ? '很抱歉，這場活動名額已滿，且未開放候補。'
              : `目前無法報名：${WINDOW_LABEL[window]}。`}
          </p>
        )}
      </div>
    </div>
  )
}
