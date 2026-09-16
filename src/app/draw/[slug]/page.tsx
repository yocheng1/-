import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listEligible, listPrizes, listWinners } from '@/lib/repo/draw'
import { findEventBySlug } from '@/lib/repo/events'
import { LiveDraw } from './live'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const event = findEventBySlug(slug)
  return { title: event ? `${event.title} — 抽獎` : '找不到活動' }
}

/** 0912345678 → 0912***678 */
function maskPhone(phone: string): string {
  const local = phone.startsWith('+886') ? `0${phone.slice(4)}` : phone
  if (local.length < 7) return '***'
  return `${local.slice(0, 4)}***${local.slice(-3)}`
}

export default async function DrawPage({ params }: PageProps) {
  const { slug } = await params
  const event = findEventBySlug(slug)
  if (!event) notFound()

  // 先在伺服器把現況畫出來，觀眾一開頁面就看得到東西，不用等連線建立
  const initial = {
    event: { id: event.id, slug: event.slug, title: event.title },
    remaining: listEligible(event.id).length,
    prizes: listPrizes(event.id).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      quantity: p.quantity,
      isBonus: p.isBonus,
      drawnAt: p.drawnAt,
      drawSeed: p.drawSeed,
    })),
    winners: listWinners(event.id).map((w) => ({
      id: w.id,
      prizeId: w.prizeId,
      name: w.name,
      phone: maskPhone(w.phone),
      rank: w.rank,
    })),
  }

  return <LiveDraw slug={slug} initial={initial} />
}
