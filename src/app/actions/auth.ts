'use server'

import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { requestOtp, verifyOtp } from '@/lib/auth/otp'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { signIn, signOut } from '@/lib/auth/session'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
import {
  createUser,
  findOrCreateUserByPhone,
  findUserByEmail,
} from '@/lib/repo/users'
import {
  emailLoginSchema,
  emailSignupSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '@/lib/validation'
import { fieldErrorsFrom, rawValues, type FormState, type OtpState } from './types'

/** 只允許站內相對路徑，避免變成開放式轉址。 */
function safeRedirect(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : ''
  if (value.startsWith('/') && !value.startsWith('//')) return value
  return '/events'
}

// ------------------------------------------------------------ 手機 OTP 登入

export async function requestOtpAction(
  _prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const values = rawValues(formData, ['phone'])

  const parsed = requestOtpSchema.safeParse({ phone: formData.get('phone') })
  if (!parsed.success) {
    return { step: 'phone', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const result = await requestOtp(parsed.data.phone)
  if (!result.ok) {
    return { step: 'phone', error: result.error, values }
  }

  return {
    step: 'code',
    phone: parsed.data.phone,
    message: '驗證碼已傳送，5 分鐘內有效。',
    devCode: env.showOtpInResponse ? result.devCode : undefined,
  }
}

export async function verifyOtpAction(
  prev: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const parsed = verifyOtpSchema.safeParse({
    phone: formData.get('phone'),
    code: formData.get('code'),
  })
  if (!parsed.success) {
    return { ...prev, step: 'code', fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  const result = verifyOtp(parsed.data.phone, parsed.data.code)
  if (!result.ok) {
    return { ...prev, step: 'code', error: result.error }
  }

  const user = findOrCreateUserByPhone(parsed.data.phone)
  await signIn(user.id)

  redirect(safeRedirect(formData.get('redirectTo')))
}

// ------------------------------------------------------------ Email + 密碼

const LOGIN_ATTEMPT_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export async function emailLoginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailLoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  const values = rawValues(formData, ['email'])

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const { email, password } = parsed.data

  const limit = checkRateLimit(`login:email:${email}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS)
  if (!limit.allowed) {
    return {
      error: `嘗試次數過多，請於 ${Math.ceil(limit.retryAfterSeconds / 60)} 分鐘後再試。`,
      values,
    }
  }

  const user = findUserByEmail(email)

  // 帳號不存在與密碼錯誤回傳相同訊息，避免被用來探測哪些 email 有註冊
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Email 或密碼不正確。', values }
  }

  resetRateLimit(`login:email:${email}`)
  await signIn(user.id)

  redirect(safeRedirect(formData.get('redirectTo')))
}

export async function emailSignupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  const values = rawValues(formData, ['name', 'email'])

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const { name, email, password } = parsed.data

  const existing = findUserByEmail(email)
  if (existing) {
    // 這個 email 已經透過 LINE 登入建立過帳號，補上密碼即可
    if (!existing.passwordHash) {
      return {
        error: '這個 Email 已使用其他方式登入過，請改用該方式登入。',
        values,
      }
    }
    return { error: '這個 Email 已經註冊過了，請直接登入。', values }
  }

  const user = createUser({
    name,
    email,
    passwordHash: await hashPassword(password),
    // 這個版本尚未實作 email 驗證信，先標記為未驗證
    emailVerified: false,
  })

  await signIn(user.id)

  redirect(safeRedirect(formData.get('redirectTo')))
}

// ------------------------------------------------------------ 登出

export async function signOutAction(): Promise<void> {
  await signOut()
  redirect('/events')
}
