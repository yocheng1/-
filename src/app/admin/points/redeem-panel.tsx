'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { redeemRewardAction } from '@/app/actions/fs'
import { emptyFormState } from '@/app/actions/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '核銷中…' : '確認核銷'}
    </button>
  )
}

export function RedeemPanel({
  userId,
  name,
  available,
}: {
  userId: string
  name: string
  available: number
}) {
  const [state, action] = useActionState(redeemRewardAction, emptyFormState)
  const [open, setOpen] = useState(false)

  if (state.message) {
    return <span className="badge-on">{state.message}</span>
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <span className="badge-on">可兌換 {available} 杯</span>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
          核銷
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="micro text-dim">核銷 {name} 的咖啡？</span>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
        取消
      </button>
      {state.error && <span className="text-sm text-red">{state.error}</span>}
    </form>
  )
}
