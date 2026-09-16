import { NextResponse } from 'next/server'
import { findEventBySlug } from '@/lib/repo/events'
import { listEligible, listPrizes, listWinners } from '@/lib/repo/draw'

export const dynamic = 'force-dynamic'

/**
 * 抽獎現況。觀眾端收到推播後就來抓一次這支，畫面即時更新。
 *
 * 電話只回傳遮罩後的版本 —— 這個頁面是公開的，
 * 不能讓現場任何人看到其他人的完整手機號碼。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const event = findEventBySlug(slug)
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const prizes = listPrizes(event.id)
  const winners = listWinners(event.id)

  return NextResponse.json(
    {
      event: { id: event.id, slug: event.slug, title: event.title },
      remaining: listEligible(event.id).length,
      prizes: prizes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        quantity: p.quantity,
        isBonus: p.isBonus,
        drawnAt: p.drawnAt,
        drawSeed: p.drawSeed,
      })),
      winners: winners.map((w) => ({
        id: w.id,
        prizeId: w.prizeId,
        name: w.name,
        phone: maskPhone(w.phone),
        rank: w.rank,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** 0912345678 → 0912***678 */
function maskPhone(phone: string): string {
  const local = phone.startsWith('+886') ? `0${phone.slice(4)}` : phone
  if (local.length < 7) return '***'
  return `${local.slice(0, 4)}***${local.slice(-3)}`
}
