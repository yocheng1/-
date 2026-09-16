import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminCancelRegistrationAction, deleteEventAction } from '@/app/actions/admin'
import { EventForm } from '@/app/admin/event-form'
import { RegistrationStatusBadge } from '@/components/badges'
import { formatDateTime } from '@/lib/format'
import { findEventById } from '@/lib/repo/events'
import { getAvailability, listEventRegistrations } from '@/lib/repo/registrations'
import { formatPhone } from '@/lib/validation'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const event = findEventById(id)
  return { title: event ? `管理：${event.title}` : '找不到活動' }
}

export default async function AdminEventPage({ params }: PageProps) {
  const { id } = await params
  const event = findEventById(id)
  if (!event) notFound()

  const registrations = listEventRegistrations(event.id)
  const availability = getAvailability(event)

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm text-dim hover:text-paper">
        ← 回後台
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-paper">{event.title}</h1>
          <p className="mt-1.5 font-mono text-sm text-faint">/events/{event.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/events/${event.slug}`} className="btn-secondary">
            查看前台頁面
          </Link>
          <Link href={`/admin/draw/${event.id}`} className="btn-primary">
            現場抽獎控制台
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------ 報名名單 */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-paper">
            報名名單
            <span className="ml-2 text-base font-normal text-dim">
              已確認 {availability.confirmed}
              {event.capacity > 0 && ` / ${event.capacity}`}
              {availability.waitlisted > 0 && `・候補 ${availability.waitlisted}`}
            </span>
          </h2>

          {registrations.length > 0 && (
            <a href={`/admin/events/${event.id}/export`} className="btn-secondary">
              匯出 CSV
            </a>
          )}
        </div>

        {registrations.length === 0 ? (
          <p className="card p-8 text-center text-dim">目前還沒有人報名。</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b hairline bg-transparent/5 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-dim">#</th>
                  <th className="px-4 py-3 font-semibold text-dim">狀態</th>
                  <th className="px-4 py-3 font-semibold text-dim">姓名</th>
                  <th className="px-4 py-3 font-semibold text-dim">聯絡方式</th>
                  <th className="px-4 py-3 font-semibold text-dim">尺寸</th>
                  <th className="px-4 py-3 font-semibold text-dim">緊急聯絡人</th>
                  <th className="px-4 py-3 font-semibold text-dim">報名時間</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {registrations.map((registration, index) => (
                  <tr
                    key={registration.id}
                    className={registration.status === 'cancelled' ? 'opacity-50' : ''}
                  >
                    <td className="px-4 py-3 text-faint">{index + 1}</td>
                    <td className="px-4 py-3">
                      <RegistrationStatusBadge status={registration.status} />
                    </td>
                    <td className="px-4 py-3 font-medium text-paper">
                      {registration.name}
                      {registration.notes && (
                        <div className="mt-0.5 text-xs font-normal text-dim">
                          備註：{registration.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      <div>{formatPhone(registration.phone)}</div>
                      {registration.email && (
                        <div className="text-xs text-faint">{registration.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {registration.helmetSize ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {registration.emergencyContactName ? (
                        <>
                          <div>{registration.emergencyContactName}</div>
                          {registration.emergencyContactPhone && (
                            <div className="text-xs text-faint">
                              {formatPhone(registration.emergencyContactPhone)}
                            </div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-dim">
                      {formatDateTime(registration.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {registration.status !== 'cancelled' && (
                        <form action={adminCancelRegistrationAction}>
                          <input
                            type="hidden"
                            name="registrationId"
                            value={registration.id}
                          />
                          <input type="hidden" name="eventId" value={event.id} />
                          <button
                            type="submit"
                            className="btn-secondary px-3 py-1.5"
                          >
                            取消
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ 編輯活動 */}
      <section>
        <h2 className="mb-3 text-xl font-bold text-paper">編輯活動</h2>
        <EventForm event={event} />
      </section>

      {/* ------------------------------------------------ 刪除 */}
      <section className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6">
        <h2 className="text-lg font-bold text-red-300">刪除活動</h2>
        <p className="mt-1 mb-4 text-sm text-red-300">
          刪除後這場活動的 {registrations.length} 筆報名紀錄也會一併移除，且無法復原。
        </p>
        <form action={deleteEventAction}>
          <input type="hidden" name="id" value={event.id} />
          <button type="submit" className="btn-danger">
            永久刪除這場活動
          </button>
        </form>
      </section>
    </div>
  )
}
