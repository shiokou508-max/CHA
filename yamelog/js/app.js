/* ============================
   やめログ — アプリ本体（ルーター・画面描画・イベント）
   ============================ */

import * as L from './logic.js';
import * as P from './presets.js';
import { createStore } from './store.js';

const APP_VERSION = '1.0.0';

/* ---------- 初期化 ---------- */

function safeStorage() {
  try {
    const k = '__yamelog_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null; // プライベートモード等。メモリ上だけで動かす
  }
}

const store = createStore(safeStorage());
const $app = document.getElementById('app');
const $view = document.getElementById('view');
const $tabbar = document.getElementById('tabbar');
const $sheet = document.getElementById('sheet');
const $backdrop = document.getElementById('sheet-backdrop');
const $toast = document.getElementById('toast');

/* ---------- 小さなヘルパー ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const cur = () => store.settings.currency;
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};

function formatDayJa(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日（${DOW[date.getDay()]}）`;
}

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 4) return 'こんばんは';
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'こんばんは';
}

/** ライブ更新される値（毎秒） */
function liveValues(habit, now = Date.now()) {
  const ms = L.elapsedMs(habit, now);
  const d = L.splitDuration(ms);
  const mp = L.milestoneProgress(ms);
  let remain = '🎉 すべて達成';
  if (mp.next) remain = mp.remainingMs < L.MS.min ? 'まもなく！' : `あと ${L.formatShortDuration(mp.remainingMs)}`;
  return {
    days: String(d.days),
    hms: `${d.hours}時間 ${pad(d.minutes)}分 ${pad(d.seconds)}秒`,
    h: pad(d.hours),
    m: pad(d.minutes),
    s: pad(d.seconds),
    money: L.formatMoney(L.moneySaved(habit, now), cur()),
    time: L.formatMinutes(L.minutesRegained(habit, now)),
    next: mp.next ? `次の目標: ${mp.next.label}` : '全マイルストーン達成',
    remain,
    longest: L.formatShortDuration(L.longestStreakMs(habit, now)),
    total: L.formatShortDuration(L.totalCleanMs(habit, now)),
    ratio: mp.ratio,
  };
}

const live = (id, key) => `data-live="${esc(id)}" data-k="${key}"`;

/* ---------- テーマ ---------- */

function applyTheme() {
  const t = store.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (t === 'auto') {
        m.setAttribute('content', m.media.includes('dark') ? '#0e1615' : '#f4f7f6');
      } else {
        m.setAttribute('content', bg);
      }
    });
  });
}

/* ---------- トースト ---------- */

let toastTimer = null;
function toast(message, { action, onAction, duration = 2800 } = {}) {
  clearTimeout(toastTimer);
  $toast.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  $toast.hidden = false;
  if (action) {
    $toast.querySelector('button').onclick = () => { $toast.hidden = true; onAction?.(); };
  }
  if (duration) toastTimer = setTimeout(() => { $toast.hidden = true; }, duration);
}

/* ---------- ボトムシート ---------- */

let sheetCtx = null; // { onClose, returnFocus }
let picks = {}; // シート・画面内の単一選択チップの状態

function openSheet(html, { onClose, label = '' } = {}) {
  if (sheetCtx) closeSheet(true);
  sheetCtx = { onClose, returnFocus: document.activeElement };
  $sheet.innerHTML = `<div class="grabber" aria-hidden="true"></div>${html}`;
  $sheet.setAttribute('aria-label', label);
  $sheet.hidden = false;
  $backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  // シート自体にフォーカス（スマホで入力欄に当ててキーボードが勝手に開かないように）
  $sheet.focus({ preventScroll: true });
}

function closeSheet(silent = false) {
  if (!sheetCtx) return;
  const ctx = sheetCtx;
  sheetCtx = null;
  $sheet.hidden = true;
  $backdrop.hidden = true;
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
  if (!silent) ctx.onClose?.();
  ctx.returnFocus?.focus?.({ preventScroll: true });
}

function confirmSheet({ title, message = '', ok = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet(`
      <h2>${esc(title)}</h2>
      ${message ? `<p class="lead">${esc(message)}</p>` : ''}
      <div class="btn-row">
        <button type="button" class="btn btn-lg" data-action="confirm-no">キャンセル</button>
        <button type="button" class="btn btn-lg ${danger ? 'btn-solid-danger' : 'btn-primary'}" data-action="confirm-yes">${esc(ok)}</button>
      </div>`, { label: title, onClose: () => { if (!answered) resolve(false); } });
    actions['confirm-yes'] = () => { answered = true; closeSheet(true); resolve(true); };
    actions['confirm-no'] = () => { answered = true; closeSheet(true); resolve(false); };
  });
}

/* ---------- ルーター ---------- */

const routes = [
  [/^\/$/, viewHome],
  [/^\/welcome$/, viewWelcome],
  [/^\/new$/, viewEditor],
  [/^\/edit\/([\w-]+)$/, viewEditor],
  [/^\/habit\/([\w-]+)$/, viewHabit],
  [/^\/sos$/, viewSOS],
  [/^\/records$/, viewRecords],
  [/^\/journal$/, viewJournal],
  [/^\/settings$/, viewSettings],
];

let current = { path: '', view: null, cleanup: null };

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function go(path, { replace = false } = {}) {
  const hash = `#${path}`;
  if (location.hash === hash) render();
  else if (replace) { history.replaceState(null, '', hash); render(); }
  else location.hash = hash;
}

function render({ keepScroll = false } = {}) {
  const path = currentPath();
  if (!store.settings.onboarded && store.habits.length === 0 && !['/welcome', '/new'].includes(path)) {
    go('/welcome', { replace: true });
    return;
  }
  let match = null;
  let viewFn = null;
  for (const [re, fn] of routes) {
    match = path.match(re);
    if (match) { viewFn = fn; break; }
  }
  if (!viewFn) { go('/', { replace: true }); return; }

  const samePage = current.path === path;
  if (!samePage) {
    if (sheetCtx) closeSheet(true);
    draft = null; // 登録画面に入り直したら下書きを作り直す
  }
  const out = viewFn(...match.slice(1));
  if (!out) return; // ビュー内でリダイレクト済み
  current.cleanup?.();
  current.cleanup = null;
  current.path = path;
  current.view = viewFn;

  $view.classList.toggle('no-anim', samePage);
  $view.innerHTML = out.html;
  $app.classList.toggle('no-chrome', Boolean(out.noChrome));
  $tabbar.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === out.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (!samePage && !keepScroll) {
    window.scrollTo(0, 0);
    $view.focus({ preventScroll: true });
  }
  if (out.mount) {
    const cleanup = out.mount();
    if (typeof cleanup === 'function') current.cleanup = cleanup;
  }
  tick();
}

/** 同じ画面を再描画（スクロール位置を保つ） */
function rerender() {
  const y = window.scrollY;
  render({ keepScroll: true });
  window.scrollTo(0, y);
}

/* ---------- 毎秒の更新 ---------- */

let lastDayKey = L.dateKey();

function tick() {
  const now = Date.now();
  const cache = new Map();
  const values = (id) => {
    if (!cache.has(id)) {
      const habit = store.findHabit(id);
      cache.set(id, habit ? liveValues(habit, now) : null);
    }
    return cache.get(id);
  };
  document.querySelectorAll('[data-live]').forEach((el) => {
    const v = values(el.dataset.live);
    if (!v) return;
    const text = v[el.dataset.k];
    if (el.textContent !== text) el.textContent = text;
  });
  document.querySelectorAll('[data-live-bar]').forEach((el) => {
    const v = values(el.dataset.liveBar);
    if (v) el.style.width = `${(v.ratio * 100).toFixed(2)}%`;
  });
  document.querySelectorAll('[data-live-ring]').forEach((el) => {
    const v = values(el.dataset.liveRing);
    const c = Number(el.dataset.c);
    if (v) el.style.strokeDashoffset = String(c * (1 - v.ratio));
  });

  // 日付が変わったらホームを描き直す（誓いカードの更新）
  const key = L.dateKey();
  if (key !== lastDayKey) {
    lastDayKey = key;
    if (current.view === viewHome) rerender();
  }
  checkMilestones(now);
}

