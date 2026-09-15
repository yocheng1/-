import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'

/** 後台所有頁面共用的權限檢查。 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fadmin&error=login_required')
  if (user.role !== 'admin') redirect('/events')

  return <>{children}</>
}
