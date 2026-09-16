import type { Metadata } from 'next'
import { listMembers } from '@/lib/fs/members'
import { formatPhone } from '@/lib/validation'

export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const members = await listMembers()

  return (
    <div>
      <h1 className="display mb-1 text-2xl">Members</h1>
      <p className="mb-6 text-dim">共 {members.length} 位曾報名的會員。</p>

      {members.length === 0 ? (
        <p className="card p-10 text-center text-dim">還沒有會員資料。</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b hairline text-left">
              <tr>
                {['會員', '電話', '報名場次', '實際出席', '出席率'].map((h) => (
                  <th key={h} className="px-4 py-3 micro text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {members.map((member) => {
                const rate = member.registered > 0
                  ? Math.round((member.attended / member.registered) * 100)
                  : 0
                return (
                  <tr key={member.userId}>
                    <td className="px-4 py-3 font-medium">{member.name}</td>
                    <td className="px-4 py-3 mono text-dim">
                      {member.phone ? formatPhone(member.phone) : '—'}
                    </td>
                    <td className="px-4 py-3 mono text-dim">{member.registered}</td>
                    <td className="px-4 py-3 mono text-dim">{member.attended}</td>
                    <td className="px-4 py-3 mono text-dim">{rate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
