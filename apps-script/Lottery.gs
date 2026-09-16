/**
 * 抽籤分配名額。
 *
 * ── 為什麼抽籤比先到先得更適合這個平台 ──
 * 先到先得必須在「送出的當下」就決定錄取與否，所以每一次報名都要
 * 「數人數 → 判斷 → 寫入」，這段必須鎖起來，同時間只能處理一個人。
 * 抽籤則把決定延後：報名期間每個人只是「登記」，單純寫一列就結束，
 * 不需要讀全表、不需要判斷名額，尖峰時的壓力小一個數量級。
 *
 * ── 抽籤結果是可驗證的 ──
 * 不使用 Math.random() 決定順序，而是用
 *     排序鍵 = SHA256(抽籤種子 + ':' + 報名編號)
 * 由小到大排序。種子在開抽時產生並寫進活動資料，事後公開種子，
 * 任何人都能自己重算一次驗證名單沒有被動過手腳。
 */

/**
 * 對一場活動執行抽籤。
 *
 * @param {string} eventId
 * @param {boolean} force 已經抽過時是否重抽（會覆蓋原本結果）
 * @return {{ok:boolean, error?:string, confirmed?:number, waitlisted?:number, seed?:string}}
 */
function drawLottery_(eventId, force) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const event = findEventById_(eventId);
    if (!event) return { ok: false, error: '找不到這場活動。' };

    if (event.allocationMode !== ALLOCATION_LOTTERY) {
      return { ok: false, error: '這場活動的分配方式不是抽籤。' };
    }
    if (event.drawnAt && !force) {
      return { ok: false, error: '這場活動已經抽過籤了（' + event.drawnAt + '）。' };
    }

    const all = tableRead_(SHEET_REGISTRATIONS);

    // 參加抽籤的是「已登記」的人。重抽時把上次抽出的錄取/候補一起拉回來，
    // 但已經自行取消的人不再納入。
    const pool = all.filter(function (r) {
      if (r.eventId !== eventId) return false;
      if (r.status === 'cancelled') return false;
      if (force) return r.status === 'entered' || r.status === 'confirmed' || r.status === 'waitlist';
      return r.status === 'entered';
    });

    if (pool.length === 0) {
      return { ok: false, error: '沒有可抽籤的報名資料。' };
    }

    const seed = force || !event.drawSeed ? randomToken_() : event.drawSeed;

    // 可驗證的洗牌：用雜湊當排序鍵，而不是亂數
    const ordered = pool
      .map(function (r) {
        return { row: r, key: sha256_(seed + ':' + r.id) };
      })
      .sort(function (a, b) {
        if (a.key < b.key) return -1;
        if (a.key > b.key) return 1;
        return 0;
      });

    const capacity = event.capacity === 0 ? ordered.length : event.capacity;

    const statusUpdates = {};
    const rankUpdates = {};

    ordered.forEach(function (item, index) {
      statusUpdates[item.row.id] = index < capacity ? 'confirmed' : 'waitlist';
      rankUpdates[item.row.id] = String(index + 1);
    });

    tableBulkUpdateColumn_(SHEET_REGISTRATIONS, 'status', statusUpdates);
    tableBulkUpdateColumn_(SHEET_REGISTRATIONS, 'drawRank', rankUpdates);

    tableUpdateById_(SHEET_EVENTS, eventId, {
      drawSeed: seed,
      drawnAt: nowIso_(),
      updatedAt: nowIso_(),
    });

    const confirmed = Math.min(capacity, ordered.length);

    return {
      ok: true,
      seed: seed,
      total: ordered.length,
      confirmed: confirmed,
      waitlisted: ordered.length - confirmed,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 驗證抽籤結果：用公開的種子重新計算一次，比對名單是否相符。
 * 提供給管理員（或有疑慮的報名者）自行核對。
 */
function verifyLottery_(eventId) {
  const event = findEventById_(eventId);
  if (!event) return { ok: false, error: '找不到這場活動。' };
  if (!event.drawnAt || !event.drawSeed) {
    return { ok: false, error: '這場活動尚未抽籤。' };
  }

  const pool = tableRead_(SHEET_REGISTRATIONS).filter(function (r) {
    return r.eventId === eventId && r.drawRank;
  });

  const recomputed = pool
    .map(function (r) { return { id: r.id, key: sha256_(event.drawSeed + ':' + r.id) }; })
    .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });

  const mismatches = [];
  recomputed.forEach(function (item, index) {
    const stored = pool.filter(function (r) { return r.id === item.id; })[0];
    if (String(index + 1) !== String(stored.drawRank)) {
      mismatches.push({ id: item.id, expected: index + 1, stored: stored.drawRank });
    }
  });

  return {
    ok: mismatches.length === 0,
    seed: event.drawSeed,
    drawnAt: event.drawnAt,
    checked: recomputed.length,
    mismatches: mismatches,
  };
}
