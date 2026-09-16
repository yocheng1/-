'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { redeemRewardAction } from '@/app/actions/rewards'
import type { RewardStatus } from '@/lib/repo/rewards'

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? '核銷中…' : '確認兌換'}
    </button>
  )
}

export function RewardCard({ status }: { status: RewardStatus }) {
  const [state, action] = useActionState(redeemRewardAction, {} as never)
  const [staffMode, setStaffMode] = useState(false)

  const filled = status.qualifying % status.threshold
  const hasReward = status.available > 0

  // 兌換成功
  if (state.redeemedStore) {
    return (
      <section className="card p-6 text-center">
        <p className="micro text-dim">兌換完成</p>
        <p className="mt-3 text-xl font-semibold tracking-tight">已核銷一杯咖啡</p>
        <p className="mt-1.5 text-sm text-dim">{state.redeemedStore}</p>
      </section>
    )
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="micro text-faint">集點獎勵</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            參加 {status.threshold} 場活動，兌換咖啡一杯
          </h2>
        </div>
        {hasReward && (
          <span className="badge-on">可兌換 {status.available} 杯</span>
        )}
      </div>

      {/* 集點格 */}
      <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: status.threshold }, (_, i) => (
          <span
            key={i}
            className={`flex size-11 items-center justify-center border text-sm ${
              i < (hasReward ? status.threshold : filled)
                ? 'border-paper bg-paper text-ink'
                : 'hairline text-faint'
            }`}
          >
            {i + 1}
          </span>
        ))}
      </div>

      <p className="mt-4 text-sm text-dim">
        已累積 <strong className="text-paper">{status.qualifying}</strong> 場已結束的活動
        {!hasReward && status.toNext > 0 && `，再參加 ${status.toNext} 場即可兌換`}
      </p>

      {hasReward && (
        <div className="mt-6 border-t hairline pt-5">
          {!staffMode ? (
            <>
              <button
                type="button"
                onClick={() => setStaffMode(true)}
                className="btn-primary w-full"
              >
                兌換咖啡
              </button>
              <p className="mt-3 text-center micro text-faint">
                限 {status.store} · 請由工作人員操作
              </p>
            </>
          ) : (
            <form action={action} className="space-y-4">
              <div className="border hairline px-4 py-4 text-center">
                <p className="micro text-dim">請將手機交給工作人員</p>
                <p className="mt-2 text-sm text-dim">
                  限 <strong>{status.store}</strong> 兌換
                </p>
              </div>

              <div>
                <label htmlFor="pin" className="label">
                  工作人員密碼
                </label>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className="field text-center tracking-[0.3em]"
                  autoFocus
                  required
                />
                {state.fieldErrors?.pin && (
                  <p className="mt-1.5 text-sm text-red-400">{state.fieldErrors.pin}</p>
                )}
              </div>

              {state.error && (
                <div
                  className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                  role="alert"
                >
                  {state.error}
                </div>
              )}

              <ConfirmButton />

              <button
                type="button"
                onClick={() => setStaffMode(false)}
                className="w-full text-center micro text-faint transition hover:text-dim"
              >
                取消
              </button>
            </form>
          )}
        </div>
      )}

      {status.history.length > 0 && (
        <p className="mt-5 micro text-faint">
          已兌換 {status.history.length} 次 · 最近一次{' '}
          {new Date(status.history[0].redeemedAt).toLocaleDateString('zh-TW')}
        </p>
      )}
    </section>
  )
}
