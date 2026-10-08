/* ============================
   やめログ — 純粋関数（時間計算・マイルストーン・統計）
   DOM や localStorage に依存しないので node --test から直接テストできる
   ============================ */

export const MS = {
  sec: 1000,
  min: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

/** マイルストーン（日数）とラベル */
export const MILESTONES = [
  { days: 1, label: '1日' },
  { days: 3, label: '3日' },
  { days: 7, label: '1週間' },
  { days: 14, label: '2週間' },
  { days: 21, label: '3週間' },
  { days: 30, label: '30日' },
  { days: 60, label: '60日' },
  { days: 90, label: '90日' },
  { days: 100, label: '100日' },
  { days: 180, label: '半年' },
  { days: 270, label: '9か月' },
  { days: 365, label: '1年' },
  { days: 500, label: '500日' },
  { days: 730, label: '2年' },
  { days: 1000, label: '1000日' },
  { days: 1095, label: '3年' },
  { days: 1825, label: '5年' },
  { days: 3650, label: '10年' },
];

/** マイルストーンの格（色分け用） */
export function milestoneTier(days) {
  if (days >= 365) return 'gold';
  if (days >= 90) return 'silver';
  if (days >= 30) return 'bronze';
  return 'green';
}

/** 経過ミリ秒を日・時・分・秒に分解 */
export function splitDuration(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor((t % 86400) / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

/** 現在の連続記録の経過ミリ秒 */
export function elapsedMs(habit, now = Date.now()) {
  return Math.max(0, now - habit.startedAt);
}

/** 到達済みの最大マイルストーンと次のマイルストーン、進捗率(0..1) */
export function milestoneProgress(ms) {
  const days = ms / MS.day;
  let prev = null;
  let next = null;
  for (const m of MILESTONES) {
    if (days >= m.days) prev = m;
    else { next = m; break; }
  }
  const prevMs = prev ? prev.days * MS.day : 0;
  if (!next) return { prev, next: null, ratio: 1, remainingMs: 0 };
  const nextMs = next.days * MS.day;
  const ratio = Math.min(1, Math.max(0, (ms - prevMs) / (nextMs - prevMs)));
  return { prev, next, ratio, remainingMs: nextMs - ms };
}

/** 到達済みマイルストーンの中で最大の日数（未到達なら 0） */
export function reachedMilestoneDays(ms) {
  const { prev } = milestoneProgress(ms);
  return prev ? prev.days : 0;
}

/** 節約額（現在の連続記録ぶん） */
export function moneySaved(habit, now = Date.now()) {
  return (habit.costPerDay || 0) * (elapsedMs(habit, now) / MS.day);
}

/** 取り戻した時間（分） */
export function minutesRegained(habit, now = Date.now()) {
  return (habit.minutesPerDay || 0) * (elapsedMs(habit, now) / MS.day);
}

/** 最長記録（ミリ秒） */
export function longestStreakMs(habit, now = Date.now()) {
  const past = (habit.history || []).map((s) => s.end - s.start);
  return Math.max(elapsedMs(habit, now), ...past, 0);
}

/** 累計クリーン時間（ミリ秒） */
export function totalCleanMs(habit, now = Date.now()) {
  const past = (habit.history || []).reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
  return past + elapsedMs(habit, now);
}

/** ローカル日付キー YYYY-MM-DD */
export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日付キー → その日 0:00 の Date（ローカル） */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 日付キーに n 日加算 */
export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/**
 * 誓いの連続日数。今日まだ誓っていなくても昨日まで続いていれば途切れていない扱い。
 * checkins: { 'YYYY-MM-DD': { pledgedAt } }
 */
export function pledgeStreak(checkins, today = dateKey()) {
  let key = checkins[today]?.pledgedAt ? today : addDays(today, -1);
  let count = 0;
  while (checkins[key]?.pledgedAt) {
    count += 1;
    key = addDays(key, -1);
  }
  return count;
}

/**
 * ある日の習慣の状態: 'relapse' | 'clean' | 'partial' | null
 * - relapse: その日にスリップを記録
 * - clean: その日がまるごとクリーン期間に含まれる
 * - partial: クリーン期間がその日の途中から始まった（開始日）
 */
export function dayStatus(habit, key, now = Date.now()) {
  const start = parseDateKey(key).getTime();
  const end = parseDateKey(addDays(key, 1)).getTime();
  if (start > now) return null;
  if ((habit.relapses || []).some((r) => r.at >= start && r.at < end)) return 'relapse';
  const periods = [...(habit.history || []), { start: habit.startedAt, end: now }];
  const dayEnd = Math.min(end, now);
  for (const p of periods) {
    if (p.start <= start && p.end >= dayEnd) return 'clean';
  }
  for (const p of periods) {
    if (p.start < dayEnd && p.end > start) return 'partial';
  }
  return null;
}

/** 月カレンダー用: その月の日付キー配列（先頭は日曜始まりの空白 null で埋める） */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** きっかけランキング [{ trigger, count }]（多い順） */
export function triggerRanking(urges, relapses = []) {
  const counts = new Map();
  for (const item of [...urges, ...relapses]) {
    if (!item.trigger) continue;
    counts.set(item.trigger, (counts.get(item.trigger) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger));
}

/* ---------- 表示用フォーマット ---------- */

export function formatMoney(value, currency = '¥') {
  const n = Math.floor(value);
  return `${currency}${n.toLocaleString('ja-JP')}`;
}

/** 分 → 「3日 4時間」「5時間 20分」「12分」 */
export function formatMinutes(totalMinutes) {
  const m = Math.floor(totalMinutes);
  if (m < 60) return `${m}分`;
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days}日 ${hours}時間` : `${days}日`;
  return mins ? `${hours}時間 ${mins}分` : `${hours}時間`;
}

/** ミリ秒 → 「12日」「5時間」「30分」程度のざっくり表記 */
export function formatShortDuration(ms) {
  const { days, hours, minutes } = splitDuration(ms);
  if (days > 0) return hours ? `${days}日 ${hours}時間` : `${days}日`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

/** 日数 → 「1年 2か月」等の補足表記（30日以上のみ） */
export function formatDaysLong(days) {
  if (days < 30) return '';
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) return months ? `${years}年 ${months}か月` : `${years}年`;
  return `${months}か月`;
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** <input type="datetime-local"> 用の値 */
export function toDateTimeLocal(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}
