# KPlus 活動報名系統

KPlus 安全帽的活動報名平台：會員登入、瀏覽活動、線上報名與名額控管，以及給工作人員用的後台。

以 Next.js 15 (App Router) + TypeScript + SQLite 實作，`npm install` 之後即可在本機完整跑起來，不需要額外架資料庫。

---

## 快速開始

```bash
npm install
cp .env.example .env.local
npm run db:seed      # 建立示範活動與管理員帳號
npm run dev          # http://localhost:3000
```

示範管理員帳號：

| Email | 密碼 |
| --- | --- |
| `admin@kplushelmet.com` | `kplus2026admin` |

> 管理員權限是看 `.env.local` 的 `ADMIN_EMAILS`。清單中的 Email 註冊或登入後會自動成為管理員。

---

## 功能

### 登入（三種方式）

| 方式 | 說明 |
| --- | --- |
| **手機號碼 + OTP** | 輸入手機 → 收 6 位數驗證碼 → 登入。第一次使用會自動建立帳號。 |
| **Email + 密碼** | 一般註冊／登入。密碼以 scrypt 加鹽雜湊保存。 |
| **LINE Login** | OAuth 2.0 + OpenID Connect。未設定 channel 時登入頁會停用該按鈕。 |

同一個人用不同方式登入時，若 LINE 有回傳「已驗證的 Email」且系統已有相同 Email 的帳號，會自動綁到既有帳號，不會產生兩個帳號。

### 活動報名

- 活動列表與詳情頁（草稿狀態不會出現在前台）
- 報名表單：姓名、手機、Email、安全帽尺寸、緊急聯絡人、備註
- **名額控管**：不會超收，詳見下方〈名額控管怎麼做的〉
- **候補名單**（可逐場開關）：額滿後仍可報名並列入候補，有人取消時自動遞補等最久的候補者
- 重複報名會被擋下；取消後可以重新報名
- 「我的報名」：查看進行中與已取消的報名、隨時取消

### 後台管理

- 新增／編輯／刪除活動，控制發佈狀態（草稿・已發佈・已關閉報名）
- 設定名額上限、報名開放與截止時間
- 查看每場活動的報名名單（含候補與已取消）
- 代替參加者取消報名
- **匯出 CSV**：含 UTF-8 BOM，用 Excel 開啟中文不會變亂碼

---

## 名額控管怎麼做的

同時有兩個人搶最後一個名額，是這類系統最容易出錯的地方。這裡用兩層防護：

**第一層 — `BEGIN IMMEDIATE` 交易。**
「數目前人數 → 判斷還有沒有名額 → 寫入報名」這三個步驟包在同一個 write lock 裡
（`src/lib/db.ts` 的 `transaction()`），後到的請求會等前一個交易結束才讀得到人數，
所以不會兩個人都讀到「還剩 1 個」而雙雙寫入。

**第二層 — 資料庫的 partial unique index。**

```sql
CREATE UNIQUE INDEX idx_registrations_active_unique
  ON registrations (event_id, user_id)
  WHERE status <> 'cancelled';
```

就算應用層邏輯有漏，資料庫也不允許同一個人在同一場活動有兩筆「有效」報名。
條件排除 `cancelled`，所以取消後仍可重新報名。

名額填 `0` 代表不限名額。

---

## 安全性

| 項目 | 作法 |
| --- | --- |
| 密碼 | Node 內建 scrypt，每筆獨立 salt，比對用 `timingSafeEqual` |
| Session | 32 bytes 隨機 token 放在 httpOnly cookie，資料庫只存 SHA-256。不是 JWT，所以不需要簽章密鑰 |
| OTP | 只存雜湊（連同手機號碼一起 hash，不能跨號碼使用）、5 分鐘過期、最多試 5 次、用過即作廢、重新索取會讓舊碼失效 |
| 次數限制 | 同一支手機 1 小時最多 5 則簡訊；同一個 Email 15 分鐘最多 10 次登入嘗試 |
| 帳號探測 | 登入失敗一律回「Email 或密碼不正確」，不透露該 Email 是否存在 |
| LINE 登入 | `state` 擋 CSRF 且用過即刪、`nonce` 擋 replay；`id_token` 在本地驗章並檢查 `iss` / `aud` / `exp` / `nonce` |
| 轉址 | 登入後的 `redirectTo` 只接受站內相對路徑，避免開放式轉址 |
| CSV | 開頭為 `= + - @` 的欄位前面補單引號，避免 Excel 公式注入 |
| 後台 | `src/app/admin/layout.tsx` 統一擋權限，每個 server action 也各自再檢查一次 |