/** 新しく到達したマイルストーンをお祝いする */
function checkMilestones(now) {
  if (sheetCtx || [viewEditor, viewWelcome, viewSOS].includes(current.view)) return;
  for (const habit of store.habits) {
    const reached = L.reachedMilestoneDays(L.elapsedMs(habit, now));
    if (reached > habit.celebrated) {
      showCelebration(habit, reached);
      return;
    }
  }
}

/* =====================================================
   画面: ようこそ
   ===================================================== */

function viewWelcome() {
  return {
    noChrome: true,
    html: `
      <section class="welcome">
        <img class="logo" src="icons/icon.svg" alt="">
        <h1>やめログ</h1>
        <p class="tagline">やめたい習慣を、今日もやめている。</p>
        <ul class="feature-list">
          <li><b>⏱️</b><div><strong>やめてからの時間を数える</strong><span>秒単位のカウンターと、節約できたお金・時間</span></div></li>
          <li><b>🤝</b><div><strong>毎日の誓いと振り返り</strong><span>朝に誓って、夜に振り返る。一日ずつ積み重ねる</span></div></li>
          <li><b>🆘</b><div><strong>つらい時のSOS</strong><span>呼吸ガイドと「やめる理由」で衝動の波を乗り越える</span></div></li>
          <li><b>🔒</b><div><strong>データは端末の中だけ</strong><span>登録不要。誰にも知られずに始められます</span></div></li>
        </ul>
        <a class="btn btn-primary btn-lg btn-block" href="#/new">はじめる</a>
        <button type="button" class="btn btn-ghost btn-block" data-action="import" style="margin-top:8px">バックアップから復元する</button>
      </section>`,
  };
}

/* =====================================================
   画面: ホーム
   ===================================================== */

function pledgeCardHtml() {
  if (store.habits.length === 0) return '';
  const c = store.checkin();
  const streak = L.pledgeStreak(store.data.checkins);
  const names = store.habits.map((h) => h.name);
  const target = names.length > 3 ? `${names.slice(0, 3).join('・')} など` : names.join('・');
  const evening = new Date().getHours() >= 17;

  if (c?.reviewedAt) {
    const clean = c.result === 'clean';
    return `
      <section class="card pledge-card done">
        <div class="emoji" aria-hidden="true">${clean ? '🌟' : '🌱'}</div>
        <div class="grow">
          <h2>${clean ? '今日もやめられました！' : '今日の振り返りを記録しました'}</h2>
          <p>${clean ? `誓いは${streak}日連続です。ゆっくり休んでね。` : '明日はまた新しい一日。ここからまた始めよう。'}</p>
        </div>
      </section>`;
  }
  if (!c?.pledgedAt) {
    return `
      <section class="card pledge-card" style="display:block">
        <div style="display:flex;gap:14px;align-items:center">
          <div class="emoji" aria-hidden="true">🤝</div>
          <div class="grow">
            <h2>今日の誓い</h2>
            <p>今日も「${esc(target)}」をやめます。${streak ? `（${streak}日連続中）` : ''}</p>
          </div>
        </div>
        <div class="pledge-actions"><button type="button" class="btn btn-primary btn-lg" data-action="pledge">今日もやめると誓う</button></div>
      </section>`;
  }
  if (evening) {
    return `
      <section class="card pledge-card" style="display:block">
        <div style="display:flex;gap:14px;align-items:center">
          <div class="emoji" aria-hidden="true">🌙</div>
          <div class="grow">
            <h2>今日の振り返り</h2>
            <p>今日はやめられましたか？ 正直に記録しよう。</p>
          </div>
        </div>
        <div class="pledge-actions">
          <button type="button" class="btn btn-danger" data-action="review-slip">スリップした</button>
          <button type="button" class="btn btn-primary" data-action="review-clean">やめられた！</button>
        </div>
      </section>`;
  }
  return `
    <section class="card pledge-card done">
      <div class="emoji" aria-hidden="true">✅</div>
      <div class="grow">
        <h2>今日の誓いを立てました</h2>
        <p>誓い ${streak}日連続。夜に今日を振り返りましょう。</p>
      </div>
      <button type="button" class="btn btn-sm" data-action="review-open">振り返る</button>
    </section>`;
}

function habitCardHtml(habit) {
  const v = liveValues(habit);
  const chips = [];
  if (habit.costPerDay > 0) chips.push(`<span class="pill">💰 <span ${live(habit.id, 'money')}>${esc(v.money)}</span></span>`);
  if (habit.minutesPerDay > 0) chips.push(`<span class="pill">⏳ <span ${live(habit.id, 'time')}>${esc(v.time)}</span></span>`);
  return `
    <a class="card habit-card" href="#/habit/${esc(habit.id)}" style="--habit-color:${esc(habit.color)}">
      <div class="habit-top">
        <div class="habit-emoji" aria-hidden="true">${esc(habit.emoji)}</div>
        <div class="grow">
          <div class="habit-name">${esc(habit.name)}をやめて</div>
          <div class="habit-sub">${esc(L.formatDateTime(habit.startedAt))} から</div>
        </div>
        ${ICON.chev}
      </div>
      <div class="counter-row">
        <span class="counter-days" ${live(habit.id, 'days')}>${v.days}</span><span class="counter-unit">日</span>
        <span class="counter-hms" ${live(habit.id, 'hms')}>${v.hms}</span>
      </div>
      <div class="progress" aria-hidden="true"><i data-live-bar="${esc(habit.id)}"></i></div>
      <div class="progress-label"><span ${live(habit.id, 'next')}>${esc(v.next)}</span><span ${live(habit.id, 'remain')}>${esc(v.remain)}</span></div>
      ${chips.length ? `<div class="chips-row">${chips.join('')}</div>` : ''}
    </a>`;
}

let installPrompt = null;

function viewHome() {
  const now = new Date();
  const habits = store.habits;
  const installBanner = installPrompt && !isStandalone() ? `
    <section class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="font-size:28px" aria-hidden="true">📲</div>
      <div class="grow small" style="flex:1"><strong>ホーム画面に追加</strong><br><span class="muted">アプリのようにすぐ開けます</span></div>
      <button type="button" class="btn btn-sm btn-primary" data-action="install">追加</button>
    </section>` : '';

  return {
    tab: 'home',
    html: `
      <header class="page-head">
        <div class="grow">
          <p class="sub">${formatDayJa(now)}</p>
          <h1>${greeting(now)}</h1>
        </div>
        <a class="icon-btn" href="#/new" aria-label="やめる習慣を追加">${ICON.plus}</a>
      </header>
      <p class="daily-msg">${esc(P.pickByDay(P.DAILY_MESSAGES, now))}</p>
      ${installBanner}
      ${pledgeCardHtml()}
      ${habits.length ? habits.map(habitCardHtml).join('') : `
        <div class="card empty"><b>🌱</b>やめたい習慣を登録して、今日から数えはじめましょう。</div>`}
      <a class="add-habit" href="#/new"><span aria-hidden="true">＋</span> やめる習慣を追加</a>`,
  };
}

/* =====================================================
   画面: 習慣の詳細
   ===================================================== */

