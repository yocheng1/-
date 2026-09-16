'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { publish } from '@/lib/draw-bus'
import { findEventById } from '@/lib/repo/events'
import { createPrize, deletePrize, drawPrize, findPrize, resetPrizeDraw } from '@/lib/repo/draw'
import { fieldErrorsFrom, rawValues, type FormState } from './types'
import { z } from 'zod'

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fadmin&error=login_required')
  if (user.role !== 'admin') redirect('/events')
  return user
}

const prizeSchema = z.object({
  name: z.string().trim().min(1, '請輸入獎項名稱').max(100, '名稱太長'),
  description: z.string().trim().max(300).optional(),
  quantity: z.coerce.number().int().min(1, '至少要抽 1 位').max(1000, '數量太大'),
  isBonus: z.coerce.boolean().optional(),
})

export async function createPrizeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const eventId = String(formData.get('eventId') ?? '')
  const event = findEventById(eventId)
  if (!event) return { error: '找不到這場活動。' }

  const values = rawValues(formData, ['name', 'description', 'quantity'])

  const parsed = prizeSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    quantity: formData.get('quantity'),
    isBonus: formData.get('isBonus') === 'on',
  })
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const prize = createPrize(eventId, {
    name: parsed.data.name,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    isBonus: parsed.data.isBonus,
  })

  // 加碼獎項一新增，現場所有人的畫面就會跳出來
  publish(eventId, { type: 'prize-added', prizeId: prize.id, isBonus: prize.isBonus })

  revalidatePath(`/admin/draw/${eventId}`)
  return { message: `已新增獎項：${prize.name}` }
}

export async function drawPrizeAction(formData: FormData): Promise<void> {
  await requireAdmin()

  const prizeId = String(formData.get('prizeId') ?? '')
  const prize = findPrize(prizeId)
  if (!prize) return

  const result = drawPrize(prizeId)
  if (!result.ok) {
    // 讓主持人在後台看到原因（例如所有人都中過了）
    publish(prize.eventId, { type: 'state' })
    revalidatePath(`/admin/draw/${prize.eventId}`)
    return
  }

  publish(prize.eventId, { type: 'drawn', prizeId })
  revalidatePath(`/admin/draw/${prize.eventId}`)
}

export async function resetPrizeAction(formData: FormData): Promise<void> {
  await requireAdmin()

  const prizeId = String(formData.get('prizeId') ?? '')
  const prize = findPrize(prizeId)
  if (!prize) return

  resetPrizeDraw(prizeId)

  publish(prize.eventId, { type: 'reset', prizeId })
  revalidatePath(`/admin/draw/${prize.eventId}`)
}

export async function deletePrizeAction(formData: FormData): Promise<void> {
  await requireAdmin()

  const prizeId = String(formData.get('prizeId') ?? '')
  const prize = findPrize(prizeId)
  if (!prize) return

  deletePrize(prizeId)

  publish(prize.eventId, { type: 'state' })
  revalidatePath(`/admin/draw/${prize.eventId}`)
}