---

## 環境變數

全部列在 `.env.example`，重點如下：

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `DATABASE_PATH` | 否 | SQLite 檔案位置，預設 `data/kplus.db` |
| `ADMIN_EMAILS` | 否 | 逗號分隔，這些 Email 自動取得管理員權限 |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | 否 | 沒填的話登入頁的 LINE 按鈕會停用 |
| `LINE_REDIRECT_URI` | 否 | 預設 `http://localhost:3000/api/auth/line/callback`，需與 LINE console 設定一致 |
| `SMS_PROVIDER` | 否 | 預設 `console`（驗證碼印在伺服器 log） |
| `SHOW_OTP_IN_RESPONSE` | 否 | 開發時在畫面上直接顯示驗證碼；正式環境強制關閉 |

---

## 指令

```bash
npm run dev        # 開發伺服器
npm run build      # 正式版建置
npm start          # 執行建置後的版本
npm test           # 單元測試（37 項）
npm run typecheck  # TypeScript 型別檢查
npm run db:seed    # 建立示範資料（可重複執行）
npm run db:reset   # 刪除本機資料庫
```

> `npm run db:reset` 之後請一併重啟開發伺服器 —— SQLite 連線是啟動時建立的，
> 檔案被刪掉後伺服器仍會寫入那個舊的（已不存在的）檔案。

---

## 專案結構

```
db/schema.sql                  資料表定義（啟動時自動套用）
scripts/seed.ts                示範資料
src/lib/
  db.ts                        SQLite 連線與 transaction()
  env.ts                       環境變數
  validation.ts                zod schema 與手機號碼正規化
  format.ts                    台北時區的日期格式化
  rate-limit.ts                次數限制
  auth/  password · session · otp · sms · line
  repo/  users · events · registrations
src/app/
  events/                      活動列表與詳情（含報名表單）
  login/                       三種登入方式
  me/                          我的報名
  admin/                       後台（活動管理、名單、CSV 匯出）
  api/auth/line/               LINE OAuth start / callback
  actions/                     server actions
tests/                         單元測試
```

---

## 測試

```bash
npm test
```

37 項單元測試，涵蓋：

- 手機號碼正規化（各種台灣格式、拒絕市話與錯誤位數）
- 密碼雜湊與驗證（含 salt 隨機性、雜湊字串損壞時不丟例外）
- OTP：一次性、不能跨號碼使用、過期、錯誤次數上限、發送頻率限制
- 帳號：手機自動建立、LINE 以 Email 綁定既有帳號、管理員判定
- **名額控管：大量報名不會超收、額滿轉候補、不限名額**
- 重複報名、取消後可重新報名
- 取消時自動遞補最早的候補者
- 權限：不能取消別人的報名、管理員可代為取消
- 報名開放時間（草稿／已關閉／已結束／未開始／已截止）

---

## 接正式簡訊服務

目前 `SMS_PROVIDER=console` 只把驗證碼印在 log。要接真的簡訊商時，
在 `src/lib/auth/sms.ts` 的 `providers` 加一個實作 `SmsProvider` 的物件，
再把 `SMS_PROVIDER` 換成對應名稱即可，其餘程式不用動。

```ts
const mitakeProvider: SmsProvider = {
  async send(to, message) {
    // 呼叫簡訊商 API
  },
}

const providers: Record<string, SmsProvider> = {
  console: consoleProvider,
  mitake: mitakeProvider,
}
```

---

## 部署注意事項

資料存在 SQLite 檔案，適合單一台伺服器（VPS、Docker、Fly.io 等），
**不適合 Vercel 這類每次請求都可能換一台機器、檔案系統不持久的環境**。

要上 Vercel 或需要多台機器時，把 `src/lib/repo/` 底下三個檔案改接 Postgres 即可
—— 資料存取都收斂在這一層，上面的頁面與 server action 不需要改動。
改接時請保留 `BEGIN IMMEDIATE` 對應的隔離等級（Postgres 可用 `SELECT ... FOR UPDATE`
鎖住該場活動，或改用 `SERIALIZABLE`），否則名額控管的保證會失效。

正式環境另外記得：

- `SHOW_OTP_IN_RESPONSE` 會自動關閉，但仍請確認 `NODE_ENV=production`
- 換掉 seed 建立的管理員預設密碼
- 接上真的簡訊服務
- 以 HTTPS 提供服務（session cookie 在 production 會帶 `secure` 旗標）
