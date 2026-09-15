import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { formatDateTime } from '@/lib/format'
import { findEventById } from '@/lib/repo/events'
import { listEventRegistrations } from '@/lib/repo/registrations'
import { formatPhone } from '@/lib/validation'

const STATUS_LABELS: Record<string, string> = {
  confirmed: '報名成功',
  waitlist: '候補中',
  cancelled: '已取消',
}

/**
 * CSV 跳脫：含逗號、雙引號或換行的欄位要用雙引號包起來，內部的雙引號要加倍。
 * 另外把開頭是 = + - @ 的值前面補上單引號，避免 Excel 把它當公式執行。
 */
function csvCell(value: string | null | undefined): string {
  const raw = value ?? ''
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { id } = await params
  const event = findEventById(id)
  if (!event) return new NextResponse('Not Found', { status: 404 })

  const registrations = listEventRegistrations(event.id)

  const header = [
    '序號',
    '狀態',
    '姓名',
    '手機',
    'Email',
    '安全帽尺寸',
    '緊急聯絡人',
    '緊急聯絡電話',
    '備註',
    '報名時間',
    '取消時間',
  ]

  const rows = registrations.map((r, index) =>
    [
      String(index + 1),
      STATUS_LABELS[r.status] ?? r.status,
      r.name,
      formatPhone(r.phone),
      r.email,
      r.helmetSize,
      r.emergencyContactName,
      r.emergencyContactPhone ? formatPhone(r.emergencyContactPhone) : '',
      r.notes,
      formatDateTime(r.createdAt),
      r.cancelledAt ? formatDateTime(r.cancelledAt) : '',
    ].map(csvCell),
  )

  // 前面加 BOM，Excel 開啟時才不會把中文顯示成亂碼
  const csv = '﻿' + [header.map(csvCell), ...rows].map((row) => row.join(',')).join('\r\n')

  const filename = `${event.slug}-registrations.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
