'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveEventAction } from '@/app/actions/fs'
import { emptyFormState } from '@/app/actions/types'
import { toDatetimeLocalValue } from '@/lib/format'
import type { EventRecord } from '@/lib/fs/events'

function SubmitButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '儲存中…' : isNew ? '建立活動' : '儲存變更'}
    </button>
  )
}

export function EventForm({ event }: { event?: EventRecord }) {
  const [state, action] = useActionState(saveEventAction, emptyFormState)
  const v = (key: string, fallback = '') => state.values?.[key] ?? fallback

  const Err = ({ name }: { name: string }) =>
    state.fieldErrors?.[name] ? <p className="mt-1.5 text-sm text-red">{state.fieldErrors[name]}</p> : null

  return (
    <form action={action} className="space-y-6">
      {event && <input type="hidden" name="id" value={event.id} />}

      <section className="card p-6 space-y-5">
        <h2 className="display text-lg">基本資訊</h2>

        <div>
          <label htmlFor="title" className="label">活動名稱 *</label>
          <input id="title" name="title" className="field" defaultValue={v('title', event?.title ?? '')} required />
          <Err name="title" />
        </div>

        <div>
          <label htmlFor="slug" className="label">網址代稱 *</label>
          <input id="slug" name="slug" className="field mono" placeholder="spring-group-ride"
            defaultValue={v('slug', event?.slug ?? '')} pattern="[a-z0-9\-]+" required />
          <p className="mt-1.5 micro text-faint">活動網址會是 /events/你填的代稱</p>
          <Err name="slug" />
        </div>

        <div>
          <label htmlFor="summary" className="label">一句話簡介</label>
          <input id="summary" name="summary" className="field" defaultValue={v('summary', event?.summary ?? '')} />
        </div>

        <div>
          <label htmlFor="description" className="label">活動說明</label>
          <textarea id="description" name="description" rows={5} className="field resize-y"
            defaultValue={v('description', event?.description ?? '')} />
        </div>

        <div>
          <label htmlFor="location" className="label">地點</label>
          <input id="location" name="location" className="field" defaultValue={v('location', event?.location ?? '')} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="display text-lg">時間</h2>
        <p className="mt-1 mb-5 text-sm text-dim">所有時間皆以台北時間 (UTC+8) 為準。</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className="label">開始時間 *</label>
            <input id="startsAt" name="startsAt" type="datetime-local" className="field"
              defaultValue={v('startsAt', toDatetimeLocalValue(event?.startsAt ?? null))} required />
            <Err name="startsAt" />
          </div>
          <div>
            <label htmlFor="endsAt" className="label">結束時間 *</label>
            <input id="endsAt" name="endsAt" type="datetime-local" className="field"
              defaultValue={v('endsAt', toDatetimeLocalValue(event?.endsAt ?? null))} required />
            <Err name="endsAt" />
          </div>
          <div>
            <label htmlFor="registrationClosesAt" className="label">報名截止時間</label>
            <input id="registrationClosesAt" name="registrationClosesAt" type="datetime-local" className="field"
              defaultValue={v('registrationClosesAt', toDatetimeLocalValue(event?.registrationClosesAt ?? null))} />
            <p className="mt-1.5 micro text-faint">留空代表到活動結束前都可報名</p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="display mb-5 text-lg">名額與抽獎</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="capacity" className="label">名額上限</label>
            <input id="capacity" name="capacity" type="number" min={0} className="field"
              defaultValue={v('capacity', String(event?.capacity ?? 0))} />
            <p className="mt-1.5 micro text-faint">填 0 代表不限名額</p>
          </div>
          <div>
            <label htmlFor="status" className="label">發佈狀態</label>
            <select id="status" name="status" className="field" defaultValue={v('status', event?.status ?? 'draft')}>
              <option value="draft">草稿（前台不顯示）</option>
              <option value="published">已發佈</option>
              <option value="closed">已關閉報名</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="drawPool" className="label">抽獎對象</label>
            <select id="drawPool" name="drawPool" className="field"
              defaultValue={v('drawPool', event?.drawPool ?? 'checked_in')}>
              <option value="checked_in">只抽已完成現場報到的人（建議）</option>
              <option value="all">所有報名者（不需到場的線上活動）</option>
            </select>
            <p className="mt-1.5 micro text-faint">
              現場抽獎請選第一項，否則會抽到沒來的人
            </p>
          </div>
        </div>

        <label className="mt-5 flex items-start gap-2.5">
          <input type="checkbox" name="waitlistEnabled" className="mt-1 size-4 accent-red"
            defaultChecked={state.values ? state.values.waitlistEnabled === 'on' : event?.waitlistEnabled} />
          <span className="text-sm">
            <span className="font-medium">開放候補名單</span>
            <span className="mt-0.5 block text-dim">額滿後仍可報名並列入候補，有人取消時自動遞補。</span>
          </span>
        </label>
      </section>

      {state.error && (
        <p className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <SubmitButton isNew={!event} />
        <Link href="/admin/events" className="btn-secondary">取消</Link>
      </div>
    </form>
  )
}
