/* ============================
   やめログ — データストア（localStorage 永続化と更新操作）
   ============================ */

import { dateKey, reachedMilestoneDays } from './logic.js';

export const STORAGE_KEY = 'yamelog:v1';
export const SCHEMA_VERSION = 1;

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyData() {
  return {
    version: SCHEMA_VERSION,
    settings: { currency: '¥', theme: 'auto', onboarded: false },
    habits: [],
    checkins: {},
    urges: [],
    journal: [],
  };
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function normalizeHabit(h, now) {
  const createdAt = num(h.createdAt, now);
  return {
    id: /^[\w-]{1,40}$/.test(str(h.id)) ? h.id : uid('h'),
    name: str(h.name, '習慣').slice(0, 40) || '習慣',
    emoji: str(h.emoji, '✨') || '✨',
    color: str(h.color, '#2a9d8f') || '#2a9d8f',
    startedAt: Math.min(num(h.startedAt, createdAt), now),
    createdAt,
    costPerDay: Math.max(0, num(h.costPerDay)),
    minutesPerDay: Math.max(0, num(h.minutesPerDay)),
    reasons: arr(h.reasons).filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim()),
    history: arr(h.history)
      .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end >= s.start)
      .map((s) => ({ start: s.start, end: s.end })),
    relapses: arr(h.relapses)
      .filter((r) => Number.isFinite(r?.at))
      .map((r) => ({ at: r.at, trigger: str(r.trigger), note: str(r.note) })),
    celebrated: num(h.celebrated),
  };
}

