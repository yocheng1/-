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
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/events" className="text-lg font-black tracking-tight text-ink">
              KPlus<span className="text-brand-600"> 活動</span>
            </Link>

            <Link
              href="/events"
              className="text-sm font-medium text-slate-600 hover:text-brand-600"
            >
              活動列表
            </Link>

            {user && (
              <Link
                href="/me"
                className="text-sm font-medium text-slate-600 hover:text-brand-600"
              >
                我的報名
              </Link>
            )}

            {user?.role === 'admin' && (
              <Link
                href="/admin"
                className="text-sm font-medium text-slate-600 hover:text-brand-600"
              >
                後台管理
              </Link>
            )}

            <div className="ml-auto flex items-center gap-3">
              {user ? (
                <>
                  <span className="hidden text-sm text-slate-500 sm:inline">
                    {user.name || user.email || user.phone}
                  </span>
                  <form action={signOutAction}>
                    <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
                      登出
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn-primary px-3 py-1.5">
                  登入
                </Link>
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-slate-500">
            © {new Date().getFullYear()} KPlus Helmet — 活動報名系統
          </div>
        </footer>
      </body>
    </html>
  )
}
