/**
 * 建立 Firestore 示範資料。
 * 連模擬器：先啟動 npm run emulators，或直接用 npm run dev:firebase
 */
import './load-env.ts'

import { COL, db, registrationId } from '../src/lib/firebase/admin.ts'
import { createRegistration } from '../src/lib/fs/registrations.ts'
import { createPrize } from '../src/lib/fs/draw.ts'
import { checkIn } from '../src/lib/fs/checkin.ts'

const DAY = 86400000
const firestore = db()

/** N 天後的台北時間 hh:mm */
function at(days: number, hour: number, minute = 0): string {
  const target = new Date(Date.now() + days * DAY)
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(target).split('-')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00+08:00`).toISOString()
}

const EVENTS = [
  {
    id: 'spring-yangmingshan-ride',
    title: '2026 春季陽明山團騎',
    summary: '與 KPlus 一起騎上仰德大道，全程約 40 公里。',
    description:
      '集合地點：士林捷運站 1 號出口\n路線：士林 → 仰德大道 → 擎天崗 → 原路折返\n' +
      '全程約 40 公里，總爬升 800 公尺，屬中等強度。\n\n請自備安全帽、水壺與補給。',
    location: '台北市士林區',
    startsAt: at(14, 7, 30), endsAt: at(14, 13),
    registrationClosesAt: at(12, 23, 59),
    capacity: 30, waitlistEnabled: true, status: 'published', drawPool: 'checked_in',
  },
  {
    id: 'alpha-helmet-launch',
    title: 'KPlus 新品體驗會 — Alpha 安全帽',
    summary: '搶先試戴全新 Alpha 系列，現場享專屬優惠。',
    description: '・Alpha 系列設計理念分享\n・風洞測試數據解說\n・現場試戴與頭型量測\n・限定預購優惠',
    location: 'KPlus 台北旗艦店',
    startsAt: at(5, 19), endsAt: at(5, 21),
    capacity: 12, waitlistEnabled: true, status: 'published', drawPool: 'checked_in',
  },
  {
    id: 'helmet-care-workshop',
    title: '安全帽保養與選購工作坊',
    summary: '教你正確清潔、保養，以及如何挑選合適的安全帽。',
    description: '由 KPlus 產品團隊主講，適合所有車友參加。不限名額。',
    location: '線上（Google Meet）',
    startsAt: at(21, 20), endsAt: at(21, 22),
    capacity: 0, waitlistEnabled: false, status: 'published', drawPool: 'all',
  },
  {
    id: 'autumn-round-island',
    title: '2026 秋季環島挑戰（籌備中）',
    summary: '九天八夜環島，細節確認中。',
    description: '路線與費用尚在確認，敬請期待。',
    location: '全台',
    startsAt: at(120, 6), endsAt: at(129, 18),
    capacity: 20, waitlistEnabled: false, status: 'draft', drawPool: 'checked_in',
  },
]

async function main() {
  for (const event of EVENTS) {
    const { id, ...rest } = event
    await firestore.collection(COL.events).doc(id).set({
      slug: id,
      coverImageUrl: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      confirmedCount: 0,
      waitlistCount: 0,
      createdAt: new Date().toISOString(),
      ...rest,
    })
    console.log(`✓ 活動：${event.title}`)
  }

  // 體驗會：8 人報名，其中 5 人已報到（示範抽獎只抽已報到者）
  const launch = 'alpha-helmet-launch'
  const names = ['王小明', '李美玲', '陳建宏', '林雅婷', '張志豪', '黃淑芬', '吳承翰', '蔡佳蓉']
  for (const [i, name] of names.entries()) {
    const result = await createRegistration(launch, `demo-user-${i}`, {
      name,
      phone: `09${String(12345678 + i).padStart(8, '0')}`,
      email: `rider${i}@example.com`,
      helmetSize: (['S', 'M', 'L'] as const)[i % 3],
    })
    if (result.ok && i < 5) {
      await checkIn(launch, registrationId(launch, `demo-user-${i}`), 'demo-staff')
    }
  }
  console.log('✓ 體驗會：8 人報名，5 人已報到')

  await createPrize(launch, { name: 'KPlus Alpha 安全帽', quantity: 1 })
  await createPrize(launch, { name: '聯名車衣', quantity: 2 })
  console.log('✓ 建立 2 個示範獎項（加碼獎項請於現場臨時新增）')

  // 集點示範：一位已報到三場的會員
  const loyal = 'demo-loyal'
  for (let i = 0; i < 3; i++) {
    const id = `past-ride-${i}`
    await firestore.collection(COL.events).doc(id).set({
      slug: id, title: `往期活動 ${i + 1}：週末團騎`,
      summary: '', description: '', location: '台北',
      coverImageUrl: null,
      startsAt: at(-(i + 3), 7), endsAt: at(-(i + 3), 11),
      registrationOpensAt: null, registrationClosesAt: null,
      capacity: 0, waitlistEnabled: false, status: 'published',
      drawPool: 'checked_in', confirmedCount: 0, waitlistCount: 0,
      createdAt: new Date().toISOString(),
    })
    // 活動已結束，直接寫入報名與報到（模擬歷史資料）
    const regId = registrationId(id, loyal)
    await firestore.collection(COL.registrations).doc(regId).set({
      eventId: id, userId: loyal, status: 'confirmed',
      name: '示範車友', phone: '+886912345678', email: null,
      helmetSize: 'M', emergencyContactName: null, emergencyContactPhone: null,
      notes: null, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), cancelledAt: null,
    })
    await firestore.collection(COL.checkins).doc(`${id}_${regId}`).set({
      eventId: id, registrationId: regId, userId: loyal,
      name: '示範車友', checkedInAt: at(-(i + 3), 8), checkedInBy: 'demo-staff',
    })
  }
  console.log('✓ 集點示範會員（demo-loyal）：已報到 3 場，可兌換 1 杯')

  console.log('\n完成。')
}

main().catch((error) => {
  console.error('seed 失敗：', error)
  process.exit(1)
})