function viewHabit(id) {
  const habit = store.findHabit(id);
  if (!habit) { go('/', { replace: true }); return null; }
  const v = liveValues(habit);
  const C = 2 * Math.PI * 100;
  const reachedDays = L.reachedMilestoneDays(L.elapsedMs(habit));
  const nextMs = L.milestoneProgress(L.elapsedMs(habit)).next;
  const resisted = store.data.urges.filter((u) => u.habitId === id && u.outcome === 'resisted').length;
  const daysLong = L.formatDaysLong(Number(v.days));

  const milestones = L.MILESTONES.map((m) => {
    const done = m.days <= reachedDays;
    const isNext = nextMs && nextMs.days === m.days;
    const short = m.days >= 365 && m.days % 365 === 0 ? `${m.days / 365}年` : `${m.days}`;
    return `
      <div class="medal ${L.milestoneTier(m.days)} ${done ? 'done' : ''} ${isNext ? 'next' : ''}" aria-label="${esc(m.label)}${done ? ' 達成' : ''}">
        <div class="badge">${esc(short)}</div>
        <span>${esc(m.label)}</span>
      </div>`;
  }).join('');

  const periods = [...habit.history].reverse();
  const historyHtml = `
    <ul class="list">
      <li>
        <div class="grow"><div><strong>現在の記録</strong></div><div class="meta">${esc(L.formatDateTime(habit.startedAt))} 〜</div></div>
        <div class="val"><span ${live(habit.id, 'days')}>${v.days}</span>日</div>
      </li>
      ${periods.map((p) => `
        <li>
          <div class="grow"><div>${esc(L.formatDate(p.start))} 〜 ${esc(L.formatDate(p.end))}</div><div class="meta">${esc(relapseNote(habit, p.end))}</div></div>
          <div class="val">${esc(L.formatShortDuration(p.end - p.start))}</div>
        </li>`).join('')}
    </ul>`;

  return {
    tab: 'home',
    html: `
      <header class="page-head">
        <a class="icon-btn" href="#/" aria-label="ホームに戻る">${ICON.back}</a>
        <div class="grow"><h1 style="font-size:21px">${esc(habit.emoji)} ${esc(habit.name)}</h1></div>
        <a class="icon-btn" href="#/edit/${esc(habit.id)}" aria-label="編集">${ICON.edit}</a>
      </header>

      <section class="card hero" style="--habit-color:${esc(habit.color)}">
        <div class="ring-wrap">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle class="ring-bg" cx="110" cy="110" r="100"/>
            <circle class="ring-fg" cx="110" cy="110" r="100" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v.ratio)}" data-live-ring="${esc(habit.id)}" data-c="${C}"/>
          </svg>
          <div class="ring-center">
            <span class="counter-days" ${live(habit.id, 'days')}>${v.days}</span>
            <span class="label">日${daysLong ? `（${esc(daysLong)}）` : ''}</span>
          </div>
        </div>
        <div class="hms-grid" role="timer" aria-label="経過時間">
          <div><b ${live(habit.id, 'h')}>${v.h}</b><span>時間</span></div>
          <div><b ${live(habit.id, 'm')}>${v.m}</b><span>分</span></div>
          <div><b ${live(habit.id, 's')}>${v.s}</b><span>秒</span></div>
        </div>
        <p class="since">${esc(L.formatDateTime(habit.startedAt))} からやめています</p>
        <p class="next"><span ${live(habit.id, 'next')}>${esc(v.next)}</span>・<span ${live(habit.id, 'remain')}>${esc(v.remain)}</span></p>
      </section>

      <h2 class="section-title">これまでの成果</h2>
      <div class="stat-grid">
        <div class="stat"><div class="k">💰 節約できたお金</div><div class="v" ${live(habit.id, 'money')}>${esc(v.money)}</div></div>
        <div class="stat"><div class="k">⏳ 取り戻した時間</div><div class="v" ${live(habit.id, 'time')}>${esc(v.time)}</div></div>
        <div class="stat"><div class="k">🏆 最長記録</div><div class="v" ${live(habit.id, 'longest')}>${esc(v.longest)}</div></div>
        <div class="stat"><div class="k">🌿 累計クリーン</div><div class="v" ${live(habit.id, 'total')}>${esc(v.total)}</div></div>
        <div class="stat"><div class="k">🔁 スリップ</div><div class="v">${habit.relapses.length}<small> 回</small></div></div>
        <div class="stat"><div class="k">🛡️ 乗り越えた衝動</div><div class="v">${resisted}<small> 回</small></div></div>
      </div>
      ${habit.costPerDay === 0 && habit.minutesPerDay === 0 ? `<p class="small muted" style="margin:8px 2px 0">1日あたりの費用や時間を<a href="#/edit/${esc(habit.id)}">設定</a>すると、節約額が表示されます。</p>` : ''}

      <h2 class="section-title">やめる理由</h2>
      <section class="card reasons-card">
        ${habit.reasons.length
          ? `<ol>${habit.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`
          : `<p class="muted small" style="margin:0">理由を書いておくと、つらい時の支えになります。<a href="#/edit/${esc(habit.id)}">理由を追加</a></p>`}
      </section>

      <h2 class="section-title">マイルストーン <small>${L.MILESTONES.filter((m) => m.days <= reachedDays).length} / ${L.MILESTONES.length}</small></h2>
      <div class="milestones">${milestones}</div>

      <h2 class="section-title">記録の履歴</h2>
      <section class="card" style="padding-top:4px;padding-bottom:4px">${historyHtml}</section>

      <div class="stack" style="margin-top:24px">
        <button type="button" class="btn btn-danger btn-block btn-lg" data-action="relapse" data-id="${esc(habit.id)}">スリップを記録する</button>
        <p class="small muted center" style="margin:6px 0 0">記録するとカウンターがリセットされます。これまでの記録は履歴に残ります。</p>
      </div>`,
  };
}

function relapseNote(habit, at) {
  const r = habit.relapses.find((x) => x.at === at);
  if (!r) return '';
  return [r.trigger && `きっかけ: ${r.trigger}`, r.note].filter(Boolean).join(' / ');
}

/* =====================================================
   画面: 習慣の登録・編集
   ===================================================== */

let draft = null;

function newDraft(habit) {
  if (habit) {
    return {
      id: habit.id,
      preset: null,
      name: habit.name,
      emoji: habit.emoji,
      color: habit.color,
      startedAt: L.toDateTimeLocal(habit.startedAt),
      startedAtInitial: L.toDateTimeLocal(habit.startedAt),
      costPerDay: habit.costPerDay || '',
      minutesPerDay: habit.minutesPerDay || '',
      reasons: [...habit.reasons],
    };
  }
  return {
    id: null, preset: null, name: '', emoji: '✨', color: P.HABIT_COLORS[0],
    startedAt: L.toDateTimeLocal(Date.now()), startedAtInitial: null,
    costPerDay: '', minutesPerDay: '', reasons: [],
  };
}

function viewEditor(id) {
  const habit = id ? store.findHabit(id) : null;
  if (id && !habit) { go('/', { replace: true }); return null; }
  const draftKey = id || 'new';
  if (!draft || draft.key !== draftKey) draft = { ...newDraft(habit), key: draftKey };

  const isNew = !habit;
  const minStart = habit ? store.lastBreak(habit) : -Infinity;
  const backHref = isNew ? (store.habits.length ? '#/' : '#/welcome') : `#/habit/${esc(habit.id)}`;

  const presetHtml = isNew ? `
    <div class="field">
      <span class="label">何をやめますか？</span>
      <div class="preset-grid">
        ${P.HABIT_PRESETS.map((p, i) => `
          <button type="button" class="preset" data-action="preset" data-i="${i}" aria-pressed="${draft.preset === i}">
            <b aria-hidden="true">${p.emoji}</b>${esc(p.name)}
          </button>`).join('')}
      </div>
    </div>` : '';

  return {
    noChrome: true,
    html: `
      <header class="page-head">
        <a class="icon-btn" href="${backHref}" aria-label="戻る">${ICON.close}</a>
        <div class="grow"><h1 style="font-size:21px">${isNew ? 'やめる習慣を登録' : '習慣を編集'}</h1></div>
      </header>

      <form id="habit-form" novalidate>
        ${presetHtml}

        <label class="field">
          <span class="label">名前</span>
          <input class="input" name="name" data-field="name" value="${esc(draft.name)}" maxlength="40" placeholder="例: お酒、タバコ、深夜のスマホ" required autocomplete="off">
        </label>

        <div class="field">
          <span class="label">アイコン</span>
          <div class="emoji-grid">
            ${P.EMOJI_CHOICES.map((e) => `<button type="button" class="emoji-opt" data-action="emoji" data-v="${e}" aria-pressed="${draft.emoji === e}" aria-label="${e}">${e}</button>`).join('')}
          </div>
        </div>

        <div class="field">
          <span class="label">カラー</span>
          <div class="color-row">
            ${P.HABIT_COLORS.map((c) => `<button type="button" class="color-opt" data-action="color" data-v="${c}" aria-pressed="${draft.color === c}" style="background:${c}" aria-label="色 ${c}"></button>`).join('')}
          </div>
        </div>

        <label class="field">
          <span class="label">やめた日時</span>
          <input class="input" type="datetime-local" data-field="startedAt" value="${esc(draft.startedAt)}" max="${L.toDateTimeLocal(Date.now())}" ${Number.isFinite(minStart) ? `min="${L.toDateTimeLocal(minStart)}"` : ''} required>
          <span class="hint">すでにやめている場合は、過去の日時を設定できます。</span>
        </label>

        <label class="field">
          <span class="label">1日あたりの費用</span>
          <span class="input-affix"><span>${esc(cur())}</span><input class="input" type="number" inputmode="decimal" min="0" step="any" data-field="costPerDay" value="${esc(draft.costPerDay)}" placeholder="0"><span>/ 日</span></span>
          <span class="hint">節約できたお金の計算に使います（目安でOK）。</span>
        </label>

        <label class="field">
          <span class="label">1日あたりに使っていた時間</span>
          <span class="input-affix"><input class="input" type="number" inputmode="numeric" min="0" max="1440" step="1" data-field="minutesPerDay" value="${esc(draft.minutesPerDay)}" placeholder="0"><span>分 / 日</span></span>
        </label>

        <div class="field">
          <span class="label">やめる理由</span>
          ${draft.reasons.length ? `<ul class="reason-list">${draft.reasons.map((r, i) => `<li><span>${esc(r)}</span><button type="button" data-action="reason-del" data-i="${i}" aria-label="「${esc(r)}」を削除">×</button></li>`).join('')}</ul>` : ''}
          <div class="input-affix">
            <input class="input" id="reason-input" maxlength="80" placeholder="例: 朝をすっきり迎えたい" autocomplete="off" enterkeyhint="done">
            <button type="button" class="btn" data-action="reason-add">追加</button>
          </div>
          <div class="chip-group" style="margin-top:10px">
            ${P.REASON_EXAMPLES.filter((r) => !draft.reasons.includes(r)).map((r) => `<button type="button" class="chip" data-action="reason-example" data-v="${esc(r)}">＋ ${esc(r)}</button>`).join('')}
          </div>
          <span class="hint">つらい時に SOS 画面で表示されます。</span>
        </div>

        <button type="submit" class="btn btn-primary btn-lg btn-block">${isNew ? 'この習慣をやめる' : '保存する'}</button>
        ${isNew ? '' : `<button type="button" class="btn btn-ghost btn-block" style="margin-top:12px;color:var(--danger)" data-action="habit-delete" data-id="${esc(habit.id)}">この習慣を削除</button>`}
      </form>`,
    mount() {
      const form = document.getElementById('habit-form');
      form.addEventListener('submit', (e) => { e.preventDefault(); saveDraft(); });
      const reasonInput = document.getElementById('reason-input');
      reasonInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addReason(reasonInput.value); }
      });
    },
  };
}

