'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { registerAction } from '@/app/actions/fs'
import { emptyFormState } from '@/app/actions/types'

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

function SubmitButton({ waitlist }: { waitlist: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? '送出中…' : waitlist ? '加入候補名單' : '確認報名'}
    </button>
  )
}

export function RegistrationForm({
  slug,
  waitlist,
  defaults,
}: {
  slug: string
  waitlist: boolean
  defaults: { name: string; phone: string; email: string }
}) {
  const [state, action] = useActionState(registerAction, emptyFormState)
  const value = (key: string, fallback = '') => state.values?.[key] ?? fallback

  const Error = ({ name }: { name: string }) =>
    state.fieldErrors?.[name] ? (
      <p className="mt-1.5 text-sm text-red">{state.fieldErrors[name]}</p>
    ) : null

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">姓名 *</label>
          <input id="name" name="name" className="field" defaultValue={value('name', defaults.name)} required />
          <Error name="name" />
        </div>
        <div>
          <label htmlFor="phone" className="label">手機號碼 *</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" placeholder="0912345678"
            className="field" defaultValue={value('phone', defaults.phone)} required />
          <Error name="phone" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" className="field" defaultValue={value('email', defaults.email)} />
          <Error name="email" />
        </div>
        <div>
          <label htmlFor="helmetSize" className="label">安全帽尺寸</label>
          <select id="helmetSize" name="helmetSize" className="field" defaultValue={value('helmetSize')}>
            <option value="">未選擇</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="emergencyContactName" className="label">緊急聯絡人</label>
          <input id="emergencyContactName" name="emergencyContactName" className="field"
            defaultValue={value('emergencyContactName')} />
        </div>
        <div>
          <label htmlFor="emergencyContactPhone" className="label">緊急聯絡人電話</label>
          <input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" inputMode="tel"
            placeholder="0912345678" className="field" defaultValue={value('emergencyContactPhone')} />
          <Error name="emergencyContactPhone" />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="label">備註</label>
        <textarea id="notes" name="notes" rows={3} maxLength={500}
          placeholder="飲食禁忌、特殊需求…" className="field resize-y"
          defaultValue={value('notes')} />
      </div>

      {waitlist && (
        <p className="card p-4 text-sm text-dim">
          目前名額已滿。送出後將列入候補名單，若有人取消會自動遞補並通知您。
        </p>
      )}

      {state.error && (
        <p className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton waitlist={waitlist} />
    </form>
  )
}
