'use client'

import { useMemo, useState, useTransition } from 'react'
import { checkInAction, undoCheckInAction } from '@/app/actions/fs'

export type RosterRow = {
  registrationId: string
  name: string
  phone: string
  status: string
  checkedInAt: string | null
}

/** 0912345678 → 0912-***-678 */
function maskPhone(phone: string) {
  const local = phone.startsWith('+886') ? `0${phone.slice(4)}` : phone
  if (local.length < 7) return local
  return `${local.slice(0, 4)}-***-${local.slice(-3)}`
}

export function Roster({ eventId, rows }: { eventId: string; rows: RosterRow[] }) {
  const [filter, setFilter] = useState('')
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, '')),
    )
  }, [rows, filter])

  const done = rows.filter((r) => r.checkedInAt).length

  function submit(action: (fd: FormData) => Promise<void>, registrationId: string) {
    setBusy(registrationId)
    const fd = new FormData()
    fd.set('eventId', eventId)
    fd.set('registrationId', registrationId)
    startTransition(async () => {
      await action(fd)
      setBusy(null)
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="mono text-sm text-dim">
          已報到 <span className="text-shell">{done}</span> / 共 {rows.length} 人
        </p>
        {pending && <span className="micro text-dim">處理中…</span>}
      </div>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="輸入姓名或電話搜尋…"
        className="field mb-4"
        autoComplete="off"
      />

      {visible.length === 0 ? (
        <p className="card p-10 text-center text-dim">沒有符合的參加者。</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li
              key={row.registrationId}
              className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${
                row.checkedInAt ? 'border-white/30 bg-white/5' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {row.name}
                  {row.status === 'waitlist' && <span className="badge ml-2">候補</span>}
                </p>
                <p className="mt-0.5 mono text-xs text-dim">{maskPhone(row.phone)}</p>
              </div>

              {row.checkedInAt ? (
                <div className="flex items-center gap-3">
                  <span className="badge-on">✓ 已報到</span>
                  <button
                    type="button"
                    onClick={() => submit(undoCheckInAction, row.registrationId)}
                    disabled={busy === row.registrationId}
                    className="micro text-faint underline transition hover:text-dim"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => submit(checkInAction, row.registrationId)}
                  disabled={busy === row.registrationId}
                  className="btn-primary"
                >
                  {busy === row.registrationId ? '報到中…' : '確定報到'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
