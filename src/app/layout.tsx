import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { signOutAction } from './actions/auth'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'KPlus 活動報名',
    template: '%s ｜ KPlus 活動報名',
  },
  description: 'KPlus 安全帽 — 活動報名平台',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <html lang="zh-Hant">
      <body className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b hairline bg-ink/90 backdrop-blur-xl">
          <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
            <Link href="/events" className="flex items-center gap-3.5">
              <span className="text-sm font-semibold tracking-[0.22em] uppercase">KPlus</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="micro text-dim">Events</span>
            </Link>

            <Link href="/events" className="micro text-dim transition hover:text-paper">
              活動
            </Link>

            {user && (
              <Link href="/me" className="micro text-dim transition hover:text-paper">
                我的報名
              </Link>
            )}

            {user?.role === 'admin' && (
              <Link href="/admin" className="micro text-dim transition hover:text-paper">
                後台
              </Link>
            )}

            <div className="ml-auto flex items-center gap-4">
              {user ? (
                <>
                  <span className="hidden micro text-faint sm:inline">
                    {user.name || user.email || user.phone}
                  </span>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="micro text-dim transition hover:text-paper"
                    >
                      登出
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn-secondary px-4 py-2">
                  登入
                </Link>
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
      </body>
    </html>
  )
}
