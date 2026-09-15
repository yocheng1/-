import { NextResponse, type NextRequest } from 'next/server'
import {
  consumeLineState,
  exchangeLineCode,
  isLineConfigured,
  verifyLineIdToken,
} from '@/lib/auth/line'
import { signIn } from '@/lib/auth/session'
import { findOrCreateUserByIdentity } from '@/lib/repo/users'

function loginError(request: NextRequest, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${code}`, request.url))
}

export async function GET(request: NextRequest) {
  if (!isLineConfigured()) return loginError(request, 'line_not_configured')

  const params = request.nextUrl.searchParams

  // 使用者在 LINE 那頭按了取消
  if (params.get('error')) return loginError(request, 'line_cancelled')

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return loginError(request, 'line_invalid_response')

  // state 用過即刪；找不到代表偽造、重放或已逾時
  const consumed = consumeLineState(state)
  if (!consumed) return loginError(request, 'line_state_invalid')

  try {
    const { idToken } = await exchangeLineCode(code)
    const profile = verifyLineIdToken(idToken, consumed.nonce)

    const user = findOrCreateUserByIdentity({
      provider: 'line',
      providerUserId: profile.providerUserId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      verifiedEmail: profile.email,
    })

    await signIn(user.id)

    const target =
      consumed.redirectTo && consumed.redirectTo.startsWith('/')
        ? consumed.redirectTo
        : '/events'
    return NextResponse.redirect(new URL(target, request.url))
  } catch (error) {
    console.error('[LINE Login] 登入失敗：', error)
    return loginError(request, 'line_failed')
  }
}
