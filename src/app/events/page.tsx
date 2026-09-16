import type { Metadata } from 'next'
import Link from 'next/link'
import { CapacityText, WindowBadge } from '@/components/badges'
import { formatDateRange } from '@/lib/format'
import { listPublicEvents, registrationWindow } from '@/lib/repo/events'
import { getAvailability } from '@/lib/repo/registrations'

export const metadata: Metadata = { title: '活動列表' }

// 名額是即時資料，不做靜態快取
export const dynamic = 'force-dynamic'

export default function EventsPage() {
  const events = listPublicEvents()

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-paper">活動列表</h1>
        <p className="mt-1.5 text-dim">選擇有興趣的活動，登入後即可報名。</p>
      </header>

      {events.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-dim">目前沒有開放中的活動</p>
          <p className="mt-1 text-sm text-faint">請稍後再回來看看。</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => {
            const availability = getAvailability(event)
            const window = registrationWindow(event)

            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.slug}`}
                  className="card flex h-full flex-col overflow-hidden transition hover:hairline hover:shadow-md"
                >
                  {event.coverImageUrl && (
                    // 封面由後台填入外部網址，故使用原生 img 避免綁定 next/image 網域設定
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.coverImageUrl}
                      alt=""
                      className="h-40 w-full object-cover"
                    />
                  )}

                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <WindowBadge window={window} availability={availability} />
                    </div>

                    <h2 className="text-lg font-bold text-paper">{event.title}</h2>

                    {event.summary && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-dim">
                        {event.summary}
                      </p>
                    )}

                    <dl className="mt-4 space-y-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-faint">時間</dt>
                        <dd className="text-paper">
                          {formatDateRange(event.startsAt, event.endsAt)}
                        </dd>
                      </div>
                      {event.location && (
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-faint">地點</dt>
                          <dd className="text-paper">{event.location}</dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-sm">
                      <CapacityText availability={availability} />
                      <span className="font-semibold text-paper">查看詳情 →</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
