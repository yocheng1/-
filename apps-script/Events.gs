/**
 * 活動資料與報名開放狀態判斷。
 */

function parseEventRow_(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    location: row.location,
    coverImageUrl: row.coverImageUrl,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    registrationOpensAt: row.registrationOpensAt,
    registrationClosesAt: row.registrationClosesAt,
    capacity: parseInt(row.capacity || '0', 10),
    waitlistEnabled: row.waitlistEnabled === 'TRUE' || row.waitlistEnabled === 'true',
    status: row.status,
    allocationMode: row.allocationMode || ALLOCATION_FCFS,
    drawSeed: row.drawSeed || '',
    drawnAt: row.drawnAt || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listAllEvents_() {
  return tableRead_(SHEET_EVENTS).map(parseEventRow_);
}

function findEventById_(id) {
  const row = tableFindOne_(SHEET_EVENTS, function (e) { return e.id === id; });
  return row ? parseEventRow_(row) : null;
}

function findEventBySlug_(slug) {
  const row = tableFindOne_(SHEET_EVENTS, function (e) { return e.slug === slug; });
  return row ? parseEventRow_(row) : null;
}

/**
 * 這場活動現在能不能報名。
 * 前端顯示的按鈕文字與後端寫入前的檢查都走這個函式，避免兩邊判斷不一致。
 */
function registrationWindow_(event, now) {
  const at = now ? now.getTime() : Date.now();

  if (event.status === 'draft') return 'not_published';
  if (event.status === 'closed') return 'closed';

  if (event.endsAt && new Date(event.endsAt).getTime() <= at) return 'event_ended';

  if (event.registrationOpensAt && at < new Date(event.registrationOpensAt).getTime()) {
    return 'not_open_yet';
  }
  if (event.registrationClosesAt && at >= new Date(event.registrationClosesAt).getTime()) {
    return 'closed';
  }

  return 'open';
}

const REGISTRATION_WINDOW_LABEL = {
  open: '開放報名中',
  not_published: '尚未開放',
  not_open_yet: '報名尚未開始',
  closed: '報名已截止',
  event_ended: '活動已結束',
};

function eventSlugExists_(slug, exceptId) {
  return tableRead_(SHEET_EVENTS).some(function (e) {
    return e.slug === slug && e.id !== exceptId;
  });
}

function saveEvent_(input, id) {
  const slug = String(input.slug || '').trim().toLowerCase();

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('網址代稱只能使用小寫英文、數字與連字號。');
  }
  if (!String(input.title || '').trim()) {
    throw new Error('請輸入活動名稱。');
  }
  if (!input.startsAt || !input.endsAt) {
    throw new Error('請填寫活動開始與結束時間。');
  }
  if (new Date(input.endsAt).getTime() < new Date(input.startsAt).getTime()) {
    throw new Error('結束時間不能早於開始時間。');
  }
  if (input.registrationOpensAt && input.registrationClosesAt &&
      new Date(input.registrationClosesAt).getTime() < new Date(input.registrationOpensAt).getTime()) {
    throw new Error('報名截止時間不能早於開始報名時間。');
  }
  if (eventSlugExists_(slug, id)) {
    throw new Error('這個網址代稱已經被使用了。');
  }

  const capacity = Math.max(0, parseInt(input.capacity || '0', 10) || 0);

  const fields = {
    slug: slug,
    title: String(input.title).trim(),
    summary: String(input.summary || '').trim(),
    description: String(input.description || '').trim(),
    location: String(input.location || '').trim(),
    coverImageUrl: String(input.coverImageUrl || '').trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt || '',
    registrationClosesAt: input.registrationClosesAt || '',
    capacity: String(capacity),
    waitlistEnabled: input.waitlistEnabled ? 'TRUE' : 'FALSE',
    status: input.status || 'draft',
    allocationMode: input.allocationMode === ALLOCATION_LOTTERY
      ? ALLOCATION_LOTTERY
      : ALLOCATION_FCFS,
    updatedAt: nowIso_(),
  };

  if (id) {
    if (!findEventById_(id)) throw new Error('找不到這場活動。');
    tableUpdateById_(SHEET_EVENTS, id, fields);
    return findEventById_(id);
  }

  fields.id = newId_();
  fields.createdAt = nowIso_();
  fields.drawSeed = '';
  fields.drawnAt = '';
  tableAppend_(SHEET_EVENTS, fields);
  return findEventById_(fields.id);
}

function deleteEvent_(id) {
  // 先移除該活動的報名紀錄，避免留下孤兒資料
  const regs = tableRead_(SHEET_REGISTRATIONS)
    .filter(function (r) { return r.eventId === id; });

  const sheet = getSheet_(SHEET_REGISTRATIONS);
  // 由下往上刪，才不會因為刪列造成後面的列號位移
  regs.sort(function (a, b) { return b._rowIndex - a._rowIndex; })
      .forEach(function (r) { sheet.deleteRow(r._rowIndex); });

  tableDeleteById_(SHEET_EVENTS, id);
  return { ok: true };
}
