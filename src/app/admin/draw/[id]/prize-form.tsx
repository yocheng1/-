'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { createPrizeAction } from '@/app/actions/draw'
import { emptyFormState } from '@/app/actions/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '新增中…' : '新增獎項'}
    </button>
  )
}

export function PrizeForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createPrizeAction, emptyFormState)
  const formRef = useRef<HTMLFormElement>(null)

  // 新增成功後把欄位清空，方便連續加好幾個獎項
  useEffect(() => {
    if (state.message) formRef.current?.reset()
  }, [state.message])

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor="prize-name" className="label">
            獎項名稱 <span className="text-red-500">*</span>
          </label>
          <input
            id="prize-name"
            name="name"
            className="field"
            placeholder="例：KPlus 限量聯名安全帽"
            defaultValue={state.values?.name ?? ''}
            required
          />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-sm text-red-400">{state.fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="prize-quantity" className="label">
            抽出幾位
          </label>
          <input
            id="prize-quantity"
            name="quantity"
            type="number"
            min={1}
            className="field"
            defaultValue={state.values?.quantity ?? '1'}
            required
          />
          {state.fieldErrors?.quantity && (
            <p className="mt-1 text-sm text-red-400">{state.fieldErrors.quantity}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="prize-description" className="label">
          說明（選填）
        </label>
        <input
          id="prize-description"
          name="description"
          className="field"
          defaultValue={state.values?.description ?? ''}
        />
      </div>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="isBonus"
          className="mt-0.5 size-4 rounded hairline text-shell focus:ring-white/30"
        />
        <span className="text-sm">
          <span className="font-medium text-shell">這是加碼獎項</span>
          <span className="mt-0.5 block text-dim">
            勾選後，新增的當下現場所有人的畫面會跳出「加碼獎項登場」。
            事前不會出現在任何清單上。
          </span>
        </span>
      </label>

      {state.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {state.error}
        </div>
      )}
      {state.message && (
        <div className="rounded-lg border hairline bg-white/5 text-shell" role="status">
          {state.message}
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
