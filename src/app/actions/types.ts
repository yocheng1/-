/** 所有 form action 共用的回傳格式，搭配 useActionState 使用。 */
export type FormState = {
  error?: string
  /** 欄位層級的錯誤訊息，key 為欄位名稱 */
  fieldErrors?: Record<string, string>
  message?: string
  /**
   * 送出失敗時原樣帶回使用者填過的內容。
   *
   * React 19 在 form action 結束後會把非受控欄位重設回 defaultValue，
   * 若不帶回這些值，使用者一打錯字整張表單就會被清空。
   * 密碼類欄位刻意不放進來。
   */
  values?: Record<string, string>
}

export const emptyFormState: FormState = {}

import type { ZodError } from 'zod'

/** 從 FormData 取出指定欄位的字串值，用來回填表單。 */
export function rawValues(formData: FormData, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = formData.get(key)
    if (typeof value === 'string') result[key] = value
  }
  return result
}

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !result[key]) {
      result[key] = issue.message
    }
  }
  return result
}

/**
 * 手機 OTP 登入是兩段式流程，狀態要帶著「現在在哪一步」。
 *
 * 這些常數放在這裡而不是 auth.ts —— 標了 'use server' 的檔案
 * 只能 export async function，不能 export 物件。
 */
export type OtpState = FormState & {
  step: 'phone' | 'code'
  phone?: string
  /** 僅在開發模式帶回，方便測試 */
  devCode?: string
}

export const initialOtpState: OtpState = { step: 'phone' }
