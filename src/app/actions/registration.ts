'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { findEventById } from '@/lib/repo/events'
import { cancelRegistration, createRegistration } from '@/lib/repo/registrations'
import { updateUserProfile } from '@/lib/repo/users'
import { registrationSchema } from '@/lib/validation'
import { fieldErrorsFrom, rawValues, type FormState } from './types'

export type RegisterState = FormState & {
  /** 報名成功且進入候補時為 true，用來切換成功頁的文案 */
  waitlisted?: boolean
  success?: boolean
}

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const user = await getCurrentUser()
  const eventId = String(formData.get('eventId') ?? '')

  const values = rawValues(formData, [
    'name',
    'phone',
    'email',
    'helmetSize',
    'emergencyContactName',
    'emergencyContactPhone',
    'notes',
  ])

  const event = findEventById(eventId)
  if (!event) return { error: '找不到這場活動。', values }

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/events/${event.slug}`)}&error=login_required`)
  }

  const parsed = registrationSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? '',
    helmetSize: formData.get('helmetSize') ?? '',
    emergencyContactName: formData.get('emergencyContactName') ?? '',
    emergencyContactPhone: formData.get('emergencyContactPhone') ?? '',
    notes: formData.get('notes') ?? '',
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const result = createRegistration(event, user.id, parsed.data)
  if (!result.ok) {
    return { error: result.error, values }
  }

  // 順手把報名時填的姓名/聯絡方式補回帳號，之後報名可以自動帶入
  updateUserProfile(user.id, {
    name: user.name ?? parsed.data.name,
    phone: user.phone ?? parsed.data.phone,
    email: user.email ?? (parsed.data.email || null),
  })

  revalidatePath(`/events/${event.slug}`)
  revalidatePath('/events')
  revalidatePath('/me')

  redirect(`/events/${event.slug}?registered=${result.waitlisted ? 'waitlist' : 'confirmed'}`)
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?error=login_required')

  const registrationId = String(formData.get('registrationId') ?? '')
  cancelRegistration(registrationId, user.id)

  revalidatePath('/me')
  revalidatePath('/events')
  redirect('/me?cancelled=1')
}
