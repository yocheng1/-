import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COL, db } from '@/lib/firebase/admin'
import { findEventBySlug } from '@/lib/fs/events'
import { LiveDraw } from './live'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const event = await findEventBySlug(slug)
  return { title: event ? `${event.title} — 抽獎` : '找不到活動' }
}

export default async function DrawPage({ params }: PageProps) {
  const { slug } = await params
  const event = await findEventBySlug(slug)
  if (!event) notFound()

  const firestore = db()
  const [prizesSnap, winnersSnap] = await Promise.all([
    firestore.collection(COL.prizes).where('eventId', '==', event.id).get(),
    firestore.collection(COL.winners).where('eventId', '==', event.id).get(),
  ])

  // 先在伺服器把現況畫出來，觀眾一開頁面就看得到東西
  const prizes = prizesSnap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        name: String(data.name ?? ''),
        quantity: Number(data.quantity ?? 1),
        isBonus: Boolean(data.isBonus),
        drawnAt: (data.drawnAt as string) ?? null,
        sortOrder: Number(data.sortOrder ?? 0),
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const winners = winnersSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
      prizeId: String(data.prizeId),
      name: String(data.name),
      maskedPhone: String(data.maskedPhone),
      rank: Number(data.rank ?? 0),
    }
  })

  return (
    <LiveDraw
      eventId={event.id}
      title={event.title}
      initialPrizes={prizes}
      initialWinners={winners}
    />
  )
}
