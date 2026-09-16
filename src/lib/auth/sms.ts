import { formatPhone } from '../validation'
import { env } from '../env'

export type SmsProvider = {
  send(to: string, message: string): Promise<void>
}

/**
 * 開發用：驗證碼直接印在伺服器 log。
 * 要接真的簡訊商（三竹、每十、Twilio…）時，在下面加一個 provider，
 * 並把 SMS_PROVIDER 換成對應名稱即可，其餘程式完全不用動。
 */
const consoleProvider: SmsProvider = {
  async send(to, message) {
    console.log(`\n[SMS → ${formatPhone(to)}] ${message}\n`)
  },
}

const providers: Record<string, SmsProvider> = {
  console: consoleProvider,
}

export function getSmsProvider(): SmsProvider {
  const provider = providers[env.smsProvider]
  if (!provider) {
    throw new Error(
      `未知的 SMS_PROVIDER "${env.smsProvider}"，可用的有：${Object.keys(providers).join(', ')}`,
    )
  }
  return provider
}

export async function sendOtpSms(to: string, code: string): Promise<void> {
  await getSmsProvider().send(
    to,
    `【KPlus】您的驗證碼是 ${code}，5 分鐘內有效。請勿將驗證碼提供給他人。`,
  )
}
