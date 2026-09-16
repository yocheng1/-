'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveEventAction } from '@/app/actions/admin'
import { emptyFormState } from '@/app/actions/types'
import type { EventRecord } from '@/lib/repo/events'
import { toDatetimeLocalValue } from '@/lib/format'

function SubmitButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '儲存中…' : isNew ? '建立活動' : '儲存變更'}
    </button>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-red-400">{message}</p>
}

/** 由標題自動產生一組還算像樣的 slug，使用者仍可自行修改。 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export function EventForm({ event }: { event?: EventRecord }) {
  const [state, action] = useActionState(saveEventAction, emptyFormState)
  const isNew = !event

  // 儲存失敗時保留使用者剛剛填的內容，否則整張表單會被清空
  const value = (key: string, fallback = '') => state.values?.[key] ?? fallback

  return (
    <form action={action} className="space-y-6">
      {event && <input type="hidden" name="id" value={event.id} />}

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-bold text-paper">基本資訊</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="label">
              活動名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              name="title"
              className="field"
              defaultValue={value('title', event?.title ?? '')}
              required
              onChange={(e) => {
                if (!isNew) return
                const slugInput = document.getElementById('slug') as HTMLInputElement | null
                // 只在使用者還沒自己動過 slug 時才自動填
                if (slugInput && !slugInput.dataset.touched) {
                  slugInput.value = slugify(e.target.value)
                }
              }}
            />
            <FieldError message={state.fieldErrors?.title} />
          </div>

          <div>
            <label htmlFor="slug" className="label">
              網址代稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="slug"
              name="slug"
              className="field font-mono"
              defaultValue={value('slug', event?.slug ?? '')}
              placeholder="spring-group-ride"
              pattern="[a-z0-9\-]+"
              required
              onInput={(e) => {
                ;(e.currentTarget as HTMLInputElement).dataset.touched = 'true'
              }}
            />
            <p className="mt-1 text-xs text-dim">
              活動網址會是 /events/<span className="font-mono">你填的代稱</span>
            </p>
            <FieldError message={state.fieldErrors?.slug} />
          </div>

          <div>
            <label htmlFor="summary" className="label">
              一句話簡介
            </label>
            <input
              id="summary"
              name="summary"
              className="field"
              defaultValue={value('summary', event?.summary ?? '')}
              maxLength={300}
            />
            <FieldError message={state.fieldErrors?.summary} />
          </div>

          <div>
            <label htmlFor="description" className="label">
              活動說明
            </label>
            <textarea
              id="description"
              name="description"
              rows={6}
              className="field resize-y"
              defaultValue={value('description', event?.description ?? '')}
              maxLength={5000}
            />
            <FieldError message={state.fieldErrors?.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="location" className="label">
                地點
              </label>
              <input
                id="location"
                name="location"
                className="field"
                defaultValue={value('location', event?.location ?? '')}
              />
              <FieldError message={state.fieldErrors?.location} />
            </div>

            <div>
              <label htmlFor="coverImageUrl" className="label">
                封面圖片網址
              </label>
              <input
                id="coverImageUrl"
                name="coverImageUrl"
                type="url"
                className="field"
                placeholder="https://…"
                defaultValue={value('coverImageUrl', event?.coverImageUrl ?? '')}
              />
              <FieldError message={state.fieldErrors?.coverImageUrl} />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-1 text-lg font-bold text-paper">時間</h2>
        <p className="mb-4 text-sm text-dim">所有時間皆以台北時間 (UTC+8) 為準。</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className="label">
              開始時間 <span className="text-red-500">*</span>
            </label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              className="field"
              defaultValue={value('startsAt', toDatetimeLocalValue(event?.startsAt ?? null))}
              required
            />
            <FieldError message={state.fieldErrors?.startsAt} />
          </div>

          <div>
            <label htmlFor="endsAt" className="label">
              結束時間 <span className="text-red-500">*</span>
            </label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              className="field"
              defaultValue={value('endsAt', toDatetimeLocalValue(event?.endsAt ?? null))}
              required
            />
            <FieldError message={state.fieldErrors?.endsAt} />
          </div>

          <div>
            <label htmlFor="registrationOpensAt" className="label">
              開始報名時間
            </label>
            <input
              id="registrationOpensAt"
              name="registrationOpensAt"
              type="datetime-local"
              className="field"
              defaultValue={value('registrationOpensAt', toDatetimeLocalValue(event?.registrationOpensAt ?? null))}
            />
            <p className="mt-1 text-xs text-dim">留空代表發佈後立即開放</p>
            <FieldError message={state.fieldErrors?.registrationOpensAt} />
          </div>

          <div>
            <label htmlFor="registrationClosesAt" className="label">
              報名截止時間
            </label>
            <input
              id="registrationClosesAt"
              name="registrationClosesAt"
              type="datetime-local"
              className="field"
              defaultValue={value('registrationClosesAt', toDatetimeLocalValue(event?.registrationClosesAt ?? null))}
            />
            <p className="mt-1 text-xs text-dim">留空代表到活動結束前都可報名</p>
            <FieldError message={state.fieldErrors?.registrationClosesAt} />
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-bold text-paper">名額與狀態</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="capacity" className="label">
              名額上限
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min={0}
              className="field"
              defaultValue={value('capacity', String(event?.capacity ?? 0))}
            />
            <p className="mt-1 text-xs text-dim">填 0 代表不限名額</p>
            <FieldError message={state.fieldErrors?.capacity} />
          </div>

          <div>
            <label htmlFor="status" className="label">
              發佈狀態
            </label>
            <select
              id="status"
              name="status"
              className="field"
              defaultValue={value('status', event?.status ?? 'draft')}
            >
              <option value="draft">草稿（前台不顯示）</option>
              <option value="published">已發佈</option>
              <option value="closed">已關閉報名</option>
            </select>
            <FieldError message={state.fieldErrors?.status} />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            name="waitlistEnabled"
            defaultChecked={state.values ? state.values.waitlistEnabled === 'on' : event?.waitlistEnabled}
            className="mt-0.5 size-4 rounded hairline text-paper focus:ring-white/30"
          />
          <span className="text-sm">
            <span className="font-medium text-paper">開放候補名單</span>
            <span className="mt-0.5 block text-dim">
              名額滿了之後仍可報名並列入候補，有人取消時自動遞補最早候補者。
            </span>
          </span>
        </label>
      </section>

      {state.error && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton isNew={isNew} />
        <Link href="/admin" className="btn-secondary">
          取消
        </Link>
      </div>
    </form>
  )
}
