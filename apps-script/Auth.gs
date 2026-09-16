/**
 * 登入：Email + 一次性驗證碼（OTP）。
 *
 * 為什麼不用 Google 帳號登入？
 * 這個網頁應用以「擁有者身分執行、任何人皆可存取」部署，
 * 這樣指令碼才有權限寫入試算表，但也因此 Session.getActiveUser() 取不到
 * 訪客的 Email。報名者也未必都有 Google 帳號，所以自行以 Email 驗證身分。
 *
 * 驗證碼透過 MailApp 寄出，不需要簡訊費用。
 * 配額：一般 Gmail 每天 100 封、Workspace 每天 1500 封。
 */

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function roleForEmail_(email) {
  return ADMIN_EMAILS.indexOf(normalizeEmail_(email)) !== -1 ? 'admin' : 'user';
}

function generateOtpCode_() {
  // 6 位數，前面補零
  const n = Math.floor(Math.random() * 1000000);
  return ('00000' + n).slice(-6);
}

/**
 * 索取驗證碼。回傳 { ok, error }。
 * 為了不讓人用這支 API 探測哪些 Email 有註冊，無論帳號存不存在都回 ok。
 */
function requestOtp(email) {
  const normalized = normalizeEmail_(email);
  if (!isValidEmail_(normalized)) {
    return { ok: false, error: 'Email 格式不正確。' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const all = tableRead_(SHEET_OTP);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recent = all.filter(function (row) {
      return row.email === normalized && new Date(row.createdAt).getTime() > oneHourAgo;
    });

    if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
      return { ok: false, error: '索取驗證碼太頻繁，請稍後再試。' };
    }

    // 舊的驗證碼立刻作廢，確保同時只有一組有效
    all.forEach(function (row) {
      if (row.email === normalized && !row.consumedAt) {
        tableUpdateById_(SHEET_OTP, row.id, { consumedAt: nowIso_() });
      }
    });

    const code = generateOtpCode_();

    tableAppend_(SHEET_OTP, {
      id: newId_(),
      email: normalized,
      // 連同 Email 一起雜湊，同一組數字無法換個信箱使用
      codeHash: sha256_(normalized + ':' + code),
      expiresAt: isoFromNow_(OTP_TTL_MINUTES * 60 * 1000),
      attempts: '0',
      consumedAt: '',
      createdAt: nowIso_(),
    });

    MailApp.sendEmail({
      to: normalized,
      subject: '【' + SITE_TITLE + '】您的登入驗證碼：' + code,
      body:
        '您好，\n\n' +
        '您的登入驗證碼是：' + code + '\n\n' +
        '此驗證碼將於 ' + OTP_TTL_MINUTES + ' 分鐘後失效，且僅能使用一次。\n' +
        '若這不是您本人的操作，請忽略這封信，您的帳號不會有任何變動。\n\n' +
        SITE_TITLE,
    });

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 驗證驗證碼。成功時建立 session 並回傳 token。
 */
function verifyOtp(email, code) {
  const normalized = normalizeEmail_(email);
  const trimmed = String(code || '').trim();

  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: '驗證碼是 6 位數字。' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const candidates = tableRead_(SHEET_OTP)
      .filter(function (row) { return row.email === normalized && !row.consumedAt; })
      .sort(function (a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const row = candidates[0];
    if (!row) return { ok: false, error: '請先索取驗證碼。' };

    if (isExpired_(row.expiresAt)) {
      tableUpdateById_(SHEET_OTP, row.id, { consumedAt: nowIso_() });
      return { ok: false, error: '驗證碼已過期，請重新索取。' };
    }

    const attempts = parseInt(row.attempts || '0', 10);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      tableUpdateById_(SHEET_OTP, row.id, { consumedAt: nowIso_() });
      return { ok: false, error: '錯誤次數過多，請重新索取驗證碼。' };
    }

    // 先記下這次嘗試，就算比對失敗也已扣掉一次機會
    tableUpdateById_(SHEET_OTP, row.id, { attempts: String(attempts + 1) });

    if (sha256_(normalized + ':' + trimmed) !== row.codeHash) {
      const remaining = OTP_MAX_ATTEMPTS - attempts - 1;
      return {
        ok: false,
        error: remaining > 0
          ? '驗證碼不正確，還可以試 ' + remaining + ' 次。'
          : '驗證碼不正確，請重新索取驗證碼。',
      };
    }

    // 成功後立刻作廢，一組驗證碼只能用一次
    tableUpdateById_(SHEET_OTP, row.id, { consumedAt: nowIso_() });

    const user = findOrCreateUserByEmail_(normalized);
    const token = randomToken_();

    tableAppend_(SHEET_SESSIONS, {
      token: sha256_(token), // 資料表只存雜湊，外洩也無法直接冒用
      userId: user.id,
      expiresAt: isoFromNow_(SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
      createdAt: nowIso_(),
    });

    return { ok: true, token: token, user: publicUser_(user) };
  } finally {
    lock.releaseLock();
  }
}

function findOrCreateUserByEmail_(email) {
  const existing = tableFindOne_(SHEET_USERS, function (u) { return u.email === email; });
  if (existing) {
    // ADMIN_EMAILS 可能是在帳號建立之後才加的，每次登入重新確認一次角色
    const role = roleForEmail_(email);
    if (existing.role !== role) {
      tableUpdateById_(SHEET_USERS, existing.id, { role: role, updatedAt: nowIso_() });
      existing.role = role;
    }
    return existing;
  }

  const user = {
    id: newId_(),
    email: email,
    name: '',
    phone: '',
    role: roleForEmail_(email),
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
  };
  tableAppend_(SHEET_USERS, user);
  return user;
}

/** 由 token 取得目前登入者，未登入或過期回傳 null。 */
function getUserByToken_(token) {
  if (!token) return null;

  const session = tableFindOne_(SHEET_SESSIONS, function (s) {
    return s.token === sha256_(token);
  });
  if (!session) return null;

  if (isExpired_(session.expiresAt)) return null;

  return tableFindOne_(SHEET_USERS, function (u) { return u.id === session.userId; });
}

function signOut(token) {
  if (!token) return { ok: true };
  const hash = sha256_(token);
  const session = tableFindOne_(SHEET_SESSIONS, function (s) { return s.token === hash; });
  if (session) {
    getSheet_(SHEET_SESSIONS).deleteRow(session._rowIndex);
  }
  return { ok: true };
}

/** 只回傳可以安全送到前端的欄位。 */
function publicUser_(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };
}

function requireUser_(token) {
  const user = getUserByToken_(token);
  if (!user) throw new Error('請先登入。');
  return user;
}

function requireAdmin_(token) {
  const user = requireUser_(token);
  if (user.role !== 'admin') throw new Error('需要管理員權限。');
  return user;
}
