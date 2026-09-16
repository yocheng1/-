import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirectTo=%2Fmember%2Ftickets&error=login_required')

  const nav = [
    { href: '/member/tickets', label: 'My Tickets' },
    { href: '/member/history', label: 'My History' },
    { href: '/member/points', label: 'My Points' },
    { href: '/member/profile', label: 'Profile' },
  ]

  return (
    <div>
      <header className="mb-8">
        <p className="micro-lg text-dim">Member</p>
        <h1 className="display mt-3 text-3xl">{user.name || '會員中心'}</h1>
      </header>

      <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-b hairline pb-4">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="micro text-dim transition hover:text-shell">
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  )
}
