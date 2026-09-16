import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { listRoster } from '@/lib/fs/checkin'
import { findEventById } from '@/lib/fs/events'
import { formatDateTime } from '@/lib/format'
import { formatPhone } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * CSV 跳脫：含逗號、雙引號或換行要用雙引號包起來，內部雙引號加倍。
 * 開頭是 = + - @ 的值前面補單引號，避免 Excel 當成公式執行。
 */
function cell(value: string | null | undefined): string {
  const raw = value ?? ''
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const { eventId } = await params
  const event = await findEventById(eventId)
  if (!event) return new NextResponse('Not Found', { status: 404 })

  const roster = await listRoster(eventId)

  const header = ['序號', '姓名', '手機', '報名狀態', '報到時間']
  const rows = roster.map((r, i) =>
    [
      String(i + 1),
      r.name,
      formatPhone(r.phone),
      r.status === 'confirmed' ? '報名成功' : r.status === 'waitlist' ? '候補' : r.status,
      r.checkedInAt ? formatDateTime(r.checkedInAt) : '',
    ].map(cell),
  )

  // 前面加 BOM，Excel 開啟時中文才不會亂碼
  const csv = '﻿' + [header.map(cell), ...rows].map((r) => r.join(',')).join('\r\n')
  const filename = `${event.slug}-participants.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
