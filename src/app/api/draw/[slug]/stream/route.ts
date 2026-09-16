import { findEventBySlug } from '@/lib/repo/events'
import { subscribe, type DrawEvent } from '@/lib/draw-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * 觀眾端的長連線。主持人一按抽獎，這裡就把事件推給所有人。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const event = findEventBySlug(slug)
  if (!event) return new Response('Not Found', { status: 404 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const send = (data: DrawEvent | { type: 'hello' }) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      send({ type: 'hello' })

      const unsubscribe = subscribe(event.id, send)

      // 代理伺服器通常會砍掉閒置連線，固定送註解行當心跳
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          closed = true
        }
      }, 20000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // 連線已經斷了就算了
        }
      }

      request.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx 之類的反向代理預設會緩衝，會讓推播延遲好幾秒
      'X-Accel-Buffering': 'no',
    },
  })
}
