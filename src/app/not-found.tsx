import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-10 text-center">
      <p className="text-5xl font-black text-faint">404</p>
      <h1 className="mt-3 text-xl font-bold text-paper">找不到這個頁面</h1>
      <p className="mt-1.5 text-dim">頁面可能已被移除，或網址有誤。</p>
      <Link href="/events" className="btn-primary mt-6">
        回活動列表
      </Link>
    </div>
  )
}
