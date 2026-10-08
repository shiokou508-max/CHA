import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS, splitDuration, milestoneProgress, reachedMilestoneDays, moneySaved, minutesRegained,
  longestStreakMs, totalCleanMs, pledgeStreak, dayStatus, monthGrid, triggerRanking,
  formatMinutes, formatMoney, formatDaysLong, addDays, dateKey,
} from '../js/logic.js';

test('splitDuration: 日・時・分・秒に分解する', () => {
  const ms = 3 * MS.day + 4 * MS.hour + 5 * MS.min + 6 * MS.sec + 999;
  assert.deepEqual(splitDuration(ms), { days: 3, hours: 4, minutes: 5, seconds: 6 });
  assert.deepEqual(splitDuration(-100), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test('milestoneProgress: 直前・次の目標と進捗率', () => {
  const start = milestoneProgress(0);
  assert.equal(start.prev, null);
  assert.equal(start.next.days, 1);
  assert.equal(start.ratio, 0);

  const p = milestoneProgress(5 * MS.day); // 3日 → 7日の間
  assert.equal(p.prev.days, 3);
  assert.equal(p.next.days, 7);
  assert.equal(p.ratio, 0.5);
  assert.equal(p.remainingMs, 2 * MS.day);

  const end = milestoneProgress(4000 * MS.day);
  assert.equal(end.next, null);
  assert.equal(end.ratio, 1);
});

test('reachedMilestoneDays: 到達済みの最大マイルストーン', () => {
  assert.equal(reachedMilestoneDays(0), 0);
  assert.equal(reachedMilestoneDays(MS.day), 1);
  assert.equal(reachedMilestoneDays(45 * MS.day), 30);
});

test('節約額・取り戻した時間は経過日数に比例する', () => {
  const now = 10 * MS.day;
  const habit = { startedAt: 0, costPerDay: 500, minutesPerDay: 60 };
  assert.equal(moneySaved(habit, now), 5000);
  assert.equal(minutesRegained(habit, now), 600);
  assert.equal(moneySaved({ startedAt: 0 }, now), 0);
});

test('最長記録・累計クリーン時間に履歴を含める', () => {
  const now = 100 * MS.day;
  const habit = {
    startedAt: 90 * MS.day,
    history: [{ start: 0, end: 30 * MS.day }, { start: 30 * MS.day, end: 90 * MS.day }],
  };
  assert.equal(longestStreakMs(habit, now), 60 * MS.day);
  assert.equal(totalCleanMs(habit, now), 100 * MS.day);
});

test('pledgeStreak: 今日未誓いでも昨日まで続いていれば継続扱い', () => {
  const today = '2026-10-08';
  const c = (k) => [k, { pledgedAt: 1 }];
  const checkins = Object.fromEntries([c('2026-10-07'), c('2026-10-06'), c('2026-10-04')]);
  assert.equal(pledgeStreak(checkins, today), 2);
  checkins[today] = { pledgedAt: 1 };
  assert.equal(pledgeStreak(checkins, today), 3);
  assert.equal(pledgeStreak({}, today), 0);
});

test('addDays: 月末・年末をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('dayStatus: クリーン日・スリップ日・開始日を判定する', () => {
  const d = (key, h = 0) => new Date(`${key}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const habit = {
    startedAt: d('2026-10-05', 21),
    history: [{ start: d('2026-10-01', 9), end: d('2026-10-05', 21) }],
    relapses: [{ at: d('2026-10-05', 21) }],
  };
  const now = d('2026-10-08', 12);
  assert.equal(dayStatus(habit, '2026-09-30', now), null);
  assert.equal(dayStatus(habit, '2026-10-01', now), 'partial');
  assert.equal(dayStatus(habit, '2026-10-03', now), 'clean');
  assert.equal(dayStatus(habit, '2026-10-05', now), 'relapse');
  assert.equal(dayStatus(habit, '2026-10-06', now), 'clean');
  assert.equal(dayStatus(habit, '2026-10-08', now), 'clean'); // 今日は「今まで」クリーンなら clean
  assert.equal(dayStatus(habit, '2026-10-09', now), null); // 未来
});

test('monthGrid: 日曜始まりで7の倍数のセル', () => {
  const cells = monthGrid(2026, 9); // 2026年10月（1日は木曜）
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.indexOf('2026-10-01'), 4);
  assert.equal(cells.filter(Boolean).length, 31);
});

test('triggerRanking: 多い順に集計', () => {
  const ranking = triggerRanking(
    [{ trigger: '退屈' }, { trigger: 'ストレス' }, { trigger: 'ストレス' }, { trigger: '' }],
    [{ trigger: '退屈' }, { trigger: 'ストレス' }],
  );
  assert.deepEqual(ranking, [{ trigger: 'ストレス', count: 3 }, { trigger: '退屈', count: 2 }]);
});

test('フォーマット関数', () => {
  assert.equal(formatMoney(12345.9), '¥12,345');
  assert.equal(formatMoney(100, '$'), '$100');
  assert.equal(formatMinutes(45), '45分');
  assert.equal(formatMinutes(125), '2時間 5分');
  assert.equal(formatMinutes(60 * 24 * 3 + 120), '3日 2時間');
  assert.equal(formatDaysLong(10), '');
  assert.equal(formatDaysLong(400), '1年 1か月');
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
});
