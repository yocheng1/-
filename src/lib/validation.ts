import { z } from 'zod'

/**
 * 把使用者輸入的台灣手機號碼正規化成 E.164 (+886912345678)。
 * 接受 0912345678 / 0912-345-678 / +886912345678 / 886912345678。
 * 格式不對回傳 null。
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '')

  let local: string | null = null
  if (/^09\d{8}$/.test(digits)) {
    local = digits.slice(1) // 0912345678 -> 912345678
  } else if (/^\+8869\d{8}$/.test(digits)) {
    local = digits.slice(4)
  } else if (/^8869\d{8}$/.test(digits)) {
    local = digits.slice(3)
  }

  return local ? `+886${local}` : null
}

/** 顯示用：+886912345678 -> 0912345678 */
export function formatPhone(e164: string): string {
  return e164.startsWith('+886') ? `0${e164.slice(4)}` : e164
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

const phoneSchema = z
  .string()
  .min(1, '請輸入手機號碼')
  .transform((v, ctx) => {
    const normalized = normalizePhone(v)
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '手機號碼格式不正確' })
      return z.NEVER
    }
    return normalized
  })

const emailSchema = z
  .string()
  .min(1, '請輸入 Email')
  .email('Email 格式不正確')
  .transform(normalizeEmail)

// ------------------------------------------------------------------ 登入
export const requestOtpSchema = z.object({ phone: phoneSchema })

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, '驗證碼是 6 位數字'),
})

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '請輸入密碼'),
})

export const emailSignupSchema = z.object({
  name: z.string().trim().min(1, '請輸入姓名').max(50, '姓名太長'),
  email: emailSchema,
  password: z
    .string()
    .min(8, '密碼至少 8 個字元')
    .max(200, '密碼太長')
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), '密碼需同時包含英文字母與數字'),
})

// ------------------------------------------------------------------ 報名
export const registrationSchema = z.object({
  name: z.string().trim().min(1, '請輸入姓名').max(50, '姓名太長'),
  phone: phoneSchema,
  email: z.union([emailSchema, z.literal('')]).optional(),
  helmetSize: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', '']).optional(),
  emergencyContactName: z.string().trim().max(50).optional(),
  emergencyContactPhone: z
    .union([phoneSchema, z.literal('')])
    .optional(),
  notes: z.string().trim().max(500, '備註最多 500 字').optional(),
})

export type RegistrationInput = z.infer<typeof registrationSchema>

// ------------------------------------------------------------------ 後台活動
export const eventSchema = z
  .object({
    title: z.string().trim().min(1, '請輸入活動名稱').max(120),
    slug: z
      .string()
      .trim()
      .min(1, '請輸入網址代稱')
      .max(80)
      .regex(/^[a-z0-9-]+$/, '網址代稱只能用小寫英文、數字與連字號'),
    summary: z.string().trim().max(300).default(''),
    description: z.string().trim().max(5000).default(''),
    location: z.string().trim().max(200).default(''),
    coverImageUrl: z.string().trim().url('圖片網址格式不正確').or(z.literal('')).optional(),
    startsAt: z.string().min(1, '請選擇開始時間'),
    endsAt: z.string().min(1, '請選擇結束時間'),
    registrationOpensAt: z.string().optional(),
    registrationClosesAt: z.string().optional(),
    capacity: z.coerce.number().int().min(0, '名額不能是負數').default(0),
    waitlistEnabled: z.coerce.boolean().default(false),
    status: z.enum(['draft', 'published', 'closed']).default('draft'),
  })
  .refine((v) => new Date(v.endsAt) >= new Date(v.startsAt), {
    message: '結束時間不能早於開始時間',
    path: ['endsAt'],
  })
  .refine(
    (v) =>
      !v.registrationOpensAt ||
      !v.registrationClosesAt ||
      new Date(v.registrationClosesAt) >= new Date(v.registrationOpensAt),
    { message: '報名截止時間不能早於開始報名時間', path: ['registrationClosesAt'] },
  )

export type EventInput = z.infer<typeof eventSchema>
