/**
 * 集中讀取環境變數，並在啟動時就抓出設定錯誤，
 * 而不是等到使用者按下按鈕才爆炸。
 *
 * 註：這裡沒有 SESSION_SECRET —— session cookie 存的是 32 bytes 的隨機
 * token，資料庫只保存它的 SHA-256，並非自帶簽章的 JWT，所以不需要簽署密鑰。
 */

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  return raw === 'true' || raw === '1'
}

export const isProduction = process.env.NODE_ENV === 'production'

export const env = {
  get databasePath(): string {
    return process.env.DATABASE_PATH ?? 'data/kplus.db'
  },

  /** 沒設定 LINE channel 時回傳 null，登入頁會據此停用 LINE 按鈕。 */
  get line(): { channelId: string; channelSecret: string; redirectUri: string } | null {
    const channelId = process.env.LINE_CHANNEL_ID
    const channelSecret = process.env.LINE_CHANNEL_SECRET
    if (!channelId || !channelSecret) return null
    return {
      channelId,
      channelSecret,
      redirectUri:
        process.env.LINE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/line/callback',
    }
  },

  get smsProvider(): string {
    return process.env.SMS_PROVIDER ?? 'console'
  },

  /**
   * 開發時把 OTP 直接回傳到前端，省得翻 log。
   * 正式環境強制關閉，避免任何人輸入別人的手機就拿到驗證碼。
   */
  get showOtpInResponse(): boolean {
    return !isProduction && bool('SHOW_OTP_IN_RESPONSE', true)
  },

  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  },
}
