/**
 * 灌入指定數量的「報名成功」參加者，用來測試現場抽獎與壓力測試。
 *
 * 用法：npx tsx scripts/seed-attendees.ts <活動代稱> <人數>
 * 例：  npx tsx scripts/seed-attendees.ts alpha-helmet-launch 100
 */
// 必須放在其他 import 之前：後面的模組會讀 process.env
import './load-env.ts'

import { findEventBySlug } from '../src/lib/repo/events.ts'
import { createRegistration } from '../src/lib/repo/registrations.ts'
import { createUser, findUserByPhone } from '../src/lib/repo/users.ts'

const slug = process.argv[2] ?? 'helmet-care-workshop'
const count = Number(process.argv[3] ?? 100)

const event = findEventBySlug(slug)
if (!event) {
  console.error(`找不到活動：${slug}`)
  process.exit(1)
}

let created = 0
for (let i = 0; i < count; i++) {
  // +886 9 + 8 位數字；務必唯一，否則會被當成同一個人而擋下重複報名
  const phone = `+8869${String(i).padStart(8, '0')}`
  const existing = findUserByPhone(phone)
  const user = existing ?? createUser({ name: `壓測參加者${i}`, phone, phoneVerified: true })

  const result = createRegistration(event, user.id, {
    name: `壓測參加者${i}`,
    phone: '0912345678',
  })
  // 有名額上限的活動會把超額者排入候補，那些人不能被抽獎抽到
  if (result.ok && result.registration.status === 'confirmed') created++
}

console.log(`✓ ${event.title}：新增 ${created} 位「報名成功」的參加者`)
