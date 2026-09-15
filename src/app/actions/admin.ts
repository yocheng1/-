'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { taipeiLocalToIso } from '@/lib/format'
import { createEvent, deleteEvent, findEventById, updateEvent } from '@/lib/repo/events'
import { cancelRegistration } from '@/lib/repo/registrations'
import type { User } from '@/lib/repo/users'
import { eventSchema } from '@/lib/validation'
import { fieldErrorsFrom, rawValues, type FormState } from './types'

/** 每個後台動作都先過這一關，沒有管理員權限就導回登入頁。 */
async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fadmin&error=login_required')
  if (user.role !== 'admin') redirect('/events')
  return user
}

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    summary: formData.get('summary') ?? '',
    description: formData.get('description') ?? '',
    location: formData.get('location') ?? '',
    coverImageUrl: formData.get('coverImageUrl') ?? '',
    startsAt: taipeiLocalToIso(String(formData.get('startsAt') ?? '')),
    endsAt: taipeiLocalToIso(String(formData.get('endsAt') ?? '')),
    registrationOpensAt: taipeiLocalToIso(String(formData.get('registrationOpensAt') ?? '')),
    registrationClosesAt: taipeiLocalToIso(String(formData.get('registrationClosesAt') ?? '')),
    capacity: formData.get('capacity') ?? 0,
    waitlistEnabled: formData.get('waitlistEnabled') === 'on',
    status: formData.get('status') ?? 'draft',
  })
}

export async function saveEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const values = rawValues(formData, [
    'title',
    'slug',
    'summary',
    'description',
    'location',
    'coverImageUrl',
    'startsAt',
    'endsAt',
    'registrationOpensAt',
    'registrationClosesAt',
    'capacity',
    'status',
  ])
  values.waitlistEnabled = formData.get('waitlistEnabled') === 'on' ? 'on' : ''

  const parsed = parseEventForm(formData)
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values }
  }

  const id = String(formData.get('id') ?? '')

  try {
    if (id) {
      if (!findEventById(id)) return { error: '找不到這場活動。', values }
      updateEvent(id, parsed.data)
    } else {
      createEvent(parsed.data)
    }
  } catch (error) {
    // slug 有 UNIQUE 限制，撞名時給明確訊息而不是丟 500
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      return { fieldErrors: { slug: '這個網址代稱已經被使用了。' }, values }
    }
    throw error
  }

  revalidatePath('/admin')
  revalidatePath('/events')
  revalidatePath(`/events/${parsed.data.slug}`)

  redirect('/admin?saved=1')
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = String(formData.get('id') ?? '')
  if (id) deleteEvent(id)

  revalidatePath('/admin')
  revalidatePath('/events')
  redirect('/admin?deleted=1')
}

export async function adminCancelRegistrationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()

  const registrationId = String(formData.get('registrationId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')

  cancelRegistration(registrationId, admin.id, true)

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/admin')
}
