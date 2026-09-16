import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { signOutAction } from '../actions/auth'

/**
 * 後台是獨立的殼 —— 不共用前台的導覽與外觀。
 * 工作人員在活動現場用的是這一套，訪客看到的是另一套。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fadmin&error=login_required')
  if (user.role !== 'admin') redirect('/events')

  const nav = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/events', label: 'Events' },
    { href: '/admin/participants', label: 'Participants' },
    { href: '/admin/checkin', label: 'Check-in' },
    { href: '/admin/points', label: 'Points' },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/analytics', label: 'Analytics' },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-ink2">
      <header className="border-b hairline bg-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="display text-lg tracking-[0.18em]">KPLUS</span>
            <span className="badge-on">ADMIN</span>

            <div className="ml-auto flex items-center gap-4">
              <Link href="/events" className="micro text-dim transition hover:text-shell">
                前台 ↗
              </Link>
              <span className="hidden micro text-faint sm:inline">{user.name || user.email}</span>
              <form action={signOutAction}>
                <button type="submit" className="micro text-dim transition hover:text-shell">
                  登出
                </button>
              </form>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="micro text-dim transition hover:text-shell"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
    </div>
  )
}
