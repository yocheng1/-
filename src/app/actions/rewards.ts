'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { redeemReward } from '@/lib/repo/rewards'
import type { FormState } from './types'

export type RedeemState = FormState & { redeemedStore?: string }

/**
 * 核銷獎勵。由工作人員在門市輸入密碼後送出。
 */
export async function redeemRewardAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const user = await getCurrentUser()
  if (!user) return { error: '請先登入。' }

  const pin = String(formData.get('pin') ?? '')
  if (!pin.trim()) return { fieldErrors: { pin: '請輸入工作人員密碼' } }

  const result = redeemReward(user.id, pin)
  if (!result.ok) return { error: result.error }

  revalidatePath('/me')
  return { message: '兌換完成', redeemedStore: result.store }
}
