/**
 * Firestore 安全規則測試。
 *
 * 規則是唯一能擋住「任何人打開開發者工具直接讀資料庫」的東西，
 * 所以要像測程式一樣測它。這些案例對應現行報到頁的實際漏洞。
 *
 * 執行前需先啟動模擬器：npm run emulators
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore'

let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kplus',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })

  // 用繞過規則的通道先鋪好測試資料
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/alice'), { name: '小美', phone: '+886912345678', role: 'user' })
    await setDoc(doc(db, 'events/published-1'), { title: '已發佈活動', status: 'published' })
    await setDoc(doc(db, 'events/draft-1'), { title: '草稿活動', status: 'draft' })
    await setDoc(doc(db, 'registrations/published-1_alice'), {
      eventId: 'published-1',
      userId: 'alice',
      name: '小美',
      phone: '+886912345678',
      emergencyContactPhone: '+886987654321',
      status: 'confirmed',
    })
    await setDoc(doc(db, 'winners/published-1_r1'), {
      eventId: 'published-1',
      name: '小美',
      maskedPhone: '0912***678',
      rank: 1,
    })
    await setDoc(doc(db, 'checkins/published-1_alice'), { eventId: 'published-1', userId: 'alice' })
    await setDoc(doc(db, 'rewards/rw1'), { userId: 'alice', store: '林口文化門市' })
  })
})

after(async () => {
  await env?.cleanup()
})

const anon = () => env.unauthenticatedContext().firestore()
const asUser = (uid) => env.authenticatedContext(uid).firestore()
const asStaff = (uid) => env.authenticatedContext(uid, { staff: true }).firestore()
const asAdmin = (uid) => env.authenticatedContext(uid, { admin: true }).firestore()

describe('報名資料的個資保護', () => {
  it('陌生人讀不到別人的報名資料（含電話）', async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'registrations/published-1_alice')))
  })

  it('未登入者更讀不到', async () => {
    await assertFails(getDoc(doc(anon(), 'registrations/published-1_alice')))
  })

  it('本人讀得到自己的報名', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'registrations/published-1_alice')))
  })

  it('工作人員讀得到報名名單（現場報到需要）', async () => {
    await assertSucceeds(getDoc(doc(asStaff('staff1'), 'registrations/published-1_alice')))
  })

  it('一般使用者不能列出全部報名', async () => {
    await assertFails(getDocs(collection(asUser('bob'), 'registrations')))
  })

  it('前端不能直接寫入報名（必須經過後端才能正確算名額）', async () => {
    await assertFails(
      setDoc(doc(asUser('bob'), 'registrations/published-1_bob'), {
        eventId: 'published-1',
        userId: 'bob',
        status: 'confirmed',
      }),
    )
  })
})

describe('權限提升防護', () => {
  it('使用者不能把自己改成管理員', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'users/alice'), { role: 'admin' }))
  })

  it('使用者可以改自己的姓名', async () => {
    await assertSucceeds(updateDoc(doc(asUser('alice'), 'users/alice'), { name: '小美美' }))
  })

  it('使用者讀不到別人的個人資料', async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'users/alice')))
  })
})

describe('活動可見性', () => {
  it('未登入者看得到已發佈的活動', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'events/published-1')))
  })

  it('未登入者看不到草稿活動', async () => {
    await assertFails(getDoc(doc(anon(), 'events/draft-1')))
  })

  it('管理員看得到草稿活動', async () => {
    await assertSucceeds(getDoc(doc(asAdmin('admin1'), 'events/draft-1')))
  })

  it('一般使用者不能新增活動', async () => {
    await assertFails(setDoc(doc(asUser('bob'), 'events/hack'), { title: '亂建', status: 'published' }))
  })
})

describe('抽獎大螢幕', () => {
  it('未登入者讀得到中獎名單（現場大螢幕需要）', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'winners/published-1_r1')))
  })

  it('中獎名單文件裡沒有完整電話，只有遮罩後的', async () => {
    let snapshot
    await env.withSecurityRulesDisabled(async (ctx) => {
      snapshot = await getDoc(doc(ctx.firestore(), 'winners/published-1_r1'))
    })
    const data = snapshot.data()
    assert.equal(data.maskedPhone, '0912***678')
    assert.equal(data.phone, undefined, '中獎名單不應含完整電話')
    assert.equal(data.email, undefined, '中獎名單不應含 Email')
  })

  it('任何人都不能竄改中獎名單', async () => {
    await assertFails(setDoc(doc(asUser('bob'), 'winners/published-1_r1'), { name: '我' }))
    await assertFails(setDoc(doc(asAdmin('admin1'), 'winners/published-1_r1'), { name: '我' }))
  })
})

describe('現場報到（原本完全沒有權限控管）', () => {
  it('未登入者讀不到報到資料', async () => {
    await assertFails(getDoc(doc(anon(), 'checkins/published-1_alice')))
  })

  it('一般參加者讀不到報到資料', async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'checkins/published-1_alice')))
  })

  it('工作人員讀得到', async () => {
    await assertSucceeds(getDoc(doc(asStaff('staff1'), 'checkins/published-1_alice')))
  })
})

describe('集點兌換', () => {
  it('本人看得到自己的兌換紀錄', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'rewards/rw1')))
  })

  it('別人看不到', async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'rewards/rw1')))
  })

  it('使用者不能自己新增兌換紀錄（必須門市人員核銷）', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'rewards/self'), { userId: 'alice' }))
  })
})