function addReason(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!draft.reasons.includes(t)) draft.reasons.push(t);
  rerender();
  document.getElementById('reason-input')?.focus({ preventScroll: true });
}

function saveDraft() {
  const name = draft.name.trim();
  if (!name) {
    toast('名前を入力してください');
    document.querySelector('[data-field="name"]')?.focus();
    return;
  }
  // 入力途中の理由も取り込む
  const pending = document.getElementById('reason-input')?.value.trim();
  if (pending && !draft.reasons.includes(pending)) draft.reasons.push(pending);

  const startedAt = draft.startedAtInitial && draft.startedAt === draft.startedAtInitial
    ? undefined // 変更なしなら秒単位の元の値を保つ
    : (L.fromDateTimeLocal(draft.startedAt) ?? Date.now());
  const payload = {
    name,
    emoji: draft.emoji,
    color: draft.color,
    costPerDay: Number(draft.costPerDay) || 0,
    minutesPerDay: Math.min(1440, Number(draft.minutesPerDay) || 0),
    reasons: draft.reasons,
  };
  if (draft.id) {
    store.updateHabit(draft.id, startedAt === undefined ? payload : { ...payload, startedAt });
    const id = draft.id;
    draft = null;
    toast('保存しました');
    go(`/habit/${id}`);
  } else {
    const habit = store.addHabit({ ...payload, startedAt: startedAt ?? Date.now() });
    draft = null;
    navigator.storage?.persist?.().catch(() => {});
    toast(`「${habit.name}」をやめる記録を始めました`);
    go('/');
  }
}

/* =====================================================
   画面: 衝動 SOS
   ===================================================== */

const BREATH = [
  { cls: 'in', label: '吸って', sec: 4 },
  { cls: 'hold-in', label: '止めて', sec: 4 },
  { cls: 'out', label: '吐いて', sec: 4 },
  { cls: 'hold-out', label: '止めて', sec: 4 },
];

