import type { Availability } from '@/lib/repo/registrations'
import type { RegistrationWindow } from '@/lib/repo/events'
import type { RegistrationStatus } from '@/lib/repo/registrations'

const baseClass =
  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap'

export function WindowBadge({
  window,
  availability,
}: {
  window: RegistrationWindow
  availability: Availability
}) {
  if (window === 'open' && availability.isFull) {
    return (
      <span className={`${baseClass} bg-amber-100 text-amber-800`}>
        名額已滿{availability.waitlisted > 0 ? `（候補 ${availability.waitlisted}）` : ''}
      </span>
    )
  }

  const styles: Record<RegistrationWindow, string> = {
    open: 'bg-emerald-100 text-emerald-800',
    not_published: 'bg-slate-100 text-slate-600',
    not_open_yet: 'bg-brand-100 text-brand-800',
    closed: 'bg-slate-200 text-slate-700',
    event_ended: 'bg-slate-200 text-slate-500',
  }

  const labels: Record<RegistrationWindow, string> = {
    open: '開放報名中',
    not_published: '未發佈',
    not_open_yet: '即將開放',
    closed: '報名已截止',
    event_ended: '活動已結束',
  }

  return <span className={`${baseClass} ${styles[window]}`}>{labels[window]}</span>
}

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const styles: Record<RegistrationStatus, string> = {
    confirmed: 'bg-emerald-100 text-emerald-800',
    waitlist: 'bg-amber-100 text-amber-800',
    cancelled: 'bg-slate-200 text-slate-500',
  }
  const labels: Record<RegistrationStatus, string> = {
    confirmed: '報名成功',
    waitlist: '候補中',
    cancelled: '已取消',
  }
  return <span className={`${baseClass} ${styles[status]}`}>{labels[status]}</span>
}

/** 剩餘名額文字，未限制名額時顯示「不限名額」。 */
export function CapacityText({ availability }: { availability: Availability }) {
  if (availability.remaining === null) {
    return <span className="text-slate-600">不限名額</span>
  }
  return (
    <span className="text-slate-600">
      剩餘{' '}
      <strong
        className={availability.remaining === 0 ? 'text-amber-700' : 'text-brand-700'}
      >
        {availability.remaining}
      </strong>{' '}
      / {availability.capacity} 名
    </span>
  )
}