/** 欠損・壊れたフィールドを既定値で補完する（古いデータ・手で編集されたデータ対策） */
export function normalize(raw, now = Date.now()) {
  const base = emptyData();
  const data = obj(raw);
  const settings = obj(data.settings);
  const checkins = {};
  for (const [key, value] of Object.entries(obj(data.checkins))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const c = obj(value);
    checkins[key] = {
      pledgedAt: num(c.pledgedAt) || null,
      reviewedAt: num(c.reviewedAt) || null,
      result: c.result === 'clean' || c.result === 'slip' ? c.result : null,
    };
  }
  return {
    version: SCHEMA_VERSION,
    settings: {
      currency: str(settings.currency, base.settings.currency).slice(0, 4),
      theme: ['auto', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'auto',
      onboarded: Boolean(settings.onboarded),
    },
    habits: arr(data.habits).filter((h) => h && typeof h === 'object').map((h) => normalizeHabit(h, now)),
    checkins,
    urges: arr(data.urges)
      .filter((u) => Number.isFinite(u?.at))
      .map((u) => ({
        id: str(u.id) || uid('u'),
        at: u.at,
        habitId: str(u.habitId) || null,
        intensity: Math.min(5, Math.max(1, num(u.intensity, 3))),
        trigger: str(u.trigger),
        outcome: u.outcome === 'gave_in' ? 'gave_in' : 'resisted',
      })),
    journal: arr(data.journal)
      .filter((j) => Number.isFinite(j?.at))
      .map((j) => ({
        id: str(j.id) || uid('j'),
        at: j.at,
        mood: Math.min(5, Math.max(1, num(j.mood, 3))),
        text: str(j.text),
        habitId: str(j.habitId) || null,
      })),
  };
}

/**
 * ストアを作る。storage は localStorage 互換（getItem/setItem/removeItem）。
 * clock はテスト用に差し替え可能な現在時刻関数。
 */
export function createStore(storage, clock = () => Date.now()) {
  let data = load();

  function load() {
    try {
      const text = storage?.getItem(STORAGE_KEY);
      return text ? normalize(JSON.parse(text), clock()) : emptyData();
    } catch {
      return emptyData();
    }
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  const findHabit = (id) => data.habits.find((h) => h.id === id);

  /** 最後のスリップ（＝現在の連続記録の開始可能な最小時刻） */
  function lastBreak(habit) {
    return habit.history.reduce((max, s) => Math.max(max, s.end), -Infinity);
  }

  function clampStart(habit, value) {
    const now = clock();
    const min = lastBreak(habit);
    let t = Number.isFinite(value) ? value : now;
    if (t > now) t = now;
    if (Number.isFinite(min) && t < min) t = min;
    return t;
  }

  return {
    get data() { return data; },
    get settings() { return data.settings; },
    get habits() { return data.habits; },
    findHabit,
    lastBreak,
    save,
    reload() { data = load(); return data; },

    addHabit(input) {
      const now = clock();
      const habit = normalizeHabit({ ...input, id: uid('h'), createdAt: now, history: [], relapses: [] }, now);
      habit.startedAt = clampStart(habit, input.startedAt);
      // 過去日付で登録した場合、すでに到達済みのマイルストーンはお祝いしない
      habit.celebrated = reachedMilestoneDays(now - habit.startedAt);
      data.habits.push(habit);
      data.settings.onboarded = true;
      save();
      return habit;
    },

    updateHabit(id, patch) {
      const habit = findHabit(id);
      if (!habit) return null;
      const now = clock();
      const next = normalizeHabit({ ...habit, ...patch, id: habit.id, history: habit.history, relapses: habit.relapses }, now);
      next.startedAt = clampStart(next, patch.startedAt ?? habit.startedAt);
      if (next.startedAt !== habit.startedAt) {
        next.celebrated = reachedMilestoneDays(now - next.startedAt);
      }
      Object.assign(habit, next);
      save();
      return habit;
    },

    deleteHabit(id) {
      data.habits = data.habits.filter((h) => h.id !== id);
      data.urges = data.urges.map((u) => (u.habitId === id ? { ...u, habitId: null } : u));
      data.journal = data.journal.map((j) => (j.habitId === id ? { ...j, habitId: null } : j));
      save();
    },

    /** スリップを記録し、連続記録をリセットする */
    recordRelapse(id, { at, trigger = '', note = '' } = {}) {
      const habit = findHabit(id);
      if (!habit) return null;
      const now = clock();
      let t = Number.isFinite(at) ? at : now;
      t = Math.min(Math.max(t, habit.startedAt), now);
      habit.history.push({ start: habit.startedAt, end: t });
      habit.relapses.push({ at: t, trigger, note });
      habit.startedAt = t;
      habit.celebrated = reachedMilestoneDays(now - t);
      save();
      return habit;
    },

    markCelebrated(id, days) {
      const habit = findHabit(id);
      if (!habit) return;
      habit.celebrated = Math.max(habit.celebrated, days);
      save();
    },

    checkin(key = dateKey(new Date(clock()))) {
      return data.checkins[key] || null;
    },

    pledge(key = dateKey(new Date(clock()))) {
      const c = data.checkins[key] || { pledgedAt: null, reviewedAt: null, result: null };
      c.pledgedAt = c.pledgedAt || clock();
      data.checkins[key] = c;
      save();
      return c;
    },

    review(result, key = dateKey(new Date(clock()))) {
      const c = data.checkins[key] || { pledgedAt: null, reviewedAt: null, result: null };
      c.reviewedAt = clock();
      c.result = result === 'slip' ? 'slip' : 'clean';
      data.checkins[key] = c;
      save();
      return c;
    },

    addUrge({ habitId = null, intensity = 3, trigger = '', outcome = 'resisted' }) {
      const urge = {
        id: uid('u'),
        at: clock(),
        habitId,
        intensity: Math.min(5, Math.max(1, Number(intensity) || 3)),
        trigger,
        outcome: outcome === 'gave_in' ? 'gave_in' : 'resisted',
      };
      data.urges.push(urge);
      save();
      return urge;
    },

    addJournal({ mood = 3, text = '', habitId = null, at }) {
      const entry = {
        id: uid('j'),
        at: Number.isFinite(at) ? at : clock(),
        mood: Math.min(5, Math.max(1, Number(mood) || 3)),
        text: String(text).trim(),
        habitId: habitId || null,
      };
      data.journal.push(entry);
      save();
      return entry;
    },

    deleteJournal(id) {
      data.journal = data.journal.filter((j) => j.id !== id);
      save();
    },

    updateSettings(patch) {
      data.settings = normalize({ ...data, settings: { ...data.settings, ...patch } }, clock()).settings;
      save();
      return data.settings;
    },

    exportJSON() {
      return JSON.stringify({ app: 'yamelog', exportedAt: new Date(clock()).toISOString(), ...data }, null, 2);
    },

    /** バックアップ JSON を読み込んで置き換える。不正なら例外 */
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.habits)) {
        throw new Error('やめログのバックアップファイルではありません');
      }
      data = normalize(parsed, clock());
      data.settings.onboarded = data.settings.onboarded || data.habits.length > 0;
      save();
      return data;
    },

    resetAll() {
      data = emptyData();
      try { storage?.removeItem(STORAGE_KEY); } catch { /* noop */ }
      return data;
    },
  };
}