function viewSOS() {
  const reasons = store.habits.flatMap((h) => h.reasons.map((r) => ({ emoji: h.emoji, name: h.name, text: r })));
  return {
    noChrome: true,
    html: `
      <header class="page-head">
        <a class="icon-btn" href="#/" aria-label="閉じる">${ICON.close}</a>
        <div class="grow"><h1 style="font-size:21px">衝動SOS</h1><p class="sub">波は必ず過ぎていきます</p></div>
        <span class="timer" id="sos-timer" aria-label="経過時間">00:00</span>
      </header>

      <section class="sos">
        <p class="lead">ここに来られたあなたは、もう一歩踏みとどまっています。<br>まずは一緒に、ゆっくり呼吸しましょう。</p>
        <div class="breath-wrap" aria-live="polite">
          <div class="breath-circle" id="breath-circle"></div>
          <div class="breath-label"><span id="breath-label">吸って</span><span class="breath-count" id="breath-count">4</span></div>
        </div>

        <section class="card reason-carousel" id="reason-carousel" style="margin-top:16px"></section>

        <h2 class="section-title">今できること</h2>
        <section class="card">
          <ul class="tips">
            <li>💧 コップ一杯の水を、ゆっくり飲む</li>
            <li>🚶 その場を離れて、5分だけ歩く</li>
            <li>💬 信頼できる人にメッセージを送る</li>
            <li>📝 今の気持ちを<a href="#/journal" data-action="journal-new-link">日記</a>に書き出す</li>
            <li>⏰ 「あと10分だけ待つ」と決めてみる</li>
          </ul>
        </section>

        <div class="stack" style="margin-top:22px">
          <button type="button" class="btn btn-primary btn-lg btn-block" data-action="urge-log" data-outcome="resisted">乗り越えた！</button>
          <button type="button" class="btn btn-ghost btn-block" data-action="urge-log" data-outcome="gave_in">負けてしまった</button>
        </div>
      </section>`,
    mount() {
      const start = Date.now();
      const $timer = document.getElementById('sos-timer');
      const $circle = document.getElementById('breath-circle');
      const $label = document.getElementById('breath-label');
      const $count = document.getElementById('breath-count');
      const $carousel = document.getElementById('reason-carousel');

      let phase = -1;
      let left = 0;
      let reasonIndex = 0;
      const showReason = () => {
        if (!reasons.length) {
          $carousel.innerHTML = '<div><small>思い出そう</small>あなたがやめようと決めたのには、ちゃんと理由がある。</div>';
          return;
        }
        const r = reasons[reasonIndex % reasons.length];
        $carousel.innerHTML = `<div><small>${esc(r.emoji)} ${esc(r.name)}をやめる理由</small>${esc(r.text)}</div>`;
        reasonIndex += 1;
      };
      const step = () => {
        const sec = Math.floor((Date.now() - start) / 1000);
        $timer.textContent = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
        if (left <= 0) {
          phase = (phase + 1) % BREATH.length;
          const p = BREATH[phase];
          left = p.sec;
          $circle.className = `breath-circle ${p.cls}`;
          $label.textContent = p.label;
        }
        $count.textContent = String(left);
        left -= 1;
        if (sec > 0 && sec % 8 === 0) showReason();
      };
      showReason();
      step();
      const timer = setInterval(step, 1000);
      return () => clearInterval(timer);
    },
  };
}

