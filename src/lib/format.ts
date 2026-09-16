const TIMEZONE = 'Asia/Taipei'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * 日期欄位可能缺漏或格式錯誤（舊資料、匯入的資料、手動改過的文件）。
 * 這種情況要顯示佔位符，而不是讓整個頁面掛掉 ——
 * 一筆壞資料不該害得所有活動都看不到。
 */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const PLACEHOLDER = '時間未設定'

export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso)
  return date ? dateTimeFormatter.format(date) : PLACEHOLDER
}

export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso)
  return date ? dateFormatter.format(date) : PLACEHOLDER
}

/** 同一天只顯示一次日期：2026年3月8日 (日) 09:00–16:00 */
export function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  const start = parse(startIso)
  const end = parse(endIso)

  if (!start && !end) return PLACEHOLDER
  if (!start || !end) return formatDateTime(startIso ?? endIso)

  const sameDay = dateFormatter.format(start) === dateFormatter.format(end)
  if (sameDay) {
    return `${dateFormatter.format(start)} ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
  }
  return `${dateTimeFormatter.format(start)} – ${dateTimeFormatter.format(end)}`
}

/**
 * 把 ISO 字串轉成 <input type="datetime-local"> 需要的本地時間格式。
 * 後台編輯活動時間時用。
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!parse(iso)) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso as string))

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/**
 * <input type="datetime-local"> 送回來的是「沒有時區的當地時間」字串，
 * 直接丟給 new Date() 會被當成伺服器所在時區（容器裡通常是 UTC）而差 8 小時。
 * 後台填的一律視為台北時間，所以明確補上 +08:00。
 */
export function taipeiLocalToIso(value: string): string {
  if (!value) return ''
  // 已經帶時區資訊就原樣採用
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value).toISOString()

  const withSeconds = value.length === 16 ? `${value}:00` : value
  return new Date(`${withSeconds}+08:00`).toISOString()
}
