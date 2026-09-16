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
      <Link href="/admin" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-600">
        ← 回後台
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink">{event.title}</h1>
          <p className="mt-1.5 font-mono text-sm text-slate-400">/events/{event.slug}</p>
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
          <h2 className="text-xl font-bold text-ink">
            報名名單
            <span className="ml-2 text-base font-normal text-slate-500">
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
          <p className="card p-8 text-center text-slate-500">目前還沒有人報名。</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-600">#</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">狀態</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">姓名</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">聯絡方式</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">尺寸</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">緊急聯絡人</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">報名時間</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((registration, index) => (
                  <tr
                    key={registration.id}
                    className={registration.status === 'cancelled' ? 'opacity-50' : ''}
                  >
                    <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <RegistrationStatusBadge status={registration.status} />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {registration.name}
                      {registration.notes && (
                        <div className="mt-0.5 text-xs font-normal text-slate-500">
                          備註：{registration.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{formatPhone(registration.phone)}</div>
                      {registration.email && (
                        <div className="text-xs text-slate-400">{registration.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {registration.helmetSize ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {registration.emergencyContactName ? (
                        <>
                          <div>{registration.emergencyContactName}</div>
                          {registration.emergencyContactPhone && (
                            <div className="text-xs text-slate-400">
                              {formatPhone(registration.emergencyContactPhone)}
                            </div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-500">
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
                            className="text-sm font-medium text-red-600 hover:text-red-700"
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
        <h2 className="mb-3 text-xl font-bold text-ink">編輯活動</h2>
        <EventForm event={event} />
      </section>

      {/* ------------------------------------------------ 刪除 */}
      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-bold text-red-800">刪除活動</h2>
        <p className="mt-1 mb-4 text-sm text-red-700">
          刪除後這場活動的 {registrations.length} 筆報名紀錄也會一併移除，且無法復原。
        </p>
        <form action={deleteEventAction}>
          <input type="hidden" name="id" value={event.id} />
          <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700">
            永久刪除這場活動
          </button>
        </form>
      </section>
    </div>
  )
}
