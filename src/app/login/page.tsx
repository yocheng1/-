import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isLineConfigured } from '@/lib/auth/line'
import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: '登入' }

const ERROR_MESSAGES: Record<string, string> = {
  line_not_configured: 'LINE 登入尚未設定，請改用其他方式登入。',
  line_cancelled: '已取消 LINE 登入。',
  line_invalid_response: 'LINE 回應不完整，請重新嘗試。',
  line_state_invalid: '登入連結已失效，請重新嘗試。',
  line_failed: 'LINE 登入失敗，請稍後再試。',
  login_required: '請先登入後再繼續。',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const params = await searchParams
  const redirectTo =
    params.redirectTo?.startsWith('/') && !params.redirectTo.startsWith('//')
      ? params.redirectTo
      : '/events'

  const user = await getCurrentUser()
  if (user) redirect(redirectTo)

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">登入 KPlus 活動</h1>
        <p className="mt-1.5 mb-6 text-sm text-slate-500">
          登入後即可報名活動、查看與取消您的報名紀錄。
        </p>

        <LoginForm
          redirectTo={redirectTo}
          lineEnabled={isLineConfigured()}
          initialError={params.error ? ERROR_MESSAGES[params.error] : undefined}
        />
      </div>
    </div>
  )
}
