'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { createPrizeAction } from '@/app/actions/fs'
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

  useEffect(() => {
    if (state.message) formRef.current?.reset()
  }, [state.message])

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor="prize-name" className="label">獎項名稱</label>
          <input id="prize-name" name="name" className="field" placeholder="例：KPlus 限量聯名安全帽" required />
          {state.fieldErrors?.name && <p className="mt-1 text-sm text-red">{state.fieldErrors.name}</p>}
        </div>
        <div>
          <label htmlFor="prize-quantity" className="label">抽出幾位</label>
          <input id="prize-quantity" name="quantity" type="number" min={1} defaultValue={1} className="field" required />
          {state.fieldErrors?.quantity && <p className="mt-1 text-sm text-red">{state.fieldErrors.quantity}</p>}
        </div>
      </div>

      <label className="flex items-start gap-2.5">
        <input type="checkbox" name="isBonus" className="mt-1 size-4 accent-red" />
        <span className="text-sm">
          <span className="font-medium">這是加碼獎項</span>
          <span className="mt-0.5 block text-dim">
            新增的當下，現場大螢幕會跳出「加碼獎項登場」。事前不會出現在任何清單上。
          </span>
        </span>
      </label>

      {state.error && <p className="text-sm text-red">{state.error}</p>}
      {state.message && <p className="text-sm text-dim">{state.message}</p>}

      <SubmitButton />
    </form>
  )
}
