'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { registrationId } from '@/lib/firebase/admin'
import { checkIn, undoCheckIn } from '@/lib/fs/checkin'
import { createPrize, drawPrize, redrawWinner } from '@/lib/fs/draw'
import { findEventById, findEventBySlug, saveEvent } from '@/lib/fs/events'
import { cancelRegistration, createRegistration } from '@/lib/fs/registrations'
import { redeemReward } from '@/lib/fs/rewards'
import { fieldErrorsFrom, rawValues, type FormState } from './types'
import { registrationSchema } from '@/lib/validation'
import { taipeiLocalToIso } from '@/lib/format'

/**
 * 目前沿用既有的 session 登入，把它的使用者 ID 當成 Firestore 的 userId。
 * 之後換成 Firebase Auth 時，只要這裡改成讀 Auth 的 uid 即可。
 */
async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?error=login_required')
  return user
}

async function requireStaff() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/events')
  return user
}

// ---------------------------------------------------------------- 報名

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser()
  const slug = String(formData.get('slug') ?? '')

  const values = rawValues(formData, [
    'name', 'phone', 'email', 'helmetSize',
    'emergencyContactName', 'emergencyContactPhone', 'notes',
  ])

  const event = await findEventBySlug(slug)
  if (!event) return { error: '找不到這場活動。', values }

  const parsed = registrationSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? '',
    helmetSize: formData.get('helmetSize') ?? '',
    emergencyContactName: formData.get('emergencyContactName') ?? '',
    emergencyContactPhone: formData.get('emergencyContactPhone') ?? '',
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values }

  const result = await createRegistration(event.id, user.id, parsed.data)
  if (!result.ok) return { error: result.error, values }

  revalidatePath('/events')
  revalidatePath(`/events/${slug}`)
  revalidatePath('/member/events')

  redirect(`/member/ticket/${result.id}?new=1`)
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const eventId = String(formData.get('eventId') ?? '')

  await cancelRegistration(eventId, user.id, user.id)

  revalidatePath('/member/events')
  revalidatePath('/events')
  redirect('/member/events?cancelled=1')
}

// ---------------------------------------------------------------- 現場報到

export async function checkInAction(formData: FormData): Promise<void> {
  const staff = await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')
  const regId = String(formData.get('registrationId') ?? '')

  await checkIn(eventId, regId, staff.id)
  revalidatePath(`/admin/checkin/${eventId}`)
}

export async function undoCheckInAction(formData: FormData): Promise<void> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')
  const regId = String(formData.get('registrationId') ?? '')

  await undoCheckIn(eventId, regId)
  revalidatePath(`/admin/checkin/${eventId}`)
}

// ---------------------------------------------------------------- 抽獎

export async function createPrizeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')

  const name = String(formData.get('name') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 1)
  if (!name) return { fieldErrors: { name: '請輸入獎項名稱' } }
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { fieldErrors: { quantity: '至少要抽 1 位' } }
  }

  const prize = await createPrize(eventId, {
    name,
    quantity,
    isBonus: formData.get('isBonus') === 'on',
  })

  revalidatePath(`/admin/draw/${eventId}`)
  return { message: `已新增獎項：${prize.name}` }
}

export async function drawPrizeAction(formData: FormData): Promise<void> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')
  const prizeId = String(formData.get('prizeId') ?? '')

  const result = await drawPrize(prizeId)
  revalidatePath(`/admin/draw/${eventId}`)

  if (!result.ok) {
    redirect(`/admin/draw/${eventId}?error=${encodeURIComponent(result.error)}`)
  }
}

export async function redrawWinnerAction(formData: FormData): Promise<void> {
  await requireStaff()
  const eventId = String(formData.get('eventId') ?? '')
  const winnerDocId = String(formData.get('winnerId') ?? '')

  const result = await redrawWinner(winnerDocId)
  revalidatePath(`/admin/draw/${eventId}`)

  if (!result.ok) {
    redirect(`/admin/draw/${eventId}?error=${encodeURIComponent(result.error)}`)
  }
}

// ---------------------------------------------------------------- 集點核銷

export async function redeemRewardAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const staff = await requireStaff()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: '請先選擇要核銷的會員。' }

  const result = await redeemReward(userId, staff.id)
  if (!result.ok) return { error: result.error }

  revalidatePath('/admin/points')
  return { message: `已核銷一杯咖啡（${result.store}），該會員尚餘 ${result.remaining} 杯。` }
}

// ---------------------------------------------------------------- 活動管理

export async function saveEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff()

  const id = String(formData.get('id') ?? '')
  const values = rawValues(formData, [
    'title', 'slug', 'summary', 'description', 'location',
    'startsAt', 'endsAt', 'registrationClosesAt', 'capacity', 'status', 'drawPool',
  ])

  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const startsAt = taipeiLocalToIso(String(formData.get('startsAt') ?? ''))
  const endsAt = taipeiLocalToIso(String(formData.get('endsAt') ?? ''))

  if (!title) return { fieldErrors: { title: '請輸入活動名稱' }, values }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { fieldErrors: { slug: '只能使用小寫英文、數字與連字號' }, values }
  }
  if (!startsAt || !endsAt) return { fieldErrors: { startsAt: '請填寫活動時間' }, values }
  if (new Date(endsAt) < new Date(startsAt)) {
    return { fieldErrors: { endsAt: '結束時間不能早於開始時間' }, values }
  }

  try {
    await saveEvent(
      {
        title, slug,
        summary: String(formData.get('summary') ?? ''),
        description: String(formData.get('description') ?? ''),
        location: String(formData.get('location') ?? ''),
        startsAt, endsAt,
        registrationClosesAt: taipeiLocalToIso(String(formData.get('registrationClosesAt') ?? '')) || null,
        capacity: Number(formData.get('capacity') ?? 0),
        waitlistEnabled: formData.get('waitlistEnabled') === 'on',
        status: (formData.get('status') as 'draft' | 'published' | 'closed') ?? 'draft',
        drawPool: formData.get('drawPool') === 'all' ? 'all' : 'checked_in',
      },
      id || undefined,
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : '儲存失敗。', values }
  }

  revalidatePath('/admin/events')
  revalidatePath('/events')
  redirect('/admin/events')
}

export { findEventById }
