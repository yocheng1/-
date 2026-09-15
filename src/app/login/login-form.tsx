'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  emailLoginAction,
  emailSignupAction,
  requestOtpAction,
  verifyOtpAction,
} from '../actions/auth'
import { emptyFormState, initialOtpState } from '../actions/types'

type Tab = 'otp' | 'email' | 'signup'

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? '處理中…' : children}
    </button>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-red-600">{message}</p>
}

function Alert({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  const styles =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-brand-200 bg-brand-50 text-brand-800'
  return (
    // 錯誤才用 alert（螢幕閱讀器會打斷朗讀）；一般提示用 status 就好
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${styles}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}

// --------------------------------------------------------------- 手機 OTP

function OtpPanel({ redirectTo }: { redirectTo: string }) {
  const [requestState, requestAction] = useActionState(requestOtpAction, initialOtpState)
  const [verifyState, verifyAction] = useActionState(verifyOtpAction, initialOtpState)

  // 送出驗證碼之後就切到第二步；驗證失敗時沿用第二步的狀態
  const state = verifyState.step === 'code' || verifyState.error ? verifyState : requestState
  const phone = verifyState.phone ?? requestState.phone
  const onCodeStep = (requestState.step === 'code' || verifyState.step === 'code') && phone

  if (!onCodeStep) {
    return (
      <form action={requestAction} className="space-y-4">
        <div>
          <label htmlFor="phone" className="label">
            手機號碼
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912345678"
            className="field"
            defaultValue={requestState.values?.phone ?? ''}
            required
          />
          <FieldError message={requestState.fieldErrors?.phone} />
        </div>

        {requestState.error && <Alert kind="error">{requestState.error}</Alert>}

        <SubmitButton>傳送驗證碼</SubmitButton>
        <p className="text-xs text-slate-500">
          第一次使用手機號碼登入時，系統會自動為您建立帳號。
        </p>
      </form>
    )
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div>
        <label htmlFor="code" className="label">
          驗證碼
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6 位數字"
          className="field text-center text-lg tracking-[0.4em]"
          autoFocus
          required
        />
        <FieldError message={state.fieldErrors?.code} />
        <p className="mt-1.5 text-xs text-slate-500">
          已傳送至 {phone?.replace('+886', '0')}
        </p>
      </div>

      {requestState.devCode && (
        <Alert kind="info">
          開發模式驗證碼：<span className="font-mono font-bold">{requestState.devCode}</span>
        </Alert>
      )}

      {state.error && <Alert kind="error">{state.error}</Alert>}

      <SubmitButton>登入</SubmitButton>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full text-center text-sm text-slate-500 hover:text-brand-600"
      >
        重新輸入手機號碼
      </button>
    </form>
  )
}

// --------------------------------------------------------------- Email 登入

function EmailLoginPanel({ redirectTo }: { redirectTo: string }) {
  const [state, action] = useActionState(emailLoginAction, emptyFormState)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div>
        <label htmlFor="login-email" className="label">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          className="field"
          defaultValue={state.values?.email ?? ''}
          required
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="login-password" className="label">
          密碼
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="field"
          required
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      {state.error && <Alert kind="error">{state.error}</Alert>}

      <SubmitButton>登入</SubmitButton>
    </form>
  )
}

// --------------------------------------------------------------- 註冊

function SignupPanel({ redirectTo }: { redirectTo: string }) {
  const [state, action] = useActionState(emailSignupAction, emptyFormState)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div>
        <label htmlFor="signup-name" className="label">
          姓名
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          className="field"
          defaultValue={state.values?.name ?? ''}
          required
        />
        <FieldError message={state.fieldErrors?.name} />
      </div>

      <div>
        <label htmlFor="signup-email" className="label">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          className="field"
          defaultValue={state.values?.email ?? ''}
          required
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="signup-password" className="label">
          密碼
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="field"
          required
        />
        <FieldError message={state.fieldErrors?.password} />
        <p className="mt-1 text-xs text-slate-500">至少 8 個字元，需包含英文字母與數字。</p>
      </div>

      {state.error && <Alert kind="error">{state.error}</Alert>}

      <SubmitButton>建立帳號</SubmitButton>
    </form>
  )
}

// --------------------------------------------------------------- 主元件

const TABS: { key: Tab; label: string }[] = [
  { key: 'otp', label: '手機驗證碼' },
  { key: 'email', label: 'Email 登入' },
  { key: 'signup', label: '註冊' },
]

export function LoginForm({
  redirectTo,
  lineEnabled,
  initialError,
}: {
  redirectTo: string
  lineEnabled: boolean
  initialError?: string
}) {
  const [tab, setTab] = useState<Tab>('otp')

  return (
    <div className="space-y-5">
      {initialError && <Alert kind="error">{initialError}</Alert>}

      <div className="flex rounded-lg bg-slate-100 p-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition ${
              tab === item.key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'otp' && <OtpPanel redirectTo={redirectTo} />}
      {tab === 'email' && <EmailLoginPanel redirectTo={redirectTo} />}
      {tab === 'signup' && <SignupPanel redirectTo={redirectTo} />}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">或</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {lineEnabled ? (
        <a
          href={`/api/auth/line/start?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="btn w-full bg-[#06C755] text-white hover:bg-[#05b34c]"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M12 2C6.5 2 2 5.7 2 10.2c0 4 3.5 7.4 8.3 8.1.3.07.8.2.9.5.08.3.05.7.03.98l-.14.86c-.04.25-.2 1 .87.54s5.8-3.4 7.9-5.83C21.3 13.7 22 12 22 10.2 22 5.7 17.5 2 12 2Z" />
          </svg>
          使用 LINE 登入
        </a>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-center text-sm text-slate-500">
          LINE 登入尚未設定
          <span className="mt-0.5 block text-xs">
            請在 .env.local 填入 LINE_CHANNEL_ID 與 LINE_CHANNEL_SECRET
          </span>
        </div>
      )}
    </div>
  )
}
