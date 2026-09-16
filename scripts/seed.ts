/**
 * 建立示範資料：一位管理員、幾場不同狀態的活動，以及一些報名紀錄。
 * 執行：npm run db:seed
 */
// 必須放在其他 import 之前：後面的模組會讀 process.env
import './load-env.ts'

import { createEvent, findEventBySlug } from '../src/lib/repo/events.ts'
import { createRegistration } from '../src/lib/repo/registrations.ts'
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  updateUserProfile,
} from '../src/lib/repo/users.ts'
import { hashPassword } from '../src/lib/auth/password.ts'

const DAY = 24 * 60 * 60 * 1000

/**
 * N 天後的台北時間 hh:mm。
 * 直接用 Date.now() + offset 會得到「執行當下的時分」，示範資料看起來很隨機，
 * 所以這裡把時間對齊到整點。
 */
function at(days: number, hour: number, minute = 0): string {
  const target = new Date(Date.now() + days * DAY)
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(target)
    .split('-')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00+08:00`).toISOString()
}

async function main() {
  // ---------------------------------------------------------- 管理員
  const adminEmail = 'admin@kplushelmet.com'
  let admin = findUserByEmail(adminEmail)
  if (!admin) {
    admin = createUser({
      name: 'KPlus 管理員',
      email: adminEmail,
      passwordHash: await hashPassword('kplus2026admin'),
      emailVerified: true,
    })
    console.log(`✓ 建立管理員帳號：${adminEmail} / kplus2026admin`)
  } else {
    console.log(`· 管理員帳號已存在：${adminEmail}`)
  }

  if (admin.role !== 'admin') {
    // 帳號可能是在 ADMIN_EMAILS 設定之前就建立的，重寫 email 會一併重算角色
    admin = updateUserProfile(admin.id, { email: adminEmail }) ?? admin
  }

  if (admin.role !== 'admin') {
    console.warn(
      `⚠ ${adminEmail} 仍不是管理員。請確認 .env.local 的 ADMIN_EMAILS 有包含這個 email。`,
    )
  } else {
    console.log('✓ 管理員權限已就緒')
  }

  // ---------------------------------------------------------- 活動
  const eventDefs = [
    {
      title: '2026 春季陽明山團騎',
      slug: 'spring-yangmingshan-ride',
      summary: '與 KPlus 一起騎上仰德大道，全程約 40 公里。',
      description:
        '集合地點：士林捷運站 1 號出口\n' +
        '路線：士林 → 仰德大道 → 擎天崗 → 原路折返\n' +
        '全程約 40 公里，總爬升 800 公尺，屬中等強度。\n\n' +
        '請自備安全帽、水壺與補給。現場提供 KPlus 安全帽試戴。',
      location: '台北市士林區',
      startsAt: at(14, 7, 30),
      endsAt: at(14, 13),
      registrationClosesAt: at(12, 23, 59),
      capacity: 30,
      waitlistEnabled: true,
      status: 'published' as const,
    },
    {
      title: 'KPlus 新品體驗會 — Alpha 安全帽',
      slug: 'alpha-helmet-launch',
      summary: '搶先試戴全新 Alpha 系列，現場享專屬優惠。',
      description:
        '活動內容：\n・Alpha 系列設計理念分享\n・風洞測試數據解說\n・現場試戴與頭型量測\n・限定預購優惠\n\n名額有限，額滿為止。',
      location: 'KPlus 台北旗艦店',
      startsAt: at(5, 19),
      endsAt: at(5, 21),
      capacity: 12,
      waitlistEnabled: true,
      status: 'published' as const,
    },
    {
      title: '安全帽保養與選購工作坊',
      slug: 'helmet-care-workshop',
      summary: '教你正確清潔、保養，以及如何挑選合適的安全帽。',
      description: '由 KPlus 產品團隊主講，適合所有車友參加。不限名額，歡迎自由報名。',
      location: '線上（Google Meet）',
      startsAt: at(21, 20),
      endsAt: at(21, 22),
      capacity: 0,
      waitlistEnabled: false,
      status: 'published' as const,
    },
    {
      title: '2026 秋季環島挑戰（籌備中）',
      slug: 'autumn-round-island',
      summary: '九天八夜環島，細節確認中。',
      description: '路線與費用尚在確認，敬請期待。',
      location: '全台',
      startsAt: at(120, 6),
      endsAt: at(129, 18),
      capacity: 20,
      waitlistEnabled: false,
      status: 'draft' as const,
    },
  ]

  const created = []
  for (const def of eventDefs) {
    if (findEventBySlug(def.slug)) {
      console.log(`· 活動已存在，略過：${def.title}`)
      continue
    }
    created.push(createEvent(def))
    console.log(`✓ 建立活動：${def.title}`)
  }

  // ---------------------------------------------------------- 示範報名
  const launch = findEventBySlug('alpha-helmet-launch')
  if (launch) {
    const names = ['王小明', '李美玲', '陳建宏', '林雅婷', '張志豪']
    for (const [index, name] of names.entries()) {
      const phone = `+8869880000${String(index).padStart(2, '0')}`
      const existing = findUserByPhone(phone)
      const rider = existing ?? createUser({ name, phone, phoneVerified: true })

      const result = createRegistration(launch, rider.id, {
        name,
        phone,
        email: `rider${index}@example.com`,
        helmetSize: (['S', 'M', 'L'] as const)[index % 3],
        emergencyContactName: '家人',
        emergencyContactPhone: '+886987654321',
        notes: index === 0 ? '會晚 10 分鐘到' : '',
      })
      if (result.ok) console.log(`  ✓ ${name} 報名 ${launch.title}（${result.registration.status}）`)
    }
  }

  console.log(`\n完成。共建立 ${created.length} 場新活動。`)
  console.log('啟動開發伺服器：npm run dev')
}

main().catch((error) => {
  console.error('seed 失敗：', error)
  process.exit(1)
})
