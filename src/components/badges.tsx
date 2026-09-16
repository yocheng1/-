import type { Availability, RegistrationStatus } from '@/lib/repo/registrations'
import type { RegistrationWindow } from '@/lib/repo/events'

export function WindowBadge({
  window,
  availability,
}: {
  window: RegistrationWindow
  availability: Availability
}) {
  if (window === 'open' && availability.isFull) {
    return (
      <span className="badge-pending">
        名額已滿{availability.waitlisted > 0 ? ` · 候補 ${availability.waitlisted}` : ''}
      </span>
    )
  }

  const labels: Record<RegistrationWindow, string> = {
    open: '開放報名中',
    not_published: '未發佈',
    not_open_yet: '即將開放',
    closed: '報名已截止',
    event_ended: '活動已結束',
  }

  // 只有「可以報名」是亮的，其餘都是暗的 —— 一眼就看得出哪些還能報
  if (window === 'open') return <span className="badge-on">{labels.open}</span>
  if (window === 'not_open_yet') return <span className="badge-pending">{labels[window]}</span>
  return <span className="badge-off">{labels[window]}</span>
}

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const labels: Record<RegistrationStatus, string> = {
    confirmed: '報名成功',
    waitlist: '候補中',
    cancelled: '已取消',
  }

  if (status === 'confirmed') return <span className="badge-on">{labels.confirmed}</span>
  if (status === 'waitlist') return <span className="badge-pending">{labels.waitlist}</span>
  return <span className="badge-off">{labels.cancelled}</span>
}

export function CapacityText({ availability }: { availability: Availability }) {
  if (availability.remaining === null) {
    return <span className="text-dim">不限名額</span>
  }
  return (
    <span className="text-dim">
      剩餘 <strong className="text-paper">{availability.remaining}</strong> / {availability.capacity}
    </span>
  )
}