function urgeSheet(outcome) {
  picks = { habit: store.habits.length === 1 ? store.habits[0].id : null, intensity: 3, trigger: null };
  const resisted = outcome === 'resisted';
  openSheet(`
    <h2>${resisted ? '🛡️ よく乗り越えました！' : '話してくれてありがとう'}</h2>
    <p class="lead">${resisted ? '記録しておくと、自分の衝動のパターンが見えてきます。' : 'まずは記録しよう。責める必要はありません。'}</p>
    ${habitPickerHtml(resisted)}
    <div class="field">
      <span class="label">衝動の強さ</span>
      <div class="scale" data-group-root>
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="pick" data-group="intensity" data-v="${n}" aria-pressed="${picks.intensity === n}">${n}</button>`).join('')}
      </div>
      <span class="hint">1 = 弱い ／ 5 = とても強い</span>
    </div>
    ${triggerPickerHtml()}
    <button type="button" class="btn btn-primary btn-lg btn-block" data-action="urge-save" data-outcome="${outcome}">${resisted ? '記録する' : '記録して次へ'}</button>
  `, { label: '衝動の記録' });
}

function habitPickerHtml(optional = true) {
  if (store.habits.length <= 1) return '';
  return `
    <div class="field">
      <span class="label">どの習慣？${optional ? '' : '（必須）'}</span>
      <div class="chip-group" data-group-root>
        ${store.habits.map((h) => `<button type="button" class="chip" data-action="pick" data-group="habit" data-v="${esc(h.id)}" aria-pressed="${picks.habit === h.id}">${esc(h.emoji)} ${esc(h.name)}</button>`).join('')}
      </div>
    </div>`;
}

function triggerPickerHtml() {
  return `
    <div class="field">
      <span class="label">きっかけ</span>
      <div class="chip-group" data-group-root>
        ${P.TRIGGERS.map((t) => `<button type="button" class="chip" data-action="pick" data-group="trigger" data-v="${esc(t)}" aria-pressed="${picks.trigger === t}">${esc(t)}</button>`).join('')}
      </div>
    </div>`;
}

/* =====================================================
   スリップ（再発）の記録
   ===================================================== */

function relapseSheet(habitId = null, presetTrigger = null) {
  if (!store.habits.length) return;
  picks = { habit: habitId || (store.habits.length === 1 ? store.habits[0].id : null), trigger: presetTrigger };
  const habit = picks.habit ? store.findHabit(picks.habit) : null;
  openSheet(`
    <h2>スリップを記録</h2>
    <p class="lead">${esc(P.pickRandom(P.RELAPSE_MESSAGES))}</p>
    ${habitId ? `<p style="margin:-6px 0 16px;font-weight:800">${esc(habit.emoji)} ${esc(habit.name)}</p>` : habitPickerHtml(false)}
    <label class="field">
      <span class="label">いつ？</span>
      <input class="input" type="datetime-local" id="relapse-at" value="${L.toDateTimeLocal(Date.now())}" max="${L.toDateTimeLocal(Date.now())}">
    </label>
    ${triggerPickerHtml()}
    <label class="field">
      <span class="label">メモ（任意）</span>
      <textarea class="textarea" id="relapse-note" maxlength="500" placeholder="どんな状況だった？ 次はどうしたい？"></textarea>
    </label>
    <button type="button" class="btn btn-solid-danger btn-lg btn-block" data-action="relapse-save">記録してカウンターをリセット</button>
    <button type="button" class="btn btn-ghost btn-block" style="margin-top:8px" data-action="sheet-close">やめておく</button>
  `, { label: 'スリップを記録' });
}

function saveRelapse() {
  const habit = picks.habit && store.findHabit(picks.habit);
  if (!habit) { toast('習慣を選んでください'); return; }
  const at = L.fromDateTimeLocal(document.getElementById('relapse-at')?.value) ?? Date.now();
  const note = document.getElementById('relapse-note')?.value.trim() || '';
  const prevMs = Math.max(0, Math.min(at, Date.now()) - habit.startedAt);
  store.recordRelapse(habit.id, { at, trigger: picks.trigger || '', note });
  closeSheet(true);
  if (current.view === viewHome || current.view === viewHabit) rerender();
  else go('/', { replace: true });
  openSheet(`
    <div class="center">
      <div style="font-size:56px" aria-hidden="true">🌱</div>
      <h2>また、ここから。</h2>
      <p class="lead">前回は <strong>${esc(L.formatShortDuration(prevMs))}</strong> 続きました。<br>その日々は消えません。経験として、ちゃんと積み上がっています。</p>
      <p class="small muted">最長記録: ${esc(L.formatShortDuration(L.longestStreakMs(habit)))}</p>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="sheet-close">もう一度はじめる</button>
    </div>`, { label: 'リセットしました', onClose: () => rerender() });
}

/* =====================================================
   お祝い
   ===================================================== */

function showCelebration(habit, days) {
  const m = L.MILESTONES.find((x) => x.days === days) || { days, label: `${days}日` };
  const colors = ['#f0b43c', '#3dbfa8', '#e57fa8', '#4c8bf5', '#8e6bd8'];
  const confetti = Array.from({ length: 28 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 7) * 0.12}s"></i>`).join('');
  openSheet(`
    <div class="celebrate">
      <div class="confetti" aria-hidden="true">${confetti}</div>
      <div class="big-medal">${esc(m.label)}<small>達成</small></div>
      <h2>${esc(habit.emoji)} ${esc(habit.name)}をやめて${esc(m.label)}！</h2>
      <p class="lead">${esc(P.pickRandom(P.MILESTONE_MESSAGES))}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-lg" data-action="share-milestone" data-text="${esc(`「${habit.name}」をやめて${m.label}を達成しました！ #やめログ`)}">シェア</button>
        <button type="button" class="btn btn-gold btn-lg" data-action="sheet-close">ありがとう</button>
      </div>
    </div>`, { label: 'マイルストーン達成', onClose: () => { store.markCelebrated(habit.id, days); } });
}

async function shareText(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('シェアできませんでした');
  }
}

/* =====================================================
   画面: 記録（カレンダー・統計）
   ===================================================== */

const recordsState = { habitId: 'all', year: new Date().getFullYear(), month: new Date().getMonth() };

function statusForAll(key, now) {
  const statuses = store.habits.map((h) => L.dayStatus(h, key, now)).filter(Boolean);
  if (statuses.includes('relapse')) return 'relapse';
  if (statuses.includes('clean')) return 'clean';
  if (statuses.includes('partial')) return 'partial';
  return null;
}

function viewRecords() {
  const s = recordsState;
  if (s.habitId !== 'all' && !store.findHabit(s.habitId)) s.habitId = 'all';
  const habit = s.habitId === 'all' ? null : store.findHabit(s.habitId);
  const now = Date.now();
  const todayKey = L.dateKey();
  const journalDays = new Set(store.data.journal.map((j) => L.dateKey(new Date(j.at))));

  const cells = L.monthGrid(s.year, s.month).map((key) => {
    if (!key) return '<div></div>';
    const status = habit ? L.dayStatus(habit, key, now) : statusForAll(key, now);
    const pledged = store.data.checkins[key]?.pledgedAt;
    const dots = `${pledged ? '<i></i>' : ''}${journalDays.has(key) ? '<i class="j"></i>' : ''}`;
    const day = Number(key.slice(8));
    const label = `${s.month + 1}月${day}日 ${{ clean: 'クリーン', partial: '開始日', relapse: 'スリップ' }[status] || ''}${pledged ? ' 誓い済み' : ''}`;
    return `<button type="button" class="day ${status || ''} ${key === todayKey ? 'today' : ''}" data-action="day" data-key="${key}" aria-label="${esc(label)}">${day}${dots ? `<span class="dots">${dots}</span>` : ''}</button>`;
  }).join('');

  const urges = store.data.urges.filter((u) => !habit || u.habitId === habit.id);
  const relapses = habit ? habit.relapses : store.habits.flatMap((h) => h.relapses);
  const resisted = urges.filter((u) => u.outcome === 'resisted').length;
  const ranking = L.triggerRanking(urges, relapses).slice(0, 6);
  const maxCount = ranking[0]?.count || 1;
  const habitById = new Map(store.habits.map((h) => [h.id, h]));
  const recent = [...urges].sort((a, b) => b.at - a.at).slice(0, 8);

  return {
    tab: 'records',
    html: `
      <header class="page-head"><div class="grow"><h1>記録</h1><p class="sub">積み重ねてきた日々</p></div></header>

      <div class="filter-row" role="group" aria-label="習慣で絞り込み">
        <button type="button" class="chip" data-action="records-filter" data-v="all" aria-pressed="${s.habitId === 'all'}">すべて</button>
        ${store.habits.map((h) => `<button type="button" class="chip" data-action="records-filter" data-v="${esc(h.id)}" aria-pressed="${s.habitId === h.id}">${esc(h.emoji)} ${esc(h.name)}</button>`).join('')}
      </div>

      <div class="stat-grid">
        ${habit ? `<div class="stat"><div class="k">🌿 累計クリーン</div><div class="v">${esc(L.formatShortDuration(L.totalCleanMs(habit, now)))}</div></div>`
          : `<div class="stat"><div class="k">🤝 誓いの連続</div><div class="v">${L.pledgeStreak(store.data.checkins)}<small> 日</small></div></div>`}
        <div class="stat"><div class="k">🛡️ 乗り越えた衝動</div><div class="v">${resisted}<small> 回</small></div></div>
        <div class="stat"><div class="k">🔁 スリップ</div><div class="v">${relapses.length}<small> 回</small></div></div>
        <div class="stat"><div class="k">📝 日記</div><div class="v">${store.data.journal.filter((j) => !habit || j.habitId === habit.id).length}<small> 件</small></div></div>
      </div>

      <section class="card" style="margin-top:14px">
        <div class="cal-head">
          <button type="button" class="icon-btn" data-action="month" data-d="-1" aria-label="前の月">${ICON.prev}</button>
          <h2>${s.year}年 ${s.month + 1}月</h2>
          <button type="button" class="icon-btn" data-action="month" data-d="1" aria-label="次の月">${ICON.next}</button>
        </div>
        <div class="calendar">
          ${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}
          ${cells}
        </div>
        <div class="legend">
          <span><i style="background:var(--primary-soft)"></i>クリーン</span>
          <span><i style="background:var(--danger-soft)"></i>スリップ</span>
          <span><i style="background:var(--gold);border-radius:50%;width:8px;height:8px"></i>誓い</span>
          <span><i style="background:var(--text-2);border-radius:50%;width:8px;height:8px"></i>日記</span>
        </div>
      </section>

      <h2 class="section-title">きっかけランキング</h2>
      <section class="card bars">
        ${ranking.length ? ranking.map((r) => `
          <div class="bar-row"><span>${esc(r.trigger)}</span><span class="bar"><i style="width:${(r.count / maxCount) * 100}%"></i></span><span class="n">${r.count}</span></div>`).join('')
          : '<p class="muted small" style="margin:0">衝動やスリップを記録すると、きっかけの傾向がここに表示されます。</p>'}
      </section>

      <h2 class="section-title">最近の衝動</h2>
      <section class="card" style="padding-top:4px;padding-bottom:4px">
        ${recent.length ? `<ul class="list">${recent.map((u) => {
          const h = habitById.get(u.habitId);
          return `<li>
            <div style="font-size:22px" aria-hidden="true">${u.outcome === 'resisted' ? '🛡️' : '🌱'}</div>
            <div class="grow"><div><strong>${u.outcome === 'resisted' ? '乗り越えた' : 'スリップ'}</strong> ${h ? `<span class="tag">${esc(h.emoji)} ${esc(h.name)}</span>` : ''}</div>
            <div class="meta">${esc(L.formatDateTime(u.at))}${u.trigger ? ` ・ ${esc(u.trigger)}` : ''}</div></div>
            <div class="val" aria-label="強さ ${u.intensity}">${'●'.repeat(u.intensity)}<span style="opacity:.25">${'●'.repeat(5 - u.intensity)}</span></div>
          </li>`;
        }).join('')}</ul>` : '<p class="empty" style="padding:16px"><b>🛡️</b>衝動を感じたら SOS ボタンへ。</p>'}
      </section>`,
  };
}

function daySheet(key) {
  const now = Date.now();
  const d = L.parseDateKey(key);
  const start = d.getTime();
  const end = L.parseDateKey(L.addDays(key, 1)).getTime();
  const inDay = (t) => t >= start && t < end;
  const c = store.data.checkins[key];
  const statusLabel = { clean: '✅ クリーン', partial: '🌱 この日から開始', relapse: '🔁 スリップ' };
  const habits = store.habits.map((h) => {
    const st = L.dayStatus(h, key, now);
    return st ? `<li><div class="grow">${esc(h.emoji)} ${esc(h.name)}</div><div class="val">${statusLabel[st]}</div></li>` : '';
  }).join('');
  const urges = store.data.urges.filter((u) => inDay(u.at));
  const journal = store.data.journal.filter((j) => inDay(j.at)).sort((a, b) => a.at - b.at);
  openSheet(`
    <h2>${d.getFullYear()}年${formatDayJa(d)}</h2>
    <ul class="list">
      ${habits || '<li class="muted">記録はありません</li>'}
      ${c?.pledgedAt ? '<li><div class="grow">🤝 今日の誓い</div><div class="val">済み</div></li>' : ''}
      ${c?.reviewedAt ? `<li><div class="grow">🌙 振り返り</div><div class="val">${c.result === 'clean' ? 'やめられた' : 'スリップ'}</div></li>` : ''}
      ${urges.length ? `<li><div class="grow">🛡️ 衝動</div><div class="val">${urges.length} 回（乗り越えた ${urges.filter((u) => u.outcome === 'resisted').length}）</div></li>` : ''}
    </ul>
    ${journal.map((j) => `<div class="card entry" style="margin-top:10px"><div class="mood" aria-hidden="true">${P.MOODS[j.mood - 1].emoji}</div><div class="grow"><div class="when">${esc(L.formatDateTime(j.at).slice(-5))}</div><p>${esc(j.text) || '<span class="muted">（気分のみ）</span>'}</p></div></div>`).join('')}
    <button type="button" class="btn btn-block" style="margin-top:16px" data-action="sheet-close">閉じる</button>
  `, { label: '日付の詳細' });
}

/* =====================================================
   画面: 日記
   ===================================================== */

let openJournalOnMount = false;

function viewJournal() {
  const entries = [...store.data.journal].sort((a, b) => b.at - a.at);
  const habitById = new Map(store.habits.map((h) => [h.id, h]));
  let lastDay = '';
  const items = entries.map((j) => {
    const key = L.dateKey(new Date(j.at));
    const head = key !== lastDay ? `<h2 class="section-title">${esc(formatDayJa(new Date(j.at)))}</h2>` : '';
    lastDay = key;
    const h = habitById.get(j.habitId);
    const mood = P.MOODS[j.mood - 1];
    return `${head}
      <article class="card entry">
        <div class="mood" role="img" aria-label="${esc(mood.label)}">${mood.emoji}</div>
        <div class="grow">
          <div class="when">${esc(L.formatDateTime(j.at).slice(-5))} ${h ? `<span class="tag">${esc(h.emoji)} ${esc(h.name)}</span>` : ''}</div>
          ${j.text ? `<p>${esc(j.text)}</p>` : ''}
        </div>
        <button type="button" class="del" data-action="journal-del" data-id="${esc(j.id)}" aria-label="削除">×</button>
      </article>`;
  }).join('');

  return {
    tab: 'journal',
    html: `
      <header class="page-head">
        <div class="grow"><h1>日記</h1><p class="sub">気持ちを言葉にすると、少し軽くなる</p></div>
        <button type="button" class="icon-btn" data-action="journal-new" aria-label="日記を書く">${ICON.plus}</button>
      </header>
      <button type="button" class="btn btn-primary btn-lg btn-block" data-action="journal-new">✏️ 今の気持ちを書く</button>
      ${entries.length ? items : '<div class="empty"><b>📝</b>まだ日記はありません。<br>今日の気分だけでも記録してみよう。</div>'}`,
    mount() {
      if (openJournalOnMount) { openJournalOnMount = false; journalSheet(); }
    },
  };
}

function journalSheet() {
  picks = { mood: null, habit: null };
  openSheet(`
    <h2>今の気持ち</h2>
    <div class="field">
      <span class="label">気分</span>
      <div class="scale moods" data-group-root>
        ${P.MOODS.map((m) => `<button type="button" data-action="pick" data-group="mood" data-v="${m.value}" aria-pressed="false" aria-label="${esc(m.label)}">${m.emoji}</button>`).join('')}
      </div>
    </div>
    ${store.habits.length ? `
    <div class="field">
      <span class="label">関連する習慣（任意）</span>
      <div class="chip-group" data-group-root>
        ${store.habits.map((h) => `<button type="button" class="chip" data-action="pick" data-group="habit" data-v="${esc(h.id)}" aria-pressed="false">${esc(h.emoji)} ${esc(h.name)}</button>`).join('')}
      </div>
    </div>` : ''}
    <label class="field">
      <span class="label">メモ</span>
      <textarea class="textarea" id="journal-text" maxlength="2000" placeholder="今日はどんな一日だった？ 何を感じた？"></textarea>
    </label>
    <button type="button" class="btn btn-primary btn-lg btn-block" data-action="journal-save">保存する</button>
  `, { label: '日記を書く' });
}

/* =====================================================
   画面: 設定
   ===================================================== */

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function viewSettings() {
  const s = store.settings;
  let installRow;
  if (isStandalone()) {
    installRow = '<div class="settings-row"><div class="grow"><div class="label">📲 ホーム画面アプリ</div><div class="desc">インストール済みです</div></div></div>';
  } else if (installPrompt) {
    installRow = '<button type="button" class="settings-row" data-action="install"><div class="grow"><div class="label">📲 ホーム画面に追加</div><div class="desc">アプリのようにすぐ開けて、オフラインでも使えます</div></div></button>';
  } else if (isIOS()) {
    installRow = '<div class="settings-row"><div class="grow"><div class="label">📲 ホーム画面に追加</div><div class="desc">Safari の共有ボタン <b>⬆︎</b> →「ホーム画面に追加」でアプリとして使えます。データが消えにくくなるのでおすすめです。</div></div></div>';
  } else {
    installRow = '<div class="settings-row"><div class="grow"><div class="label">📲 ホーム画面に追加</div><div class="desc">ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。</div></div></div>';
  }

  return {
    tab: 'settings',
    html: `
      <header class="page-head"><div class="grow"><h1>設定</h1></div></header>

      <h2 class="section-title">やめている習慣</h2>
      <div class="settings-group">
        ${store.habits.map((h) => `
          <a class="settings-row" href="#/edit/${esc(h.id)}" style="color:inherit;text-decoration:none">
            <div style="font-size:24px" aria-hidden="true">${esc(h.emoji)}</div>
            <div class="grow"><div class="label">${esc(h.name)}</div><div class="desc">${esc(L.formatDate(h.startedAt))} から</div></div>
            ${ICON.chev}
          </a>`).join('')}
        <a class="settings-row" href="#/new" style="color:var(--primary);text-decoration:none;font-weight:800">＋ 習慣を追加</a>
      </div>

      <h2 class="section-title">表示</h2>
      <div class="settings-group">
        <div class="settings-row">
          <div class="grow"><div class="label">テーマ</div></div>
          <div class="segmented" role="group" aria-label="テーマ" style="width:210px">
            ${[['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, l]) => `<button type="button" data-action="theme" data-v="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}
          </div>
        </div>
        <label class="settings-row">
          <div class="grow"><div class="label">通貨</div><div class="desc">節約額の表示に使います</div></div>
          <select class="select" id="currency-select" aria-label="通貨">
            ${['¥', '$', '€', '£', '₩'].map((c) => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
      </div>

      <h2 class="section-title">アプリ</h2>
      <div class="settings-group">${installRow}</div>

      <h2 class="section-title">データ</h2>
      <div class="settings-group">
        <button type="button" class="settings-row" data-action="export"><div class="grow"><div class="label">💾 バックアップを書き出す</div><div class="desc">機種変更やもしもの時のために JSON ファイルで保存</div></div></button>
        <button type="button" class="settings-row" data-action="import"><div class="grow"><div class="label">📂 バックアップから復元</div><div class="desc">現在のデータは置き換えられます</div></div></button>
        <button type="button" class="settings-row danger" data-action="reset-all"><div class="grow"><div class="label">🗑️ すべてのデータを削除</div></div></button>
      </div>
      <p class="small muted" style="margin:10px 4px 0">🔒 データはこの端末のブラウザ内にだけ保存され、外部には送信されません。</p>

      <h2 class="section-title">ひとりで抱え込まないで</h2>
      <div class="notice">
        <strong>このアプリは医療の代わりではありません</strong>
        依存がつらい時、体調に不安がある時は、医療機関やお住まいの地域の精神保健福祉センター・保健所に相談できます。<br>
        こころの健康相談統一ダイヤル: <a href="tel:0570064556">0570-064-556</a>
      </div>

      <p class="small muted center" style="margin-top:28px">やめログ v${APP_VERSION}</p>`,
    mount() {
      document.getElementById('currency-select').addEventListener('change', (e) => {
        store.updateSettings({ currency: e.target.value });
        toast('通貨を変更しました');
      });
    },
  };
}

function exportData() {
  const json = store.exportJSON();
  const name = `yamelog-backup-${L.dateKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && isIOS()) {
    navigator.share({ files: [file], title: 'やめログのバックアップ' }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('バックアップを書き出しました');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (store.habits.length) {
        const ok = await confirmSheet({ title: 'バックアップから復元しますか？', message: '現在のデータはすべて置き換えられます。', ok: '復元する', danger: true });
        if (!ok) return;
      }
      store.importJSON(text);
      applyTheme();
      toast('復元しました');
      go('/');
    } catch (e) {
      toast(e?.message?.includes('やめログ') ? e.message : 'ファイルを読み込めませんでした');
    }
  });
  input.click();
}

/* =====================================================
   イベント（委譲）
   ===================================================== */

const actions = {
  'sheet-close': () => closeSheet(),

  pledge() {
    store.pledge();
    toast('誓いました。今日も一日、一緒にがんばろう');
    rerender();
  },
  'review-open'() {
    openSheet(`
      <h2>今日の振り返り</h2>
      <p class="lead">今日はやめられましたか？</p>
      <div class="btn-row">
        <button type="button" class="btn btn-danger btn-lg" data-action="review-slip">スリップした</button>
        <button type="button" class="btn btn-primary btn-lg" data-action="review-clean">やめられた！</button>
      </div>`, { label: '今日の振り返り' });
  },
  'review-clean'() {
    closeSheet(true);
    store.review('clean');
    toast('すばらしい！ 今日もよくがんばりました');
    rerender();
  },
  'review-slip'() {
    closeSheet(true);
    store.review('slip');
    rerender();
    relapseSheet();
  },

  relapse(el) { relapseSheet(el.dataset.id); },
  'relapse-save': saveRelapse,

  pick(el) {
    const { group, v } = el.dataset;
    const root = el.closest('[data-group-root]') || el.parentElement;
    const value = ['intensity', 'mood'].includes(group) ? Number(v) : v;
    const optional = !['intensity'].includes(group);
    const nextValue = optional && picks[group] === value ? null : value;
    picks[group] = nextValue;
    root.querySelectorAll(`[data-group="${group}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b === el && nextValue !== null)));
  },

  'urge-log'(el) { urgeSheet(el.dataset.outcome); },
  'urge-save'(el) {
    const outcome = el.dataset.outcome;
    if (outcome === 'gave_in' && store.habits.length > 1 && !picks.habit) { toast('習慣を選んでください'); return; }
    store.addUrge({ habitId: picks.habit, intensity: picks.intensity, trigger: picks.trigger || '', outcome });
    closeSheet(true);
    if (outcome === 'resisted') {
      const count = store.data.urges.filter((u) => u.outcome === 'resisted').length;
      toast(`乗り越えました！ これで ${count} 回目です`);
      go('/');
    } else {
      relapseSheet(picks.habit, picks.trigger);
    }
  },

  'journal-new': journalSheet,
  'journal-new-link'(el, e) { e.preventDefault(); openJournalOnMount = true; go('/journal'); },
  'journal-save'() {
    const text = document.getElementById('journal-text')?.value || '';
    if (!text.trim() && !picks.mood) { toast('気分かメモを入力してください'); return; }
    store.addJournal({ mood: picks.mood || 3, text, habitId: picks.habit });
    closeSheet(true);
    toast('日記を保存しました');
    if (current.view === viewJournal) rerender(); else go('/journal');
  },
  async 'journal-del'(el) {
    const ok = await confirmSheet({ title: 'この日記を削除しますか？', ok: '削除', danger: true });
    if (!ok) return;
    store.deleteJournal(el.dataset.id);
    rerender();
  },

  preset(el) {
    const p = P.HABIT_PRESETS[Number(el.dataset.i)];
    draft.preset = Number(el.dataset.i);
    draft.name = p.custom ? '' : p.name;
    draft.emoji = p.emoji;
    draft.color = p.color;
    draft.costPerDay = p.costPerDay || '';
    draft.minutesPerDay = p.minutesPerDay || '';
    rerender();
    if (p.custom) document.querySelector('[data-field="name"]')?.focus();
  },
  emoji(el) {
    draft.emoji = el.dataset.v;
    el.parentElement.querySelectorAll('.emoji-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  color(el) {
    draft.color = el.dataset.v;
    el.parentElement.querySelectorAll('.color-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  'reason-add'() { addReason(document.getElementById('reason-input')?.value); },
  'reason-example'(el) { addReason(el.dataset.v); },
  'reason-del'(el) { draft.reasons.splice(Number(el.dataset.i), 1); rerender(); },
  async 'habit-delete'(el) {
    const habit = store.findHabit(el.dataset.id);
    const ok = await confirmSheet({ title: `「${habit?.name}」を削除しますか？`, message: 'この習慣の記録（履歴・スリップ）はすべて削除されます。元に戻せません。', ok: '削除する', danger: true });
    if (!ok) return;
    store.deleteHabit(el.dataset.id);
    draft = null;
    toast('削除しました');
    go('/');
  },

  'records-filter'(el) { recordsState.habitId = el.dataset.v; rerender(); },
  month(el) {
    const d = new Date(recordsState.year, recordsState.month + Number(el.dataset.d), 1);
    recordsState.year = d.getFullYear();
    recordsState.month = d.getMonth();
    rerender();
  },
  day(el) { daySheet(el.dataset.key); },

  theme(el) {
    store.updateSettings({ theme: el.dataset.v });
    applyTheme();
    rerender();
  },
  export: exportData,
  import: importData,
  async 'reset-all'() {
    const ok = await confirmSheet({ title: 'すべてのデータを削除しますか？', message: '習慣・記録・日記がすべて消えます。必要ならバックアップを書き出してから実行してください。', ok: 'すべて削除', danger: true });
    if (!ok) return;
    store.resetAll();
    applyTheme();
    draft = null;
    toast('すべてのデータを削除しました');
    go('/welcome');
  },
  async install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    if (choice?.outcome === 'accepted') toast('ホーム画面に追加しました');
    rerender();
  },
  'share-milestone'(el) { shareText(el.dataset.text); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !document.contains(el)) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'BUTTON' || el.dataset.action.endsWith('-link')) e.preventDefault();
  fn(el, e);
});

// 登録フォームの入力は再描画せずに draft へ反映（フォーカスを保つ）
function syncDraftField(e) {
  const field = e.target.dataset?.field;
  if (field && draft) draft[field] = e.target.value;
}
document.addEventListener('input', syncDraftField);
document.addEventListener('change', syncDraftField);

$backdrop.addEventListener('click', () => closeSheet());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetCtx) closeSheet();
});

window.addEventListener('hashchange', () => render());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (current.view === viewHome) rerender();
    else tick();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (current.view === viewHome || current.view === viewSettings) rerender();
});
window.addEventListener('appinstalled', () => { installPrompt = null; });

/* ---------- Service Worker ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let updateRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const promptUpdate = (worker) => {
      toast('新しいバージョンがあります', {
        action: '更新',
        duration: 0,
        onAction: () => { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
      });
    });
    // 起動中も定期的に更新を確認
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
}

/* ---------- 起動 ---------- */

applyTheme();
render();
setInterval(tick, 1000);
registerServiceWorker();
