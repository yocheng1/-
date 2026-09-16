import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { cancelRegistrationAction } from '@/app/actions/fs'
import { getCurrentUser } from '@/lib/auth/session'
import { findRegistration } from '@/lib/fs/events'
import { formatDateRange, formatDateTime } from '@/lib/format'
import { formatPhone } from '@/lib/validation'

export const metadata: Metadata = { title: 'Ticket' }
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}

export default async function TicketPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { new: isNew } = await searchParams

  const user = await getCurrentUser()
  if (!user) redirect('/login?error=login_required')

  const reg = await findRegistration(id)
  if (!reg || !reg.event) notFound()

  // 票券只能本人看 —— 別人拿到網址也開不了
  if (!id.startsWith(`${reg.eventId}_`) || !id.endsWith(`_${user.id}`)) {
    if (user.role !== 'admin') notFound()
  }

  // QR 內容就是報名編號，工作人員掃到後即可報到
  const qr = await QRCode.toString(id, {
    type: 'svg',
    margin: 1,
    color: { dark: '#0A0A09', light: '#F4F3EF' },
  })

  const cancelled = reg.status === 'cancelled'

  return (
    <div className="mx-auto max-w-md">
      <Link href="/member/tickets" className="mb-5 inline-block micro text-dim hover:text-shell">
        ← My Tickets
      </Link>

      {isNew && (
        <p className="mb-6 card p-4 text-center text-dim" role="status">
          報名完成！活動當天請出示這張票券。
        </p>
      )}

      <article className="card overflow-hidden">
        <div className="border-b hairline p-6 text-center">
          <p className="micro text-faint">KPLUS RIDE &amp; RUN</p>
          <h1 className="display mt-2 text-xl">{reg.event.title}</h1>
          <p className="mt-2 mono text-xs text-dim">
            {formatDateRange(reg.event.startsAt, reg.event.endsAt)}
          </p>
        </div>

        {cancelled ? (
          <div className="p-10 text-center">
            <span className="badge-off">已取消</span>
            <p className="mt-3 text-dim">這張票券已失效。</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center bg-shell p-6">
              <div
                className="w-48"
                dangerouslySetInnerHTML={{ __html: qr }}
                aria-label="報到用 QR Code"
              />
            </div>

            <div className="p-6">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {reg.checkedInAt ? (
                  <span className="badge-done">✓ 已於 {formatDateTime(reg.checkedInAt)} 報到</span>
                ) : (
                  <span className={reg.status === 'confirmed' ? 'badge-on' : 'badge'}>
                    {reg.status === 'confirmed' ? '報名成功' : '候補中'}
                  </span>
                )}
              </div>

              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">姓名</dt>
                  <dd>{reg.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-faint">手機</dt>
                  <dd className="mono">{formatPhone(reg.phone)}</dd>
                </div>
                {reg.event.location && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-faint">地點</dt>
                    <dd>{reg.event.location}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}
      </article>

      {!cancelled && !reg.checkedInAt && (
        <form action={cancelRegistrationAction} className="mt-6">
          <input type="hidden" name="eventId" value={reg.eventId} />
          <button type="submit" className="btn-secondary w-full">取消報名</button>
        </form>
      )}
    </div>
  )
}
