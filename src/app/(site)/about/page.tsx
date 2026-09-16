import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <p className="micro-lg text-dim">About</p>
      <h1 className="display mt-3 text-3xl">KPLUS RIDE &amp; RUN</h1>

      <div className="mt-8 space-y-6 text-dim">
        <p>
          KPlus 安全帽的活動社群。我們定期舉辦團騎、路跑、新品體驗與保養工作坊，
          讓車友在路上更安全，也更享受。
        </p>

        <div className="border-t hairline pt-6">
          <h2 className="display text-lg text-shell">怎麼參加</h2>
          <ol className="mt-3 space-y-2">
            <li><span className="mono text-faint">01</span> 在 Events 挑一場活動報名</li>
            <li><span className="mono text-faint">02</span> 報名後會拿到一張票券，活動當天出示給工作人員</li>
            <li><span className="mono text-faint">03</span> 完成報到就算出席，現場還有抽獎</li>
            <li><span className="mono text-faint">04</span> 累積出席場次可兌換好禮</li>
          </ol>
        </div>

        <div className="border-t hairline pt-6">
          <h2 className="display text-lg text-shell">聯絡我們</h2>
          <p className="mt-3">
            活動相關問題請洽 KPlus 門市，或來信
            <span className="mono text-shell"> service@kplushelmet.com</span>
          </p>
        </div>
      </div>
    </div>
  )
}
