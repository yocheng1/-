import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cancelRegistrationAction } from '@/app/actions/registration'
import { RegistrationStatusBadge } from '@/components/badges'
import { getCurrentUser } from '@/lib/auth/session'
import { formatDateRange, formatDateTime } from '@/lib/format'
import { listUserRegistrations } from '@/lib/repo/registrations'
import { listUserIdentities } from '@/lib/repo/users'
import { getRewardStatus } from '@/lib/repo/rewards'
import { RewardCard } from './reward-card'
import { formatPhone } from '@/lib/validation'

export const metadata: Metadata = { title: '我的報名' }
export const dynamic = 'force-dynamic'

const PROVIDER_LABELS: Record<string, string> = { line: 'LINE', google: 'Google' }

export default async function MyRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>
}) {
  const { cancelled } = await searchParams

  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fme&error=login_required')

  const registrations = listUserRegistrations(user.id)
  const identities = listUserIdentities(user.id)
  const reward = getRewardStatus(user.id)

  const active = registrations.filter((r) => r.status !== 'cancelled')
  const past = registrations.filter((r) => r.status === 'cancelled')

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-paper">我的報名</h1>
        <p className="mt-1.5 text-dim">
          {user.name || '會員'}
          {user.phone && ` ・ ${formatPhone(user.phone)}`}
          {user.email && ` ・ ${user.email}`}
          {identities.length > 0 &&
            ` ・ 已綁定 ${identities.map((i) => PROVIDER_LABELS[i.provider] ?? i.provider).join('、')}`}
        </p>
      </header>

      <div className="mb-8">
        <RewardCard status={reward} />
      </div>

      {cancelled && (
        <div
          className="mb-6 rounded-xl border hairline bg-transparent/5 px-4 py-3 text-paper"
          role="status"
        >
          已取消報名。若該活動有候補名單，名額已自動遞補給下一位。
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-dim">您還沒有任何報名紀錄</p>
          <Link href="/events" className="btn-primary mt-4">
            去看看有哪些活動
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-bold text-paper">進行中的報名</h2>
            {active.length === 0 ? (
              <p className="card p-6 text-sm text-dim">沒有進行中的報名。</p>
            ) : (
              <ul className="space-y-3">
                {active.map((registration) => (
                  <li key={registration.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <RegistrationStatusBadge status={registration.status} />
                        </div>
                        <Link
                          href={`/events/${registration.event.slug}`}
                          className="text-lg font-bold text-paper hover:text-paper"
                        >
                          {registration.event.title}
                        </Link>
                        <p className="mt-1 text-sm text-dim">
                          {formatDateRange(
                            registration.event.startsAt,
                            registration.event.endsAt,
                          )}
                          {registration.event.location && ` ・ ${registration.event.location}`}
                        </p>
                        <p className="mt-1 text-xs text-faint">
                          報名時間 {formatDateTime(registration.createdAt)}
                        </p>
                      </div>

                      <form action={cancelRegistrationAction}>
                        <input type="hidden" name="registrationId" value={registration.id} />
                        <button type="submit" className="btn-secondary">
                          取消報名
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-dim">已取消</h2>
              <ul className="space-y-3">
                {past.map((registration) => (
                  <li key={registration.id} className="card p-5 opacity-70">
                    <div className="mb-1.5">
                      <RegistrationStatusBadge status={registration.status} />
                    </div>
                    <Link
                      href={`/events/${registration.event.slug}`}
                      className="font-semibold text-paper hover:text-paper"
                    >
                      {registration.event.title}
                    </Link>
                    <p className="mt-1 text-sm text-dim">
                      {formatDateRange(registration.event.startsAt, registration.event.endsAt)}
                    </p>
                    {registration.cancelledAt && (
                      <p className="mt-1 text-xs text-faint">
                        取消時間 {formatDateTime(registration.cancelledAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
