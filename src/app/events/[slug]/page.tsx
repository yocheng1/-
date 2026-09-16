import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cancelRegistrationAction } from '@/app/actions/registration'
import { CapacityText, RegistrationStatusBadge, WindowBadge } from '@/components/badges'
import { getCurrentUser } from '@/lib/auth/session'
import { formatDateRange, formatDateTime } from '@/lib/format'
import {
  findEventBySlug,
  registrationWindow,
  registrationWindowMessage,
} from '@/lib/repo/events'
import { findActiveRegistration, getAvailability } from '@/lib/repo/registrations'
import { formatPhone } from '@/lib/validation'
import { RegistrationForm } from './registration-form'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ registered?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const event = findEventBySlug(slug)
  return {
    title: event?.title ?? '找不到活動',
    description: event?.summary,
  }
}

export default async function EventDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { registered } = await searchParams

  const event = findEventBySlug(slug)
  // 草稿活動只有管理員看得到
  const user = await getCurrentUser()
  if (!event || (event.status === 'draft' && user?.role !== 'admin')) notFound()

  const availability = getAvailability(event)
  const window = registrationWindow(event)
  const existing = user ? findActiveRegistration(event.id, user.id) : null

  const canRegister = window === 'open' && (!availability.isFull || event.waitlistEnabled)

  return (
    <div>
      <Link
        href="/events"
        className="mb-4 inline-block text-sm text-dim hover:text-shell"
      >
        ← 回活動列表
      </Link>

      {registered && (
        <div
          className="mb-6 rounded-xl border hairline bg-white/5 text-shell"
          role="status"
        >
          <p className="font-semibold">
            {registered === 'waitlist' ? '已加入候補名單！' : '報名成功！'}
          </p>
          <p className="mt-0.5 text-sm">
            {registered === 'waitlist'
              ? '若有名額釋出將自動遞補，您可以在「我的報名」查看狀態。'
              : '您可以在「我的報名」查看或取消報名。'}
          </p>
        </div>
      )}

      <article className="card overflow-hidden">
        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImageUrl} alt="" className="h-56 w-full object-cover sm:h-72" />
        )}

        <div className="p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <WindowBadge window={window} availability={availability} />
            {event.status === 'draft' && (
              <span className="inline-flex items-center rounded-full bg-transparent/10 px-2.5 py-1 text-xs font-semibold text-white">
                草稿（僅管理員可見）
              </span>
            )}
          </div>

          <h1 className="text-3xl display tracking-tight text-shell">{event.title}</h1>
          {event.summary && <p className="mt-2 text-dim">{event.summary}</p>}

          <dl className="mt-6 grid gap-3 border-y hairline py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-faint">活動時間</dt>
              <dd className="mt-0.5 font-medium text-shell">
                {formatDateRange(event.startsAt, event.endsAt)}
              </dd>
            </div>
            {event.location && (
              <div>
                <dt className="text-sm text-faint">地點</dt>
                <dd className="mt-0.5 font-medium text-shell">{event.location}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-faint">名額</dt>
              <dd className="mt-0.5 font-medium">
                <CapacityText availability={availability} />
                {event.waitlistEnabled && availability.isFull && (
                  <span className="ml-2 text-sm text-dim">
                    （候補 {availability.waitlisted} 人）
                  </span>
                )}
              </dd>
            </div>
            {event.registrationClosesAt && (
              <div>
                <dt className="text-sm text-faint">報名截止</dt>
                <dd className="mt-0.5 font-medium text-shell">
                  {formatDateTime(event.registrationClosesAt)}
                </dd>
              </div>
            )}
          </dl>

          {event.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-lg display text-shell">活動說明</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-shell">
                {event.description}
              </p>
            </div>
          )}
        </div>
      </article>

      {/* ------------------------------------------------ 報名區塊 */}
      <section className="card mt-6 p-6 sm:p-8">
        <h2 className="mb-5 text-xl display text-shell">報名</h2>

        {existing ? (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <RegistrationStatusBadge status={existing.status} />
              <span className="text-dim">
                您已於 {formatDateTime(existing.createdAt)} 完成報名。
              </span>
            </div>

            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-faint">姓名</dt>
                <dd className="text-shell">{existing.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-faint">手機</dt>
                <dd className="text-shell">{formatPhone(existing.phone)}</dd>
              </div>
            </dl>

            <form action={cancelRegistrationAction} className="mt-5">
              <input type="hidden" name="registrationId" value={existing.id} />
              <button type="submit" className="btn-secondary">
                取消報名
              </button>
            </form>
          </div>
        ) : !user ? (
          <div>
            <p className="mb-4 text-dim">請先登入才能報名這場活動。</p>
            <Link
              href={`/login?redirectTo=${encodeURIComponent(`/events/${event.slug}`)}`}
              className="btn-primary"
            >
              登入後報名
            </Link>
          </div>
        ) : !canRegister ? (
          <div className="rounded-lg border hairline bg-transparent/5 px-4 py-3 text-dim">
            {window === 'open' && availability.isFull
              ? '很抱歉，這場活動名額已滿，且未開放候補。'
              : `目前無法報名：${registrationWindowMessage[window]}。`}
          </div>
        ) : (
          <RegistrationForm
            eventId={event.id}
            waitlist={availability.isFull}
            defaults={{
              name: user.name ?? '',
              phone: user.phone ? formatPhone(user.phone) : '',
              email: user.email ?? '',
            }}
          />
        )}
      </section>
    </div>
  )
}
