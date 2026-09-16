import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/session'
import { listUserIdentities } from '@/lib/repo/users'
import { formatPhone } from '@/lib/validation'

export const metadata: Metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

const PROVIDER_LABELS: Record<string, string> = { line: 'LINE', google: 'Google' }

export default async function ProfilePage() {
  const user = (await getCurrentUser())!
  const identities = listUserIdentities(user.id)

  const rows = [
    { label: '姓名', value: user.name || '未設定' },
    { label: '手機', value: user.phone ? formatPhone(user.phone) : '未綁定' },
    { label: 'Email', value: user.email || '未綁定' },
    {
      label: '登入方式',
      value: [
        user.phone && '手機驗證碼',
        user.email && 'Email',
        ...identities.map((i) => PROVIDER_LABELS[i.provider] ?? i.provider),
      ].filter(Boolean).join('、') || '—',
    },
  ]

  return (
    <div className="max-w-lg">
      <div className="card divide-y divide-white/10">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 p-4 text-sm">
            <span className="text-faint">{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 micro text-faint">
        目前個人資料由報名時填寫的內容帶入。接上 Firebase Auth 後這裡會開放編輯。
      </p>
    </div>
  )
}
