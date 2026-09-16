import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { signOutAction } from '@/app/actions/auth'
import { SiteChrome } from './chrome'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteChrome />
        <header className="sticky top-0 z-30 border-b hairline bg-ink/92 backdrop-blur-xl">
          <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-7 gap-y-2 px-5 py-4">
            <Link href="/" className="flex items-center gap-3.5">
              <span className="display text-sm tracking-[0.22em]">KPLUS</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="micro text-dim">RIDE &amp; RUN</span>
            </Link>

            <Link href="/events" className="micro text-dim transition hover:text-shell">
              Events
            </Link>
            <Link href="/member/tickets" className="micro text-dim transition hover:text-shell">
              Member
            </Link>
            <Link href="/about" className="micro text-dim transition hover:text-shell">
              About
            </Link>

            <div className="ml-auto flex items-center gap-4">
              {user ? (
                <>
                  {user.role === 'admin' && (
                    <Link href="/admin" className="micro text-dim transition hover:text-shell">
                      Admin
                    </Link>
                  )}
                  <form action={signOutAction}>
                    <button type="submit" className="micro text-dim transition hover:text-shell">
                      登出
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn-secondary px-4 py-2">登入</Link>
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>

        <footer className="border-t hairline">
          <div className="mx-auto w-full max-w-5xl px-5 py-8 micro text-faint">
            © {new Date().getFullYear()} KPlus Helmet
          </div>
        </footer>
    </div>
  )
}
