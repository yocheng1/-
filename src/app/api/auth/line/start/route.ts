import { NextResponse, type NextRequest } from 'next/server'
import { buildLineAuthorizationUrl, isLineConfigured } from '@/lib/auth/line'

export async function GET(request: NextRequest) {
  if (!isLineConfigured()) {
    return NextResponse.redirect(
      new URL('/login?error=line_not_configured', request.url),
    )
  }

  const redirectTo = request.nextUrl.searchParams.get('redirectTo')
  const safeRedirectTo =
    redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
      ? redirectTo
      : undefined

  return NextResponse.redirect(buildLineAuthorizationUrl(safeRedirectTo))
}
