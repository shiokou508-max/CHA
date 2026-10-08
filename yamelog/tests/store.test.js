import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, normalize, STORAGE_KEY } from '../js/store.js';
import { MS } from '../js/logic.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

function clockAt(t) {
  const clock = () => clock.now;
  clock.now = t;
  return clock;
}

test('習慣を追加すると保存され、再読み込みしても残る', () => {
  const storage = memoryStorage();
  const clock = clockAt(100 * MS.day);
  const store = createStore(storage, clock);
  const habit = store.addHabit({ name: 'お酒', emoji: '🍺', startedAt: 90 * MS.day, costPerDay: 800, reasons: ['健康', ' '] });
  assert.equal(habit.reasons.length, 1);
  assert.equal(store.settings.onboarded, true);
  // 過去日付で登録 → 到達済み(7日)はお祝い済みにする
  assert.equal(habit.celebrated, 7);

  const again = createStore(storage, clock);
  assert.equal(again.habits.length, 1);
  assert.equal(again.habits[0].name, 'お酒');
});

test('未来の開始日時は現在時刻に丸める', () => {
  const clock = clockAt(10 * MS.day);
  const store = createStore(memoryStorage(), clock);
  const habit = store.addHabit({ name: 'x', startedAt: 20 * MS.day });
  assert.equal(habit.startedAt, 10 * MS.day);
});

test('スリップを記録すると履歴に残り、カウンターがリセットされる', () => {
  const clock = clockAt(50 * MS.day);
  const store = createStore(memoryStorage(), clock);
  const habit = store.addHabit({ name: 'タバコ', startedAt: 10 * MS.day });
  store.recordRelapse(habit.id, { at: 40 * MS.day, trigger: 'ストレス', note: '飲み会' });
  assert.equal(habit.startedAt, 40 * MS.day);
  assert.deepEqual(habit.history, [{ start: 10 * MS.day, end: 40 * MS.day }]);
  assert.equal(habit.relapses[0].trigger, 'ストレス');
  assert.equal(habit.celebrated, 7); // 40日目→50日目で 7日 まで到達済み

  // 開始より前のスリップ時刻は開始時刻に丸める
  store.recordRelapse(habit.id, { at: 0 });
  assert.equal(habit.startedAt, 40 * MS.day);
});

test('編集で開始日時を最後のスリップより前にはできない', () => {
  const clock = clockAt(50 * MS.day);
  const store = createStore(memoryStorage(), clock);
  const habit = store.addHabit({ name: 'SNS', startedAt: 10 * MS.day });
  store.recordRelapse(habit.id, { at: 30 * MS.day });
  store.updateHabit(habit.id, { startedAt: 5 * MS.day, name: 'SNS断ち' });
  assert.equal(habit.startedAt, 30 * MS.day);
  assert.equal(habit.name, 'SNS断ち');
  assert.equal(habit.history.length, 1);
});

test('誓いと振り返り', () => {
  const clock = clockAt(new Date(2026, 9, 8, 8).getTime());
  const store = createStore(memoryStorage(), clock);
  store.pledge();
  const first = store.checkin().pledgedAt;
  clock.now += MS.hour;
  store.pledge(); // 二重に誓っても最初の時刻を保持
  assert.equal(store.checkin().pledgedAt, first);
  store.review('clean');
  assert.equal(store.checkin().result, 'clean');
  assert.ok(store.data.checkins['2026-10-08']);
});

test('衝動と日記の記録・削除、習慣削除時のひも付け解除', () => {
  const store = createStore(memoryStorage(), clockAt(10 * MS.day));
  const habit = store.addHabit({ name: 'ゲーム' });
  store.addUrge({ habitId: habit.id, intensity: 9, trigger: '退屈' });
  const entry = store.addJournal({ mood: 5, text: ' がんばった ', habitId: habit.id });
  assert.equal(store.data.urges[0].intensity, 5);
  assert.equal(entry.text, 'がんばった');
  store.deleteHabit(habit.id);
  assert.equal(store.data.urges[0].habitId, null);
  assert.equal(store.data.journal[0].habitId, null);
  store.deleteJournal(entry.id);
  assert.equal(store.data.journal.length, 0);
});

test('書き出し → 全削除 → 読み込みで復元できる', () => {
  const storage = memoryStorage();
  const store = createStore(storage, clockAt(10 * MS.day));
  store.addHabit({ name: '甘いもの', costPerDay: 300 });
  store.addJournal({ text: 'メモ' });
  const backup = store.exportJSON();
  store.resetAll();
  assert.equal(store.habits.length, 0);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  store.importJSON(backup);
  assert.equal(store.habits[0].name, '甘いもの');
  assert.equal(store.data.journal.length, 1);
  assert.equal(store.settings.onboarded, true);
  assert.throws(() => store.importJSON('{"foo":1}'));
  assert.throws(() => store.importJSON('not json'));
});

test('壊れたデータでも落ちずに既定値で補完する', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{broken' });
  const store = createStore(storage, clockAt(0));
  assert.deepEqual(store.habits, []);

  const n = normalize({
    settings: { theme: 'neon', currency: 123 },
    habits: [{ name: 'a', costPerDay: '-5', history: [{ start: 5, end: 1 }, { start: 1, end: 5 }] }, null],
    checkins: { bad: {}, '2026-10-08': { pledgedAt: 1, result: 'weird' } },
    urges: [{ at: 1, intensity: 0 }],
  }, 100);
  assert.equal(n.settings.theme, 'auto');
  assert.equal(n.settings.currency, '¥');
  assert.equal(n.habits.length, 1);
  assert.equal(n.habits[0].costPerDay, 0);
  assert.equal(n.habits[0].history.length, 1);
  assert.deepEqual(Object.keys(n.checkins), ['2026-10-08']);
  assert.equal(n.checkins['2026-10-08'].result, null);
  assert.equal(n.urges[0].intensity, 1);
});
