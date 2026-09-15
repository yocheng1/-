'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { registerAction } from '@/app/actions/registration'
import { emptyFormState } from '@/app/actions/types'

const HELMET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

function SubmitButton({ waitlist }: { waitlist: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? '送出中…' : waitlist ? '加入候補名單' : '確認報名'}
    </button>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-red-600">{message}</p>
}

export type RegistrationDefaults = {
  name: string
  phone: string
  email: string
}

export function RegistrationForm({
  eventId,
  defaults,
  waitlist,
}: {
  eventId: string
  defaults: RegistrationDefaults
  waitlist: boolean
}) {
  const [state, action] = useActionState(registerAction, emptyFormState as never)

  // 送出失敗時以使用者剛剛填的內容為準，其次才是帳號帶入的預設值
  const value = (key: string, fallback = '') => state.values?.[key] ?? fallback

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={value('name', defaults.name)}
            className="field"
            required
          />
          <FieldError message={state.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="reg-phone" className="label">
            手機號碼 <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912345678"
            defaultValue={value('phone', defaults.phone)}
            className="field"
            required
          />
          <FieldError message={state.fieldErrors?.phone} />
        </div>

        <div>
          <label htmlFor="reg-email" className="label">
            Email
          </label>
          <input
            id="reg-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={value('email', defaults.email)}
            className="field"
          />
          <FieldError message={state.fieldErrors?.email} />
        </div>

        <div>
          <label htmlFor="helmetSize" className="label">
            安全帽尺寸
          </label>
          <select id="helmetSize" name="helmetSize" className="field" defaultValue={value('helmetSize')}>
            <option value="">不需要／未選擇</option>
            {HELMET_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.helmetSize} />
        </div>

        <div>
          <label htmlFor="emergencyContactName" className="label">
            緊急聯絡人
          </label>
          <input
            id="emergencyContactName"
            name="emergencyContactName"
            type="text"
            className="field"
            defaultValue={value('emergencyContactName')}
          />
          <FieldError message={state.fieldErrors?.emergencyContactName} />
        </div>

        <div>
          <label htmlFor="emergencyContactPhone" className="label">
            緊急聯絡人電話
          </label>
          <input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            inputMode="tel"
            placeholder="0912345678"
            className="field"
            defaultValue={value('emergencyContactPhone')}
          />
          <FieldError message={state.fieldErrors?.emergencyContactPhone} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="label">
          備註
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          placeholder="飲食禁忌、特殊需求…"
          className="field resize-y"
          defaultValue={value('notes')}
        />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </div>
      )}

      {waitlist && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          目前名額已滿。送出後將列入候補名單，若有人取消會自動遞補並通知您。
        </div>
      )}

      <SubmitButton waitlist={waitlist} />
    </form>
  )
}
