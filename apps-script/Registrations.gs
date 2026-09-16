/**
 * 報名、取消與名額控管。
 *
 * ── 名額為什麼不會超收 ──
 * 「數目前人數 → 判斷還有沒有名額 → 寫入報名」這三步全部包在
 * LockService.getScriptLock() 裡。指令碼鎖是整個專案共用的，
 * 同一時間只有一個執行緒能進入，所以兩個人同時搶最後一個名額時，
 * 後進來的那個一定會讀到已經更新過的人數。
 *
 * 注意：試算表沒有「唯一索引」可以當第二道防線（Next.js 版本有），
 * 所以這裡的鎖是唯一的保障 —— 任何會寫入報名的路徑都必須經過本檔案的函式，
 * 不要繞過去直接呼叫 tableAppend_。
 */

function parseRegistrationRow_(row) {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    helmetSize: row.helmetSize,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    notes: row.notes,
    drawRank: row.drawRank,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: row.cancelledAt,
  };
}

function listEventRegistrations_(eventId) {
  const order = { confirmed: 0, entered: 1, waitlist: 2, cancelled: 3 };
  return tableRead_(SHEET_REGISTRATIONS)
    .filter(function (r) { return r.eventId === eventId; })
    .map(parseRegistrationRow_)
    .sort(function (a, b) {
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

function getAvailability_(event, allRegistrations) {
  const rows = allRegistrations || tableRead_(SHEET_REGISTRATIONS);

  let confirmed = 0;
  let waitlisted = 0;
  let entered = 0;
  rows.forEach(function (r) {
    if (r.eventId !== event.id) return;
    if (r.status === 'confirmed') confirmed++;
    else if (r.status === 'waitlist') waitlisted++;
    else if (r.status === 'entered') entered++;
  });

  const unlimited = event.capacity === 0;
  const isLottery = event.allocationMode === ALLOCATION_LOTTERY;

  return {
    capacity: event.capacity,
    confirmed: confirmed,
    waitlisted: waitlisted,
    // 抽籤活動在開抽前的「已登記」人數
    entered: entered,
    isLottery: isLottery,
    drawn: Boolean(event.drawnAt),
    remaining: unlimited ? null : Math.max(0, event.capacity - confirmed),
    // 抽籤活動在開抽前永遠可以繼續登記，不會「額滿」
    isFull: !isLottery && !unlimited && confirmed >= event.capacity,
  };
}

/**
 * 只讀「eventId / userId / status」三個欄位的輕量索引。
 *
 * 報名決策其實只需要這三個值，但 tableRead_ 會把整張表（十幾個欄位、
 * 含備註等長文字）全部拉回來。報名表這三欄剛好相鄰，一次 getRange 就能取得，
 * 傳輸量小一個數量級 —— 而這段是包在鎖裡的，每快一點，尖峰時能服務的人就多一些。
 */
function readRegistrationIndex_() {
  const headers = SCHEMA[SHEET_REGISTRATIONS];
  const startCol = headers.indexOf('eventId');
  const sheet = getSheet_(SHEET_REGISTRATIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // eventId, userId, status 三欄相鄰
  const values = sheet.getRange(2, startCol + 1, lastRow - 1, 3).getValues();

  return values.map(function (row) {
    return {
      eventId: String(row[0] || ''),
      userId: String(row[1] || ''),
      status: String(row[2] || ''),
    };
  });
}

function findActiveRegistration_(eventId, userId) {
  const row = tableFindOne_(SHEET_REGISTRATIONS, function (r) {
    return r.eventId === eventId && r.userId === userId && r.status !== 'cancelled';
  });
  return row ? parseRegistrationRow_(row) : null;
}

/**
 * 建立報名。回傳 { ok, registration, waitlisted } 或 { ok:false, error }。
 */
function createRegistration_(event, userId, input) {
  if (!String(input.name || '').trim()) {
    return { ok: false, error: '請輸入姓名。' };
  }
  const phone = normalizePhone_(input.phone);
  if (!phone) {
    return { ok: false, error: '手機號碼格式不正確。' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // 鎖拿到之後才重新讀資料，確保讀到的是最新狀態
    const window = registrationWindow_(event);
    if (window !== 'open') {
      return { ok: false, error: '目前無法報名：' + REGISTRATION_WINDOW_LABEL[window] + '。' };
    }

    // 決策只需要 eventId / userId / status 三欄，不必把整張表拉回來
    const index = readRegistrationIndex_();

    const duplicate = index.some(function (r) {
      return r.eventId === event.id && r.userId === userId && r.status !== 'cancelled';
    });
    if (duplicate) {
      return { ok: false, error: '您已經報名過這場活動了。' };
    }

    let status;

    if (event.allocationMode === ALLOCATION_LOTTERY) {
      // 抽籤：報名期間一律先登記，截止後才由管理員抽出錄取名單。
      // 少掉「數目前有幾個人錄取」這段，鎖裡要做的事更少。
      status = 'entered';
    } else {
      let confirmed = 0;
      index.forEach(function (r) {
        if (r.eventId === event.id && r.status === 'confirmed') confirmed++;
      });

      const unlimited = event.capacity === 0;
      const hasRoom = unlimited || confirmed < event.capacity;

      if (hasRoom) {
        status = 'confirmed';
      } else if (event.waitlistEnabled) {
        status = 'waitlist';
      } else {
        return { ok: false, error: '很抱歉，這場活動名額已滿。' };
      }
    }

    const now = nowIso_();
    const registration = {
      id: newId_(),
      eventId: event.id,
      userId: userId,
      status: status,
      name: String(input.name).trim(),
      phone: phone,
      email: normalizeEmail_(input.email || ''),
      helmetSize: String(input.helmetSize || ''),
      emergencyContactName: String(input.emergencyContactName || '').trim(),
      emergencyContactPhone: normalizePhone_(input.emergencyContactPhone) || '',
      notes: String(input.notes || '').trim(),
      drawRank: '',
      createdAt: now,
      updatedAt: now,
      cancelledAt: '',
    };

    tableAppend_(SHEET_REGISTRATIONS, registration);

    return { ok: true, registration: registration, waitlisted: status === 'waitlist' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 取消報名。
 * 取消的若是「已確認」名額且該活動有候補，會自動遞補等最久的候補者。
 */
function cancelRegistration_(registrationId, userId, isAdmin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const all = tableRead_(SHEET_REGISTRATIONS);
    const row = all.filter(function (r) { return r.id === registrationId; })[0];

    if (!row) return { ok: false, error: '找不到這筆報名紀錄。' };
    if (!isAdmin && row.userId !== userId) {
      return { ok: false, error: '您沒有權限取消這筆報名。' };
    }
    if (row.status === 'cancelled') {
      return { ok: false, error: '這筆報名已經取消過了。' };
    }

    const now = nowIso_();
    tableUpdateById_(SHEET_REGISTRATIONS, registrationId, {
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
    });

    // 空出來的若不是確認名額，就沒有遞補的問題
    if (row.status !== 'confirmed') {
      return { ok: true, promotedUserId: null };
    }

    const event = findEventById_(row.eventId);
    if (!event || event.capacity === 0) {
      return { ok: true, promotedUserId: null };
    }

    let confirmed = 0;
    all.forEach(function (r) {
      if (r.eventId === row.eventId && r.status === 'confirmed' && r.id !== registrationId) {
        confirmed++;
      }
    });
    if (confirmed >= event.capacity) {
      return { ok: true, promotedUserId: null };
    }

    // 抽過籤的活動照抽籤名次遞補；先到先得的活動照報名時間遞補。
    const next = all
      .filter(function (r) { return r.eventId === row.eventId && r.status === 'waitlist'; })
      .sort(function (a, b) {
        const rankA = parseInt(a.drawRank || '0', 10);
        const rankB = parseInt(b.drawRank || '0', 10);
        if (rankA && rankB) return rankA - rankB;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0];

    if (!next) return { ok: true, promotedUserId: null };

    tableUpdateById_(SHEET_REGISTRATIONS, next.id, {
      status: 'confirmed',
      updatedAt: now,
    });

    return { ok: true, promotedUserId: next.userId, promotedRegistrationId: next.id };
  } finally {
    lock.releaseLock();
  }
}

function listUserRegistrations_(userId) {
  const events = {};
  listAllEvents_().forEach(function (e) { events[e.id] = e; });

  return tableRead_(SHEET_REGISTRATIONS)
    .filter(function (r) { return r.userId === userId; })
    .map(function (r) {
      const reg = parseRegistrationRow_(r);
      const event = events[r.eventId];
      reg.event = event ? {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        location: event.location,
        status: event.status,
      } : null;
      return reg;
    })
    .filter(function (r) { return r.event !== null; })
    .sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

// ---------------------------------------------------------------- 工具

/**
 * 台灣手機號碼正規化成 +886 開頭。
 * 格式不對回傳 null，空字串回傳空字串（緊急聯絡人電話可留空）。
 */
function normalizePhone_(input) {
  const raw = String(input === undefined || input === null ? '' : input);
  if (!raw.trim()) return '';

  const digits = raw.replace(/[\s()-]/g, '');

  if (/^09\d{8}$/.test(digits)) return '+886' + digits.slice(1);
  if (/^\+8869\d{8}$/.test(digits)) return digits;
  if (/^8869\d{8}$/.test(digits)) return '+' + digits;

  return null;
}

/** 顯示用：+886912345678 → 0912345678 */
function formatPhone_(e164) {
  const value = String(e164 || '');
  return value.indexOf('+886') === 0 ? '0' + value.slice(4) : value;
}
