/**
 * KPlus 活動報名系統 — 設定
 *
 * 部署前只需要改這一個檔案。
 */

/** 這些 Email 登入後會成為管理員（小寫，逗號分隔請自行拆成陣列元素）。 */
const ADMIN_EMAILS = [
  'admin@kplushelmet.com',
];

/** 網站標題，顯示在頁首與信件中。 */
const SITE_TITLE = 'KPlus 活動報名';

/** 驗證碼有效時間（分鐘）。 */
const OTP_TTL_MINUTES = 10;

/** 同一組驗證碼最多可以試幾次。 */
const OTP_MAX_ATTEMPTS = 5;

/** 同一個 Email 一小時內最多能索取幾次驗證碼。 */
const OTP_MAX_SENDS_PER_HOUR = 5;

/** 登入狀態保留天數。 */
const SESSION_TTL_DAYS = 30;

/**
 * 名額分配方式：
 *   fcfs    先到先得 —— 送出當下就決定錄取或候補
 *   lottery 抽籤 —— 報名期間只登記，截止後由管理員抽出錄取名單
 */
const ALLOCATION_FCFS = 'fcfs';
const ALLOCATION_LOTTERY = 'lottery';

// ---------------------------------------------------------------- 資料表名稱
const SHEET_USERS = 'Users';
const SHEET_SESSIONS = 'Sessions';
const SHEET_OTP = 'OtpCodes';
const SHEET_EVENTS = 'Events';
const SHEET_REGISTRATIONS = 'Registrations';

/**
 * 各資料表的欄位。順序就是試算表的欄位順序，
 * 之後要加欄位請「加在最後面」，不要插在中間。
 */
const SCHEMA = {
  [SHEET_USERS]: ['id', 'email', 'name', 'phone', 'role', 'createdAt', 'updatedAt'],
  [SHEET_SESSIONS]: ['token', 'userId', 'expiresAt', 'createdAt'],
  [SHEET_OTP]: ['id', 'email', 'codeHash', 'expiresAt', 'attempts', 'consumedAt', 'createdAt'],
  [SHEET_EVENTS]: [
    'id', 'slug', 'title', 'summary', 'description', 'location', 'coverImageUrl',
    'startsAt', 'endsAt', 'registrationOpensAt', 'registrationClosesAt',
    'capacity', 'waitlistEnabled', 'status',
    'allocationMode', 'drawSeed', 'drawnAt',
    'createdAt', 'updatedAt',
  ],
  [SHEET_REGISTRATIONS]: [
    'id', 'eventId', 'userId', 'status', 'name', 'phone', 'email', 'helmetSize',
    'emergencyContactName', 'emergencyContactPhone', 'notes',
    'drawRank',
    'createdAt', 'updatedAt', 'cancelledAt',
  ],
};
