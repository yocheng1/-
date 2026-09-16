import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/session'
import { getRewardStatus } from '@/lib/fs/rewards'

export const metadata: Metadata = { title: 'My Points' }
export const dynamic = 'force-dynamic'

export default async function PointsPage() {
  const user = (await getCurrentUser())!
  const status = await getRewardStatus(user.id)

  const filled = status.available > 0 ? status.threshold : status.attended % status.threshold

  return (
    <div className="max-w-lg">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="micro text-faint">集點獎勵</p>
            <h2 className="display mt-2 text-lg">
              出席 {status.threshold} 場活動，兌換咖啡一杯
            </h2>
          </div>
          {status.available > 0 && <span className="badge-on">可兌換 {status.available} 杯</span>}
        </div>

        <div className="mt-6 flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: status.threshold }, (_, i) => (
            <span
              key={i}
              className={`flex size-12 items-center justify-center border mono text-sm ${
                i < filled ? 'border-red bg-red text-ink' : 'hairline text-faint'
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>

        <p className="mt-5 text-sm text-dim">
          已實際出席 <strong className="text-shell">{status.attended}</strong> 場
          {status.available === 0 && status.toNext > 0 && `，再出席 ${status.toNext} 場即可兌換`}
        </p>

        <div className="mt-6 border-t hairline pt-5">
          <p className="text-sm">
            限 <strong>{status.store}</strong> 兌換
          </p>
          <p className="mt-1.5 micro text-faint">
            兌換時請出示此頁面，由門市工作人員於後台核銷
          </p>
        </div>
      </section>

      <p className="mt-4 micro text-faint">
        註：只有「完成現場報到」的活動才會計入，僅報名未到場不算。
      </p>

      {status.history.length > 0 && (
        <section className="mt-8">
          <h3 className="display mb-3 text-base">兌換紀錄</h3>
          <ul className="space-y-2">
            {status.history.map((item) => (
              <li key={item.id} className="card flex justify-between gap-3 p-4 text-sm">
                <span>{item.store}</span>
                <span className="mono text-xs text-dim">
                  {new Date(item.redeemedAt).toLocaleDateString('zh-TW')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
