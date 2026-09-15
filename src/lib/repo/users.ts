import { getDb, transaction } from '../db'
import { env } from '../env'
import { newId, nowIso } from '../ids'

export type UserRole = 'user' | 'admin'

export type User = {
  id: string
  name: string | null
  email: string | null
  emailVerifiedAt: string | null
  phone: string | null
  phoneVerifiedAt: string | null
  passwordHash: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

type UserRow = {
  id: string
  name: string | null
  email: string | null
  email_verified_at: string | null
  phone: string | null
  phone_verified_at: string | null
  password_hash: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    phone: row.phone,
    phoneVerifiedAt: row.phone_verified_at,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** ADMIN_EMAILS 裡列出的 email 註冊/登入後自動成為管理員。 */
function roleForEmail(email: string | null): UserRole {
  if (!email) return 'user'
  return env.adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user'
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined
  return row ? toUser(row) : null
}

export function findUserByEmail(email: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined
  return row ? toUser(row) : null
}

export function findUserByPhone(phone: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE phone = ?').get(phone) as
    | UserRow
    | undefined
  return row ? toUser(row) : null
}

type CreateUserInput = {
  name?: string | null
  email?: string | null
  phone?: string | null
  passwordHash?: string | null
  emailVerified?: boolean
  phoneVerified?: boolean
}

export function createUser(input: CreateUserInput): User {
  const now = nowIso()
  const id = newId()
  const email = input.email ?? null

  getDb()
    .prepare(
      `INSERT INTO users
         (id, name, email, email_verified_at, phone, phone_verified_at,
          password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name ?? null,
      email,
      input.emailVerified ? now : null,
      input.phone ?? null,
      input.phoneVerified ? now : null,
      input.passwordHash ?? null,
      roleForEmail(email),
      now,
      now,
    )

  return findUserById(id)!
}

/**
 * 手機 OTP 登入：號碼已經通過驗證，沒有帳號就直接開一個。
 */
export function findOrCreateUserByPhone(phone: string): User {
  const existing = findUserByPhone(phone)
  if (existing) {
    if (!existing.phoneVerifiedAt) {
      getDb()
        .prepare('UPDATE users SET phone_verified_at = ?, updated_at = ? WHERE id = ?')
        .run(nowIso(), nowIso(), existing.id)
      return findUserById(existing.id)!
    }
    return existing
  }
  return createUser({ phone, phoneVerified: true })
}

/**
 * 第三方登入（LINE）。
 *
 * 若該 LINE 帳號已綁過就直接登入；否則在 provider 有回傳「已驗證的 email」
 * 且系統中已有同 email 的帳號時，把身分掛到既有帳號上（避免同一個人產生兩個帳號）。
 * 其餘情況建立新帳號。
 */
export function findOrCreateUserByIdentity(params: {
  provider: 'line' | 'google'
  providerUserId: string
  displayName?: string | null
  pictureUrl?: string | null
  verifiedEmail?: string | null
}): User {
  return transaction((db) => {
    const identity = db
      .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
      .get(params.provider, params.providerUserId) as { user_id: string } | undefined

    if (identity) {
      const user = findUserById(identity.user_id)
      if (user) return user
    }

    let user: User | null = params.verifiedEmail
      ? findUserByEmail(params.verifiedEmail)
      : null

    if (!user) {
      user = createUser({
        name: params.displayName ?? null,
        email: params.verifiedEmail ?? null,
        emailVerified: Boolean(params.verifiedEmail),
      })
    } else if (!user.name && params.displayName) {
      db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(
        params.displayName,
        nowIso(),
        user.id,
      )
      user = findUserById(user.id)!
    }

    db.prepare(
      `INSERT INTO identities
         (id, user_id, provider, provider_user_id, display_name, picture_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, provider_user_id) DO UPDATE SET
         display_name = excluded.display_name,
         picture_url  = excluded.picture_url`,
    ).run(
      newId(),
      user.id,
      params.provider,
      params.providerUserId,
      params.displayName ?? null,
      params.pictureUrl ?? null,
      nowIso(),
    )

    return user
  })
}

export function updateUserProfile(
  id: string,
  fields: { name?: string | null; email?: string | null; phone?: string | null },
): User | null {
  const sets: string[] = []
  const values: unknown[] = []

  if (fields.name !== undefined) {
    sets.push('name = ?')
    values.push(fields.name)
  }
  if (fields.email !== undefined) {
    sets.push('email = ?', 'role = ?')
    values.push(fields.email, roleForEmail(fields.email))
  }
  if (fields.phone !== undefined) {
    sets.push('phone = ?')
    values.push(fields.phone)
  }
  if (sets.length === 0) return findUserById(id)

  sets.push('updated_at = ?')
  values.push(nowIso(), id)

  getDb()
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values)
  return findUserById(id)
}

/** 使用者有哪些登入方式（顯示在「我的帳號」用）。 */
export function listUserIdentities(userId: string): { provider: string; displayName: string | null }[] {
  return getDb()
    .prepare('SELECT provider, display_name as displayName FROM identities WHERE user_id = ?')
    .all(userId) as { provider: string; displayName: string | null }[]
}
