'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { checkInAction, checkInByCodeAction, undoCheckInAction } from '@/app/actions/fs'
import { emptyFormState } from '@/app/actions/types'

function CodeSubmit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '…' : '報到'}
    </button>
  )
}

/**
 * 掃 QR 或手動輸入代碼。
 *
 * 手機的相機掃到 QR 後會把代碼填進這個欄位（多數掃碼 App 可直接貼上），
 * 現場也可以請參加者念出票券上的 8 碼。
 */
function CodeEntry({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(checkInByCodeAction, emptyFormState)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.message) ref.current?.reset()
  }, [state.message])

  return (
    <form ref={ref} action={action} className="mb-4">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex gap-2">
        <input
          name="code"
          className="field flex-1 uppercase tracking-[0.2em]"
          placeholder="掃 QR 或輸入票券代碼"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <CodeSubmit />
      </div>
      {state.message && <p className="mt-2 text-sm text-shell">{state.message}</p>}
      {state.error && <p className="mt-2 text-sm text-red">{state.error}</p>}
    </form>
  )
}

export type RosterRow = {
  registrationId: string
  name: string
  phone: string
  code: string
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
    // 姓名、電話、票券代碼都能搜
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.phone.includes(q.replace(/\D/g, '')) ||
        r.code.toLowerCase().includes(q),
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

      <CodeEntry eventId={eventId} />

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
                <p className="mt-0.5 mono text-xs text-dim">
                  {maskPhone(row.phone)}
                  {row.code && <span className="ml-2 text-faint">{row.code}</span>}
                </p>
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
