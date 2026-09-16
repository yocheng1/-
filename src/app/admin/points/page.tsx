import type { Metadata } from 'next'
import { listMembers, REWARD_STORE, REWARD_THRESHOLD } from '@/lib/fs/members'
import { formatPhone } from '@/lib/validation'
import { RedeemPanel } from './redeem-panel'

export const metadata: Metadata = { title: 'Points' }
export const dynamic = 'force-dynamic'

export default async function AdminPointsPage() {
  const members = await listMembers()
  const redeemable = members.filter((m) => m.available > 0)

  return (
    <div>
      <h1 className="display mb-1 text-2xl">Points</h1>
      <p className="mb-6 text-dim">
        參加 {REWARD_THRESHOLD} 場活動可兌換咖啡一杯 · 限 {REWARD_STORE}
      </p>

      <section className="mb-10">
        <h2 className="display mb-3 text-lg">可兌換 ({redeemable.length})</h2>
        {redeemable.length === 0 ? (
          <p className="card p-8 text-center text-dim">目前沒有會員達到兌換門檻。</p>
        ) : (
          <ul className="space-y-2">
            {redeemable.map((member) => (
              <li key={member.userId} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{member.name}</p>
                  <p className="mt-0.5 mono text-xs text-dim">
                    {member.phone ? formatPhone(member.phone) : member.userId} · 已出席 {member.attended} 場
                  </p>
                </div>
                <RedeemPanel userId={member.userId} name={member.name} available={member.available} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="display mb-3 text-lg">全部會員</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b hairline text-left">
              <tr>
                {['會員', '報名', '出席', '已兌換', '可兌換'].map((h) => (
                  <th key={h} className="px-4 py-3 micro text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {members.map((member) => (
                <tr key={member.userId}>
                  <td className="px-4 py-3 font-medium">{member.name}</td>
                  <td className="px-4 py-3 mono text-dim">{member.registered}</td>
                  <td className="px-4 py-3 mono text-dim">{member.attended}</td>
                  <td className="px-4 py-3 mono text-dim">{member.redeemed}</td>
                  <td className="px-4 py-3">
                    {member.available > 0
                      ? <span className="badge-on">{member.available}</span>
                      : <span className="mono text-faint">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
