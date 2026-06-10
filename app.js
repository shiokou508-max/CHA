/* ============================
   TOEFL 3800 Vocab App — Core Logic v2
   All 8 feature gap fixes implemented
   ============================ */

// ============ STATE ============
let state = {
    currentRank: null,
    currentSection: null,
    currentWords: [],
    quizWords: [],
    quizIndex: 0,
    quizResults: [],
    quizStartTime: null,
    quizMode: 'quiz', // 'quiz' | 'listening' | 'ankisheet' | 'jp2en'
    cardWords: [],
    cardUnknown: [],
    cardIndex: 0,
    cardFlipped: false,
    timerInterval: null,
    timerRemaining: 6000,
    timerStart: 0,
    sessionSource: null,
    previousView: 'view-home',
    placementDone: false,
    quizStreak: 0, // 連続正解数
    // モード選択画面の選択状態
    selLearn: 'quiz',     // 'quiz' | 'card'
    selFormat: 'zh2ja',   // 'zh2ja'(中→日) | 'ja2zh'(日→中) | 'listening'
    selAnki: false,       // 暗記シートON/OFF
    modeBaseWords: [],    // フィルタ適用前の対象語(セクション or クイックの母集団)
};

// ============ USER TITLE SYSTEM ============
const USER_TITLES = [
    { min: 0, title: '中国語ビギナー' },
    { min: 100, title: '中国語チャレンジャー' },
    { min: 500, title: '中国語マスター' },
    { min: 1000, title: '中国語エキスパート' },
    { min: 2000, title: '中国語プロフェッサー' },
    { min: 3000, title: '中国語レジェンド' },
];

const MILESTONE_THRESHOLDS = [100, 500, 1000, 2000, 3800];

function getUserTitle(masteredCount) {
    let t = USER_TITLES[0];
    for (const u of USER_TITLES) {
        if (masteredCount >= u.min) t = u;
    }
    return t;
}

// ============ MASTERY SYSTEM (Enhanced with speed grading) ============
// Levels: 'unlearned' | 'weak' | 'vague' | 'almost' | 'perfect'
// Speed grades: Excellent (<1.5s) | Great (<2.5s) | Good (<3s) | Bad (wrong/timeout)
function getMasteryData() {
    try { return JSON.parse(localStorage.getItem('mikan_mastery') || '{}'); }
    catch { return {}; }
}

function saveMasteryData(data) {
    localStorage.setItem('mikan_mastery', JSON.stringify(data));
}

function getWordMastery(word) {
    const data = getMasteryData();
    return data[word] || { level: 'unlearned', correct: 0, wrong: 0, streak: 0, lastReview: null, reviewCount: 0 };
}

function setWordMastery(word, level) {
    const data = getMasteryData();
    if (!data[word]) data[word] = { level: 'unlearned', correct: 0, wrong: 0, streak: 0, lastReview: null, reviewCount: 0 };
    data[word].level = level;
    data[word].lastReview = new Date().toISOString();
    saveMasteryData(data);
}

function updateWordMastery(word, isCorrect, responseTimeMs) {
    const data = getMasteryData();
    if (!data[word]) data[word] = { level: 'unlearned', correct: 0, wrong: 0, streak: 0, lastReview: null, reviewCount: 0 };

    const w = data[word];
    w.lastReview = new Date().toISOString();
    w.reviewCount = (w.reviewCount || 0) + 1;

    let grade = 'bad';
    if (isCorrect) {
        w.correct++;
        w.streak++;
        // 4-tier speed grading per document Section 9.1
        if (responseTimeMs < 1500) {
            grade = 'excellent';
            w.level = 'perfect';
        } else if (responseTimeMs < 2500) {
            grade = 'great';
            if (w.streak >= 2) w.level = 'perfect';
            else w.level = 'almost';
        } else {
            grade = 'good';
            if (w.streak >= 3) w.level = 'almost';
            else w.level = 'vague';
        }
    } else {
        w.wrong++;
        w.streak = 0;
        grade = 'bad';
        w.level = 'weak';
    }

    saveMasteryData(data);
    return { level: w.level, grade };
}

// ============ FORGETTING CURVE (Section 9.1 / Section 2) ============
// Intervals: 1d → 3d → 7d → 14d → 30d
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

function getWordsDueForReview() {
    const data = getMasteryData();
    const now = Date.now();
    const due = [];

    const allWords = getAllWords();
    for (const word of allWords) {
        const m = data[word.w];
        if (!m || m.level === 'unlearned') continue;

        if (m.lastReview) {
            const lastDate = new Date(m.lastReview).getTime();
            const daysSince = (now - lastDate) / 86400000;
            const intervalIdx = Math.min((m.reviewCount || 1) - 1, REVIEW_INTERVALS.length - 1);
            const nextInterval = REVIEW_INTERVALS[Math.max(0, intervalIdx)];

            if (daysSince >= nextInterval) {
                due.push({ ...word, daysSince: Math.round(daysSince), dueBy: nextInterval });
            }
        }
    }
    return due;
}

// ============ MY WORD LIST (Section 9.4) ============
function getMyWords() {
    try { return JSON.parse(localStorage.getItem('mikan_mywords') || '[]'); }
    catch { return []; }
}

function saveMyWords(words) {
    localStorage.setItem('mikan_mywords', JSON.stringify(words));
}

function addMyWord(english, japanese) {
    const words = getMyWords();
    if (words.some(w => w.w === english)) return false;
    words.push({ w: english, m: japanese });
    saveMyWords(words);
    return true;
}

function removeMyWord(english) {
    const words = getMyWords().filter(w => w.w !== english);
    saveMyWords(words);
}

// ============ 学習設定 (問題数・制限時間) ============
const DEFAULT_SETTINGS = {
    quizCount: 10,    // 4択/リスニング/暗記/日→中 の1回の問題数
    quizTime: 6,      // 制限時間(秒)
    cardCount: 10,    // カードめくりの1回の枚数
    speechRate: 85,   // 音声の速さ(%) 100=標準
};
const SETTINGS_LIMITS = {
    quizCount: { min: 5, max: 50, step: 5 },
    quizTime: { min: 3, max: 20, step: 1 },
    cardCount: { min: 5, max: 50, step: 5 },
    speechRate: { min: 50, max: 120, step: 5 },
};
function getSettings() {
    try {
        const s = JSON.parse(localStorage.getItem('mikan_settings') || '{}');
        return { ...DEFAULT_SETTINGS, ...s };
    } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
    localStorage.setItem('mikan_settings', JSON.stringify(s));
}
function changeSetting(key, dir) {
    const s = getSettings();
    const lim = SETTINGS_LIMITS[key];
    if (!lim) return;
    let v = (s[key] || DEFAULT_SETTINGS[key]) + dir * lim.step;
    v = Math.max(lim.min, Math.min(lim.max, v));
    s[key] = v;
    saveSettings(s);
    renderSettingsControls();
}
function renderSettingsControls() {
    const s = getSettings();
    const map = { quizCount: 'set-quiz-count', quizTime: 'set-quiz-time', cardCount: 'set-card-count', speechRate: 'set-speech-rate' };
    for (const key in map) {
        const el = document.getElementById(map[key]);
        if (el) el.textContent = s[key];
    }
}

// ============ STATS ============
function getStats() {
    try { return JSON.parse(localStorage.getItem('mikan_stats') || '{}'); }
    catch { return {}; }
}

function saveStats(stats) {
    localStorage.setItem('mikan_stats', JSON.stringify(stats));
}

function updateStreak() {
    const stats = getStats();
    const today = new Date().toDateString();
    if (stats.lastStudyDate === today) return;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (stats.lastStudyDate === yesterday) {
        stats.streak = (stats.streak || 0) + 1;
    } else if (stats.lastStudyDate !== today) {
        stats.streak = 1;
    }
    stats.lastStudyDate = today;
    saveStats(stats);
}

function addSessionStat(wordsStudied, timeMs) {
    const stats = getStats();
    const today = new Date().toDateString();
    stats.totalSessions = (stats.totalSessions || 0) + 1;
    stats.totalTimeMs = (stats.totalTimeMs || 0) + timeMs;
    stats.todayWords = stats.todayDate === today ? (stats.todayWords || 0) + wordsStudied : wordsStudied;
    stats.todayDate = today;

    if (!stats.weekly) stats.weekly = {};
    const dayKey = new Date().toISOString().split('T')[0];
    stats.weekly[dayKey] = (stats.weekly[dayKey] || 0) + wordsStudied;

    saveStats(stats);
    updateStreak();
}

// ============ WORD HELPERS ============
function getAllWords() {
    const words = [];
    for (const rank of Object.keys(VOCAB_DATA)) {
        for (const section of Object.keys(VOCAB_DATA[rank])) {
            for (const word of VOCAB_DATA[rank][section]) {
                words.push({ ...word, rank, section });
            }
        }
    }
    return words;
}

function getWordsByRank(rankName) {
    const words = [];
    const rankData = VOCAB_DATA[rankName];
    if (!rankData) return words;
    for (const section of Object.keys(rankData)) {
        for (const word of rankData[section]) {
            words.push({ ...word, rank: rankName, section });
        }
    }
    return words;
}

function getSectionWords(rankName, sectionName) {
    return (VOCAB_DATA[rankName]?.[sectionName] || []).map(w => ({ ...w, rank: rankName, section: sectionName }));
}

function countByMastery() {
    const all = getAllWords();
    const data = getMasteryData();
    const counts = { perfect: 0, almost: 0, vague: 0, weak: 0, unlearned: 0 };
    for (const word of all) {
        const m = data[word.w];
        const level = m ? m.level : 'unlearned';
        counts[level]++;
    }
    return counts;
}

function getMasteredCount() {
    const c = countByMastery();
    return c.perfect + c.almost;
}

// ============ VIEW MANAGEMENT ============
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.add('active');
        view.scrollTop = 0;
    }

    const noTabViews = ['view-quiz', 'view-card', 'view-results', 'view-rankup', 'view-placement', 'view-mode', 'view-pyquiz'];
    const tabBar = document.getElementById('tab-bar');
    tabBar.style.display = noTabViews.includes(viewId) ? 'none' : 'flex';

    // 発音表はピンインタブの配下として扱う
    const tabView = viewId === 'view-pychart' ? 'view-pinyin' : viewId;
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === tabView);
    });
}

function switchTab(viewId) {
    showView(viewId);
    if (viewId === 'view-home') updateHomeStats();
    if (viewId === 'view-data') updateDataView();
    if (viewId === 'view-settings') renderSettingsControls();
    if (viewId === 'view-pinyin' && typeof renderPinyinHome === 'function') renderPinyinHome();
}

function goBackFromMode() {
    if (state.previousView) showView(state.previousView);
    else showView('view-home');
}

// ============ HOME VIEW ============
function updateHomeStats() {
    const all = getAllWords();
    const data = getMasteryData();
    const stats = getStats();

    let weak = 0, unlearned = 0;
    for (const word of all) {
        const m = data[word.w];
        if (!m || m.level === 'unlearned') unlearned++;
        else if (m.level === 'weak') weak++;
    }

    const total = all.length;
    const masteredCount = getMasteredCount();
    const dueCount = getWordsDueForReview().length;

    document.getElementById('total-learned').textContent = masteredCount;
    document.getElementById('total-words').textContent = total;
    document.getElementById('today-count').textContent = stats.todayDate === new Date().toDateString() ? (stats.todayWords || 0) : 0;

    const pct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
    document.getElementById('home-progress-fill').style.width = pct + '%';
    document.getElementById('home-progress-pct').textContent = pct + '%';

    document.getElementById('count-unlearned').textContent = unlearned;
    document.getElementById('count-review').textContent = total;
    document.getElementById('count-weak').textContent = weak;
    document.getElementById('count-due').textContent = dueCount;

    // Streak
    document.getElementById('streak-count').textContent = stats.streak || 0;

    // User title
    const title = getUserTitle(masteredCount);
    document.getElementById('user-title').textContent = title.title;

    // Time-of-day study tip (Section 9.3)
    const hour = new Date().getHours();
    let mascotMsg;
    if (hour >= 5 && hour < 10) {
        const tips = ['朝は新しい単語のインプットに最適！', '朝の脳は吸収力バツグン！', 'Good morning! 新しい単語を覚えよう！'];
        mascotMsg = tips[Math.floor(Math.random() * tips.length)];
    } else if (hour >= 22 || hour < 5) {
        const tips = ['寝る前の復習で記憶が定着するよ！', '夜は復習がおすすめ！睡眠中に記憶が固定化！', '今日の復習をしてから寝よう！'];
        mascotMsg = tips[Math.floor(Math.random() * tips.length)];
    } else {
        const tips = [
            '今日も頑張ろう！', 'いい調子だね！', '一緒に覚えよう！',
            'コツコツが大事！', "Let's study!", '応援してるよ！',
            '1日10単語でも大きな一歩！', '継続は力なり！'
        ];
        mascotMsg = tips[Math.floor(Math.random() * tips.length)];
    }
    document.getElementById('mascot-message').textContent = mascotMsg;

    // Check milestones
    checkMilestone(masteredCount);
}

// ============ MILESTONE CELEBRATIONS (Section 9.3) ============
function checkMilestone(masteredCount) {
    const stats = getStats();
    const celebrated = stats.celebratedMilestones || [];
    for (const m of MILESTONE_THRESHOLDS) {
        if (masteredCount >= m && !celebrated.includes(m)) {
            celebrated.push(m);
            stats.celebratedMilestones = celebrated;
            saveStats(stats);
            showMilestoneCelebration(m);
            break;
        }
    }
}

function showMilestoneCelebration(count) {
    const overlay = document.getElementById('milestone-overlay');
    document.getElementById('milestone-count').textContent = count;
    const title = getUserTitle(count);
    document.getElementById('milestone-title').textContent = `${title.icon} ${title.title}`;
    overlay.style.display = 'flex';
    launchConfetti();

    document.getElementById('milestone-close').onclick = () => {
        overlay.style.display = 'none';
    };
}

// ============ COURSE SELECT ============
function renderCourses() {
    const list = document.getElementById('courses-list');
    const data = getMasteryData();
    list.innerHTML = '';

    const rankLabels = {
        'Rank 1': '基礎 (Foundation)',
        'Rank 2': '標準 (Standard)',
        'Rank 3': '上級 (Advanced)',
        'Rank 4': '超上級 (Super Advanced)'
    };

    for (const rank of Object.keys(VOCAB_DATA)) {
        const words = getWordsByRank(rank);
        const mastered = words.filter(w => {
            const m = data[w.w];
            return m && (m.level === 'perfect' || m.level === 'almost');
        }).length;
        const pct = words.length > 0 ? Math.round((mastered / words.length) * 100) : 0;

        const card = document.createElement('div');
        card.className = 'course-card';
        card.innerHTML = `
      <div class="course-name">${rank} — ${rankLabels[rank] || ''}</div>
      <div class="course-meta">
        <span class="course-word-count">${words.length} 語</span>
        <div class="course-progress-mini">
          <div class="course-progress-bar"><div class="fill" style="width:${pct}%"></div></div>
          <span class="course-pct">${pct}%</span>
        </div>
      </div>
    `;
        card.onclick = () => {
            state.currentRank = rank;
            renderSections(rank);
            showView('view-sections');
        };
        list.appendChild(card);
    }
}

// ============ SECTION SELECT ============
function renderSections(rankName) {
    document.getElementById('sections-title').textContent = rankName;
    const list = document.getElementById('sections-list');
    const data = getMasteryData();
    list.innerHTML = '';

    const sections = Object.keys(VOCAB_DATA[rankName] || {});
    sections.forEach((sectionName) => {
        const words = VOCAB_DATA[rankName][sectionName];
        const mastered = words.filter(w => {
            const m = data[w.w];
            return m && (m.level === 'perfect' || m.level === 'almost');
        }).length;
        const isComplete = mastered === words.length && words.length > 0;

        const card = document.createElement('div');
        card.className = 'section-card';

        const dotsSample = words.slice(0, 10).map(w => {
            const m = data[w.w];
            const level = m ? m.level : 'unlearned';
            return `<div class="mastery-dot ${level}"></div>`;
        }).join('');

        const sectionNum = sectionName.replace('Section ', '');
        card.innerHTML = `
      <div class="section-left">
        <div class="section-num ${isComplete ? 'completed' : ''}">${isComplete ? '✓' : sectionNum}</div>
        <div class="section-info">
          <h4>${sectionName}</h4>
          <span class="section-word-count">${words.length}語 · ${mastered}/${words.length} 覚えた</span>
        </div>
      </div>
      <div class="section-right">
        <div class="section-mastery-dots">${dotsSample}</div>
        <span class="section-arrow">›</span>
      </div>
    `;
        card.onclick = () => {
            state.currentSection = sectionName;
            state.currentWords = getSectionWords(rankName, sectionName);
            state.previousView = 'view-sections';
            state.sessionSource = 'section';
            showModeSelect();
        };
        list.appendChild(card);
    });
}

// ============ MODE SELECT (mikan-style 2-axis) ============
// フィルタチップの定義
const MODE_FILTERS = [
    { key: 'all', label: 'おまかせ' },
    { key: 'unlearned', label: '未学習' },
    { key: 'weak', label: '苦手' },
    { key: 'vague', label: 'うろ覚え' },
    { key: 'almost', label: 'ほぼ覚えた' },
    { key: 'perfect', label: '覚えた' },
];
let _modeFilter = 'all';

function showModeSelect() {
    // 母集団を確定(セクション/クイックで渡された currentWords)
    state.modeBaseWords = [...state.currentWords];
    _modeFilter = 'all';

    // タイトル
    const label = state.currentRank && state.currentSection
        ? `${state.currentRank} — ${state.currentSection}`
        : (state.sessionSource === 'due' ? '忘却曲線復習' : state.sessionSource === 'mywords' ? 'My単語帳'
            : state.sessionSource === 'weak' ? '苦手の復習' : state.sessionSource === 'unlearned' ? '未学習の学習'
                : state.sessionSource === 'review' ? '総復習' : '学習セッション');
    document.getElementById('mode-title').textContent = label;

    // 既定の選択(直近の選択を保持しつつ初期値補正)
    if (!state.selLearn) state.selLearn = 'quiz';
    if (!state.selFormat) state.selFormat = 'zh2ja';

    renderModeChips();
    renderModeRing();
    renderModeSelectUI();
    showView('view-mode');
}

// 習熟度でフィルタした語を返す
function getFilteredModeWords() {
    const data = getMasteryData();
    if (_modeFilter === 'all') return state.modeBaseWords;
    return state.modeBaseWords.filter(w => {
        const m = data[w.w];
        const level = m ? m.level : 'unlearned';
        return level === _modeFilter;
    });
}

// フィルタチップを描画
function renderModeChips() {
    const wrap = document.getElementById('mode-chips');
    if (!wrap) return;
    const data = getMasteryData();
    wrap.innerHTML = '';
    MODE_FILTERS.forEach(f => {
        let count;
        if (f.key === 'all') count = state.modeBaseWords.length;
        else count = state.modeBaseWords.filter(w => {
            const m = data[w.w];
            const level = m ? m.level : 'unlearned';
            return level === f.key;
        }).length;
        const chip = document.createElement('button');
        chip.className = 'mode-chip' + (f.key === _modeFilter ? ' active' : '');
        chip.innerHTML = `<span class="mode-chip-label">${f.label}</span><span class="mode-chip-count">${count}</span>`;
        chip.onclick = () => {
            if (count === 0 && f.key !== 'all') return; // 0件は選べない
            _modeFilter = f.key;
            renderModeChips();
            renderModeRing();
        };
        if (count === 0 && f.key !== 'all') chip.classList.add('disabled');
        wrap.appendChild(chip);
    });
}

// 進捗リング(現フィルタ対象の習得率)
function renderModeRing() {
    const words = getFilteredModeWords();
    const data = getMasteryData();
    const total = words.length;
    const mastered = words.filter(w => {
        const m = data[w.w];
        return m && (m.level === 'perfect' || m.level === 'almost');
    }).length;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const ring = document.getElementById('mode-ring-fill');
    const center = document.getElementById('mode-ring-center');
    if (ring) {
        const circ = 2 * Math.PI * 52;
        ring.style.strokeDasharray = circ;
        ring.style.strokeDashoffset = circ - (circ * pct / 100);
    }
    if (center) center.textContent = total > 0 ? pct + '%' : '0問';
}

// 学習モード/出題形式/暗記シートの選択UIを反映
function renderModeSelectUI() {
    document.querySelectorAll('#mode-seg-learn .mode-seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.learn === state.selLearn);
    });
    document.querySelectorAll('#mode-seg-format .mode-seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.format === state.selFormat);
    });
    // カードモードでは出題形式・暗記シートを隠す(カードは中→日固定)
    const isCard = state.selLearn === 'card';
    document.getElementById('mode-format-row').style.display = isCard ? 'none' : '';
    document.getElementById('mode-anki-row').style.display = isCard ? 'none' : '';
    // 暗記シートスイッチ
    const sw = document.getElementById('mode-anki-switch');
    if (sw) {
        sw.classList.toggle('on', state.selAnki);
        sw.setAttribute('aria-checked', state.selAnki ? 'true' : 'false');
    }
    // リスニング選択時は暗記シートを無効化(両立しない)
    const ankiRow = document.getElementById('mode-anki-row');
    if (ankiRow && state.selFormat === 'listening') {
        ankiRow.classList.add('disabled');
        state.selAnki = false;
        if (sw) { sw.classList.remove('on'); sw.setAttribute('aria-checked', 'false'); }
    } else if (ankiRow) {
        ankiRow.classList.remove('disabled');
    }
}

function selectLearnMode(mode) {
    state.selLearn = mode;
    renderModeSelectUI();
}
function selectFormat(fmt) {
    state.selFormat = fmt;
    renderModeSelectUI();
}
function toggleAnkisheet() {
    if (state.selFormat === 'listening') return; // リスニング時は無効
    state.selAnki = !state.selAnki;
    renderModeSelectUI();
}

// スタート: 選択状態から実際のモードを決めて開始
function startFromModeSelect() {
    const words = getFilteredModeWords();
    if (words.length === 0) {
        alert('対象の単語がありません');
        return;
    }
    state.currentWords = words;

    if (state.selLearn === 'card') {
        state.quizMode = 'card';
        startCardFlip(words);
        return;
    }
    // 4択系: 形式と暗記シートから quizMode を決定
    let mode;
    if (state.selFormat === 'listening') mode = 'listening';
    else if (state.selAnki) mode = 'ankisheet';
    else if (state.selFormat === 'ja2zh') mode = 'jp2en';
    else mode = 'quiz'; // zh2ja(中→日)
    state.quizMode = mode;
    startQuiz(words);
}

// 旧API互換(他から呼ばれた場合)
function startMode(mode) {
    state.quizMode = mode;
    if (mode === 'quiz' || mode === 'listening' || mode === 'ankisheet' || mode === 'jp2en') {
        startQuiz(state.currentWords);
    } else if (mode === 'card') {
        startCardFlip(state.currentWords);
    }
}

// ============ QUICK SESSION ============
function startQuickSession(type) {
    const all = getAllWords();
    const data = getMasteryData();
    let filtered = [];

    if (type === 'unlearned') {
        filtered = all.filter(w => { const m = data[w.w]; return !m || m.level === 'unlearned'; });
    } else if (type === 'weak') {
        filtered = all.filter(w => { const m = data[w.w]; return m && m.level === 'weak'; });
    } else if (type === 'review') {
        filtered = shuffleArray([...all]);
    } else if (type === 'due') {
        filtered = getWordsDueForReview();
    } else if (type === 'mywords') {
        filtered = getMyWords().map(w => ({ ...w, rank: 'My単語帳', section: 'My' }));
    }

    if (filtered.length === 0) {
        const msgs = {
            unlearned: '未学習の単語がありません！',
            weak: '苦手な単語がありません！',
            due: '復習が必要な単語はありません！',
            mywords: 'My単語帳に単語がありません。\n設定から追加してください。',
        };
        alert(msgs[type] || '単語がありません');
        return;
    }

    // 母集団は絞らず全件をモード選択へ渡す(フィルタチップの件数・進捗リングを正しく表示するため)。
    // 実際の出題数は startQuiz / startCardFlip 側で設定値に従って切る。
    state.currentWords = shuffleArray([...filtered]);
    state.sessionSource = type;
    state.previousView = 'view-home';
    state.currentRank = null;
    state.currentSection = null;
    showModeSelect();
}

// ============ QUIZ ENGINE (supports all 4 quiz modes) ============
function startQuiz(words) {
    const limit = getSettings().quizCount;
    state.quizWords = shuffleArray([...words]).slice(0, limit);
    state.quizIndex = 0;
    state.quizResults = [];
    state.quizStartTime = Date.now();
    state.quizStreak = 0;
    updateStreakBadge();

    showView('view-quiz');
    document.getElementById('quiz-total').textContent = state.quizWords.length;

    // Mode label
    const modeLabels = { quiz: '4択テスト', listening: 'リスニング', ankisheet: '暗記シート', jp2en: '日→中テスト' };
    document.getElementById('quiz-mode-label').textContent = modeLabels[state.quizMode] || '';

    showQuizWord();
}

function showQuizWord() {
    if (state.quizIndex >= state.quizWords.length) {
        endQuiz();
        return;
    }

    const word = state.quizWords[state.quizIndex];
    document.getElementById('quiz-current').textContent = state.quizIndex + 1;
    updateSessionBar('quiz-session-fill', state.quizIndex, state.quizWords.length);

    const quizWordEl = document.getElementById('quiz-word');
    const optionsEl = document.getElementById('quiz-options');
    const skipBtn = document.getElementById('btn-skip');
    const allWords = getAllWords();

    // Reset ankisheet reveal state
    document.getElementById('ankisheet-reveal-area').style.display = 'none';
    optionsEl.style.display = '';
    skipBtn.style.visibility = 'visible';

    // ピンイン・発音ボタンを既定状態(非表示)にリセット
    setQuizPinyin('');
    const speakBtn = document.getElementById('quiz-speak');
    if (speakBtn) speakBtn.style.display = 'none';

    if (state.quizMode === 'listening') {
        // LISTENING MODE: hide word, play audio
        quizWordEl.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-sound"/></svg>';
        quizWordEl.style.animation = 'none';
        requestAnimationFrame(() => { quizWordEl.style.animation = 'wordIn 0.3s ease'; });
        speakWord(word.w);
        if (speakBtn) speakBtn.style.display = ''; // もう一度聞けるように

        // 4 Japanese options
        const wrongOptions = shuffleArray(allWords.filter(w => w.m !== word.m)).slice(0, 3);
        const options = shuffleArray([word, ...wrongOptions]);
        renderQuizOptions(options, word, 'm');

    } else if (state.quizMode === 'jp2en') {
        // JP→EN MODE: show Japanese, pick English
        quizWordEl.textContent = word.m;
        quizWordEl.style.animation = 'none';
        requestAnimationFrame(() => { quizWordEl.style.animation = 'wordIn 0.3s ease'; });

        const wrongOptions = shuffleArray(allWords.filter(w => w.w !== word.w)).slice(0, 3);
        const options = shuffleArray([word, ...wrongOptions]);
        renderQuizOptions(options, word, 'w');

    } else if (state.quizMode === 'ankisheet') {
        // ANKISHEET MODE: show word, hide options, self-grade
        quizWordEl.textContent = word.w;
        quizWordEl.style.animation = 'none';
        requestAnimationFrame(() => { quizWordEl.style.animation = 'wordIn 0.3s ease'; });
        optionsEl.style.display = 'none';
        skipBtn.style.visibility = 'hidden';
        setQuizPinyin(word.p);
        if (speakBtn) speakBtn.style.display = '';
        speakWord(word.w); // 問題が変わったら自動で発音

        const revealArea = document.getElementById('ankisheet-reveal-area');
        const answerEl = document.getElementById('ankisheet-answer');
        const tapReveal = document.getElementById('ankisheet-tap');
        const gradeButtons = document.getElementById('ankisheet-grade');

        answerEl.textContent = word.m;
        answerEl.style.display = 'none';
        tapReveal.style.display = 'block';
        gradeButtons.style.display = 'none';
        revealArea.style.display = 'block';

        tapReveal.onclick = () => {
            answerEl.style.display = 'block';
            tapReveal.style.display = 'none';
            gradeButtons.style.display = 'flex';
        };

        document.getElementById('ankisheet-knew').onclick = () => handleAnkiGrade(word, true);
        document.getElementById('ankisheet-didnt').onclick = () => handleAnkiGrade(word, false);

        // No timer for ankisheet
        return;

    } else {
        // STANDARD 4-CHOICE QUIZ
        quizWordEl.textContent = word.w;
        quizWordEl.style.animation = 'none';
        requestAnimationFrame(() => { quizWordEl.style.animation = 'wordIn 0.3s ease'; });
        setQuizPinyin(word.p);
        if (speakBtn) speakBtn.style.display = '';
        speakWord(word.w); // 問題が変わったら自動で発音

        const wrongOptions = shuffleArray(allWords.filter(w => w.m !== word.m)).slice(0, 3);
        const options = shuffleArray([word, ...wrongOptions]);
        renderQuizOptions(options, word, 'm');
    }

    // Start timer (for quiz, listening, jp2en)
    startQuizTimer();
}

function renderQuizOptions(options, correctWord, displayField) {
    const optionsEl = document.getElementById('quiz-options');
    optionsEl.innerHTML = '';
    const correctValue = displayField === 'm' ? correctWord.m : correctWord.w;

    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        // 番号(1〜4) + ラベル の2要素構成
        const num = document.createElement('span');
        num.className = 'quiz-option-num';
        num.textContent = i + 1;
        const label = document.createElement('span');
        label.className = 'quiz-option-label';
        label.textContent = opt[displayField];
        btn.appendChild(num);
        btn.appendChild(label);
        const isCorrect = opt[displayField] === correctValue;
        btn.onclick = () => handleQuizAnswer(btn, isCorrect, correctWord, correctValue, displayField);
        optionsEl.appendChild(btn);
    });
}

function handleAnkiGrade(word, knew) {
    const result = updateWordMastery(word.w, knew, knew ? 1500 : 3500);
    state.quizResults.push({ word, correct: knew, responseTime: 0, grade: result.grade, level: result.level });
    state.quizIndex++;
    showQuizWord();
}

function startQuizTimer() {
    clearTimeout(state.timerInterval);
    const duration = getSettings().quizTime * 1000; // 制限時間(設定値・秒→ms)
    state.timerRemaining = duration;
    const timerFill = document.getElementById('quiz-timer-fill');
    timerFill.style.transition = 'none';
    timerFill.style.width = '100%';
    timerFill.classList.remove('warning');

    requestAnimationFrame(() => {
        timerFill.style.transition = `width ${duration}ms linear`;
        timerFill.style.width = '0%';
    });

    state.timerStart = Date.now();
    state.timerInterval = setTimeout(() => {
        handleTimeUp();
    }, duration);
}

function handleTimeUp() {
    const word = state.quizWords[state.quizIndex];
    const result = updateWordMastery(word.w, false, 3000);
    state.quizResults.push({ word, correct: false, responseTime: 3000, grade: 'bad', level: result.level });

    flashJudge(false); // 時間切れも赤フラッシュ

    // 連続正解リセット
    state.quizStreak = 0;
    updateStreakBadge();

    const correctField = (state.quizMode === 'jp2en') ? 'w' : 'm';
    const correctValue = word[correctField];
    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        opt.classList.add('disabled');
        const optLabel = opt.querySelector('.quiz-option-label');
        const optText = optLabel ? optLabel.textContent : opt.textContent;
        if (optText === correctValue) opt.classList.add('correct'); // 正解を緑表示
    });
    document.getElementById('btn-skip').style.visibility = 'hidden';

    // Show the word if listening mode
    if (state.quizMode === 'listening') {
        document.getElementById('quiz-word').textContent = word.w;
        setQuizPinyin(word.p);
    }

    setTimeout(() => { state.quizIndex++; showQuizWord(); }, 1200);
}

function handleQuizAnswer(btn, isCorrect, word, correctValue, displayField) {
    clearTimeout(state.timerInterval);
    const responseTime = Date.now() - state.timerStart;

    const result = updateWordMastery(word.w, isCorrect, responseTime);
    state.quizResults.push({ word, correct: isCorrect, responseTime, grade: result.grade, level: result.level });

    // 瞬時フィードバック: 全画面フラッシュ
    flashJudge(isCorrect);

    // 連続正解カウント更新
    state.quizStreak = isCorrect ? (state.quizStreak + 1) : 0;
    updateStreakBadge();

    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        opt.classList.add('disabled');
        const optLabel = opt.querySelector('.quiz-option-label');
        const optText = optLabel ? optLabel.textContent : opt.textContent;
        if (optText === correctValue) {
            // 正解の選択肢は常に緑に光る
            opt.classList.add('correct');
        }
    });
    // 不正解時: 選んだ誤答を灰色に光らせる(正解は上で緑になっている → 2つ光る)
    if (!isCorrect) btn.classList.add('chosen-wrong');

    document.getElementById('btn-skip').style.visibility = 'hidden';

    // Show word in listening mode
    if (state.quizMode === 'listening') {
        document.getElementById('quiz-word').textContent = word.w;
        setQuizPinyin(word.p);
    }

    setTimeout(() => { state.quizIndex++; showQuizWord(); }, isCorrect ? 600 : 1200);
}

function skipWord() {
    clearTimeout(state.timerInterval);
    const word = state.quizWords[state.quizIndex];
    setWordMastery(word.w, 'weak');
    state.quizResults.push({ word, correct: false, responseTime: 0, skipped: true, grade: 'bad' });
    // SKIPは不正解扱い → 連続正解をリセット
    state.quizStreak = 0;
    updateStreakBadge();
    state.quizIndex++;
    showQuizWord();
}

function endQuiz() {
    clearTimeout(state.timerInterval);
    const totalTime = Date.now() - state.quizStartTime;
    const correct = state.quizResults.filter(r => r.correct).length;
    const total = state.quizResults.length;
    addSessionStat(total, totalTime);
    showResults(correct, total, totalTime, state.quizResults);
}

function confirmExitQuiz() {
    if (confirm('学習を終了しますか？')) {
        clearTimeout(state.timerInterval);
        showView('view-home');
        updateHomeStats();
    }
}

// ============ 判定フラッシュ & 進捗バー (UX強化) ============
// 正誤を視線移動なしで認識させる全画面フラッシュ(約220ms)
function flashJudge(isCorrect) {
    const el = document.querySelector('.view.active .judge-flash') || document.getElementById('judge-flash');
    if (!el) return;
    const cls = isCorrect ? 'flash-correct' : 'flash-wrong';
    el.classList.remove('flash-correct', 'flash-wrong');
    // リフローを強制して連続フラッシュでもアニメを再生
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 240);
}

// セッション進捗バーを更新(数字を読ませず無意識に進捗を伝える)
function updateSessionBar(fillId, index, total) {
    const fill = document.getElementById(fillId);
    if (!fill) return;
    const pct = total > 0 ? Math.round((index / total) * 100) : 0;
    fill.style.width = pct + '%';
}

// 連続正解バッジ(2問以上で「N問連続正解中！」を表示)
function updateStreakBadge() {
    const badge = document.getElementById('quiz-streak-badge');
    if (!badge) return;
    if (state.quizStreak >= 2) {
        badge.textContent = `${state.quizStreak}問連続正解中！`;
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}

// ============ SPEECH SYNTHESIS (Listening Mode) ============
// 中国語(普通話)の読み上げ。zh-CN の音声が利用できればそれを優先する。
let _zhVoice = null;
function pickChineseVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    // zh-CN / zh_CN / zh-Hans を優先、なければ任意の中国語音声
    return voices.find(v => /zh[-_]?(CN|Hans)/i.test(v.lang))
        || voices.find(v => /^zh/i.test(v.lang))
        || null;
}
if ('speechSynthesis' in window) {
    _zhVoice = pickChineseVoice();
    // 音声リストは非同期で読み込まれることがあるため再取得
    window.speechSynthesis.onvoiceschanged = () => { _zhVoice = pickChineseVoice(); };
}
function speakWord(word) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = 'zh-CN';
    if (!_zhVoice) _zhVoice = pickChineseVoice();
    if (_zhVoice) utter.voice = _zhVoice;
    utter.rate = (getSettings().speechRate || 85) / 100; // 設定の音声速度
    window.speechSynthesis.speak(utter);
}

// 現在表示中のクイズ単語を読み上げる(🔊ボタン用)
function speakCurrentWord() {
    const word = state.quizWords[state.quizIndex];
    if (word) speakWord(word.w);
}

// 現在表示中のカード単語を読み上げる(🔊ボタン用)
function speakCardWord() {
    const word = state.cardWords[state.cardIndex];
    if (word) speakWord(word.w);
}

// ピンイン要素の表示ヘルパー
function setQuizPinyin(text) {
    const el = document.getElementById('quiz-pinyin');
    if (el) el.textContent = text || '';
}

// ============ CARD FLIP ============
function startCardFlip(words) {
    const limit = getSettings().cardCount;
    state.cardWords = shuffleArray([...words]).slice(0, limit);
    state.cardUnknown = [];
    state.cardIndex = 0;
    state.cardFlipped = false;
    state.quizStartTime = Date.now();
    state.quizResults = [];

    showView('view-card');
    document.getElementById('card-total').textContent = state.cardWords.length;
    initCardSwipe();
    showCardWord();
}

function showCardWord() {
    if (state.cardIndex >= state.cardWords.length) {
        if (state.cardUnknown.length > 0) {
            state.cardWords = shuffleArray([...state.cardUnknown]);
            state.cardUnknown = [];
            state.cardIndex = 0;
            showCardWord();
            return;
        }
        endCardFlip();
        return;
    }

    const word = state.cardWords[state.cardIndex];
    document.getElementById('card-current').textContent = state.cardIndex + 1;
    document.getElementById('card-remaining-count').textContent = state.cardWords.length - state.cardIndex;
    document.getElementById('card-word').textContent = word.w;
    document.getElementById('card-meaning').textContent = word.m;
    const cardPy = word.p || '';
    document.getElementById('card-pinyin').textContent = cardPy;
    document.getElementById('card-pinyin-back').textContent = cardPy;

    state.cardFlipped = false;
    const inner = document.getElementById('flip-card-inner');
    inner.classList.remove('flipped');
    inner.style.transform = ''; // 前カードのドラッグ変形をリセット
    // スワイプラベルを初期化
    const kl = document.getElementById('swipe-label-known');
    const ul = document.getElementById('swipe-label-unknown');
    if (kl) { kl.style.opacity = 0; kl.style.transform = 'translateY(-50%) rotate(-12deg) scale(0.6)'; }
    if (ul) { ul.style.opacity = 0; ul.style.transform = 'translateY(-50%) rotate(12deg) scale(0.6)'; }
    // 進捗バー(覚えた数 / 全体)
    const known = state.quizResults.filter(r => r.correct).length;
    updateSessionBar('card-session-fill', known, state.cardWords.length + known);
    speakWord(word.w); // カードが変わったら自動で発音
}

function flipCard() {
    state.cardFlipped = !state.cardFlipped;
    document.getElementById('flip-card-inner').classList.toggle('flipped', state.cardFlipped);
}

function cardAnswer(known) {
    const word = state.cardWords[state.cardIndex];
    if (known) {
        updateWordMastery(word.w, true, 1500);
        state.quizResults.push({ word, correct: true, responseTime: 0 });
    } else {
        state.cardUnknown.push(word);
        updateWordMastery(word.w, false, 3000);
        state.quizResults.push({ word, correct: false, responseTime: 0 });
    }
    flashJudge(known);
    state.cardIndex++;
    showCardWord();
}

// ============ カードのスワイプ仕分け (mikan風の手触り) ============
let _cardDrag = null;
function initCardSwipe() {
    const card = document.getElementById('flip-card');
    if (!card || card.dataset.swipeInit) return;
    card.dataset.swipeInit = '1';

    const THRESHOLD = 90;       // この距離を超えたら確定
    const labelKnown = () => document.getElementById('swipe-label-known');
    const labelUnknown = () => document.getElementById('swipe-label-unknown');
    const inner = () => document.getElementById('flip-card-inner');

    const onDown = (clientX, clientY) => {
        if (card.classList.contains('fly-left') || card.classList.contains('fly-right')) return;
        _cardDrag = { x: clientX, y: clientY, dx: 0, dy: 0, moved: false };
        card.classList.add('dragging');
        card.classList.remove('snap-back');
    };
    const onMove = (clientX, clientY) => {
        if (!_cardDrag) return;
        _cardDrag.dx = clientX - _cardDrag.x;
        _cardDrag.dy = clientY - _cardDrag.y;
        // 縦より横が優勢なときだけドラッグ扱い
        if (Math.abs(_cardDrag.dx) > 6) _cardDrag.moved = true;
        const dx = _cardDrag.dx;
        const rot = dx / 18;
        if (inner()) inner().style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
        // ラベルの不透明度・拡大をドラッグ量に連動
        const ratio = Math.min(Math.abs(dx) / THRESHOLD, 1);
        if (dx > 0) {
            const l = labelKnown();
            if (l) { l.style.opacity = ratio; l.style.transform = `translateY(-50%) rotate(-12deg) scale(${0.6 + ratio * 0.5})`; }
            const u = labelUnknown(); if (u) u.style.opacity = 0;
        } else if (dx < 0) {
            const u = labelUnknown();
            if (u) { u.style.opacity = ratio; u.style.transform = `translateY(-50%) rotate(12deg) scale(${0.6 + ratio * 0.5})`; }
            const l = labelKnown(); if (l) l.style.opacity = 0;
        }
    };
    const onUp = () => {
        if (!_cardDrag) return;
        const dx = _cardDrag.dx;
        const moved = _cardDrag.moved;
        card.classList.remove('dragging');
        const knownL = labelKnown(), unknownL = labelUnknown();

        if (Math.abs(dx) >= THRESHOLD) {
            // 確定: カードを飛ばして仕分け
            const known = dx > 0;
            card.classList.add(known ? 'fly-right' : 'fly-left');
            if (knownL) knownL.style.opacity = 0;
            if (unknownL) unknownL.style.opacity = 0;
            setTimeout(() => {
                card.classList.remove('fly-right', 'fly-left');
                if (inner()) inner().style.transform = '';
                cardAnswer(known);
            }, 300);
        } else {
            // 戻す(スナップバック)
            card.classList.add('snap-back');
            if (inner()) inner().style.transform = '';
            if (knownL) { knownL.style.opacity = 0; knownL.style.transform = 'translateY(-50%) rotate(-12deg) scale(0.6)'; }
            if (unknownL) { unknownL.style.opacity = 0; unknownL.style.transform = 'translateY(-50%) rotate(12deg) scale(0.6)'; }
            // ほぼ動いていなければタップ = めくり
            if (!moved && Math.abs(dx) < 6) flipCard();
            setTimeout(() => card.classList.remove('snap-back'), 300);
        }
        _cardDrag = null;
    };

    // タッチ
    card.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    card.addEventListener('touchmove', e => {
        if (_cardDrag && Math.abs(e.touches[0].clientX - _cardDrag.x) > Math.abs(e.touches[0].clientY - _cardDrag.y)) {
            e.preventDefault(); // 横スワイプ時はスクロール抑制
        }
        onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    card.addEventListener('touchend', onUp);

    // マウス(PC確認用)
    card.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => { if (_cardDrag) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (_cardDrag) onUp(); });
}

function endCardFlip() {
    const totalTime = Date.now() - state.quizStartTime;
    const correct = state.quizResults.filter(r => r.correct).length;
    const total = state.quizResults.length;
    addSessionStat(total, totalTime);
    showResults(correct, total, totalTime, state.quizResults);
}

// ============ RESULTS (Enhanced with speed grades) ============
function showResults(correct, total, timeMs, results) {
    showView('view-results');
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Richer praise (Section 9.3)
    let praise;
    if (pct === 100) {
        const p = ['パーフェクト！天才！', '全問正解！完璧だ！', '100%！すごすぎる！'];
        praise = p[Math.floor(Math.random() * p.length)];
    } else if (pct >= 90) {
        const p = ['すごい！ほぼ完璧！', 'Excellent！素晴らしい！', 'あと少しで満点！'];
        praise = p[Math.floor(Math.random() * p.length)];
    } else if (pct >= 70) {
        const p = ['いい調子！あと少し！', 'Good job！着実に成長中！', 'よくできました！'];
        praise = p[Math.floor(Math.random() * p.length)];
    } else if (pct >= 50) {
        const p = ['まだまだいける！', '半分以上正解！次はもっと！', '復習して完璧にしよう！'];
        praise = p[Math.floor(Math.random() * p.length)];
    } else {
        const p = ['大丈夫！繰り返しが大事！', 'ここから伸びる！一緒に頑張ろう！', '苦手を克服していこう！'];
        praise = p[Math.floor(Math.random() * p.length)];
    }

    document.getElementById('results-praise').textContent = praise;
    document.getElementById('result-correct').textContent = correct;
    document.getElementById('result-wrong').textContent = total - correct;
    document.getElementById('result-time').textContent = Math.round(timeMs / 1000) + 's';
    document.getElementById('score-text').textContent = pct + '%';

    // Animate ring
    const circumference = 2 * Math.PI * 52;
    const ring = document.getElementById('score-ring-fill');
    ring.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
        ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
    });

    // Word list with speed grades
    const listEl = document.getElementById('results-word-list');
    listEl.innerHTML = '';

    const seen = new Set();
    const uniqueResults = results.filter(r => {
        if (seen.has(r.word.w)) return false;
        seen.add(r.word.w);
        return true;
    });

    const data = getMasteryData();
    const gradeLabels = { excellent: 'Excellent', great: 'Great', good: 'Good', bad: 'Bad' };
    const gradeClasses = { excellent: 'grade-excellent', great: 'grade-great', good: 'grade-good', bad: 'grade-bad' };

    uniqueResults.forEach(r => {
        const m = data[r.word.w] || { level: 'unlearned' };
        const item = document.createElement('div');
        item.className = 'result-word-item';

        const badgeClass = `badge-${m.level}`;
        const levelLabels = { perfect: '完璧', almost: 'ほぼ覚えた', vague: 'うろ覚え', weak: '苦手', unlearned: '未学習' };

        const gradeTag = r.grade && gradeLabels[r.grade]
            ? `<span class="speed-grade ${gradeClasses[r.grade] || ''}">${gradeLabels[r.grade]}</span>`
            : '';

        item.innerHTML = `
      <span class="result-word-en">${r.word.w}</span>
      <span class="result-word-jp">${r.word.m}</span>
      ${gradeTag}
      <span class="result-mastery-badge ${badgeClass}" data-word="${r.word.w}" onclick="cycleMastery(this)">${levelLabels[m.level]}</span>
    `;
        listEl.appendChild(item);
    });

    if (pct >= 80) launchConfetti();
}

function cycleMastery(badge) {
    const word = badge.dataset.word;
    const levels = ['weak', 'vague', 'almost', 'perfect'];
    const labels = { weak: '苦手', vague: 'うろ覚え', almost: 'ほぼ覚えた', perfect: '完璧' };
    const classes = { weak: 'badge-weak', vague: 'badge-vague', almost: 'badge-almost', perfect: 'badge-perfect' };

    const current = getWordMastery(word).level;
    const currentIdx = levels.indexOf(current);
    const nextIdx = (currentIdx + 1) % levels.length;
    const nextLevel = levels[nextIdx];

    setWordMastery(word, nextLevel);
    badge.textContent = labels[nextLevel];
    badge.className = `result-mastery-badge ${classes[nextLevel]}`;
}

// ============ SESSION ACTIONS ============
function retrySession() {
    if (state.sessionSource && String(state.sessionSource).startsWith('pinyin')) {
        if (typeof retryPinyinSession === 'function') retryPinyinSession();
        return;
    }
    if (state.sessionSource === 'section') {
        state.quizMode = 'quiz';
        startQuiz(getSectionWords(state.currentRank, state.currentSection));
    } else {
        startQuickSession(state.sessionSource);
    }
}

function reviewWeak() {
    const weakResults = state.quizResults.filter(r => !r.correct);
    if (weakResults.length === 0) {
        alert('苦手な単語がありません！');
        return;
    }
    state.currentWords = weakResults.map(r => r.word);
    state.sessionSource = 'weak';
    showModeSelect();
}

function nextSection() {
    if (!state.currentRank) {
        showView('view-home');
        updateHomeStats();
        return;
    }
    const sections = Object.keys(VOCAB_DATA[state.currentRank] || {});
    const currentIdx = sections.indexOf(state.currentSection);

    if (currentIdx < sections.length - 1) {
        state.currentSection = sections[currentIdx + 1];
        state.currentWords = getSectionWords(state.currentRank, state.currentSection);
        state.sessionSource = 'section';
        showModeSelect();
    } else {
        const ranks = Object.keys(VOCAB_DATA);
        const rankIdx = ranks.indexOf(state.currentRank);
        if (rankIdx < ranks.length - 1) {
            state.currentRank = ranks[rankIdx + 1];
            const nextSections = Object.keys(VOCAB_DATA[state.currentRank]);
            state.currentSection = nextSections[0];
            state.currentWords = getSectionWords(state.currentRank, state.currentSection);
            state.sessionSource = 'section';
            showModeSelect();
        } else {
            alert('全セクション完了！おめでとう！');
            showView('view-home');
            updateHomeStats();
        }
    }
}

// ============ LEARNING DATA VIEW ============
function updateDataView() {
    const stats = getStats();
    const counts = countByMastery();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const masteredCount = counts.perfect + counts.almost;

    document.getElementById('data-streak').textContent = stats.streak || 0;
    document.getElementById('data-total-learned').textContent = masteredCount;
    document.getElementById('data-sessions').textContent = stats.totalSessions || 0;

    // Title
    const title = getUserTitle(masteredCount);
    document.getElementById('data-title').textContent = title.title;

    const totalMinutes = Math.round((stats.totalTimeMs || 0) / 60000);
    document.getElementById('data-time').textContent = totalMinutes >= 60
        ? Math.floor(totalMinutes / 60) + '時間' + (totalMinutes % 60) + '分'
        : totalMinutes + '分';

    // Mastery bars
    const barsEl = document.getElementById('mastery-bars');
    barsEl.innerHTML = '';
    const levels = [
        { key: 'perfect', label: '完璧に覚えた', cls: 'fill-perfect' },
        { key: 'almost', label: 'ほぼ覚えた', cls: 'fill-almost' },
        { key: 'vague', label: 'うろ覚え', cls: 'fill-vague' },
        { key: 'weak', label: '苦手', cls: 'fill-weak' },
        { key: 'unlearned', label: '未学習', cls: 'fill-unlearned' },
    ];

    levels.forEach(l => {
        const pct = total > 0 ? (counts[l.key] / total * 100) : 0;
        const row = document.createElement('div');
        row.className = 'mastery-bar-row';
        row.innerHTML = `
      <span class="mastery-bar-label">${l.label}</span>
      <div class="mastery-bar-track">
        <div class="mastery-bar-fill ${l.cls}" style="width:${pct}%"></div>
      </div>
      <span class="mastery-bar-count">${counts[l.key]}</span>
    `;
        barsEl.appendChild(row);
    });

    // Weekly chart
    const weeklyEl = document.getElementById('weekly-chart');
    weeklyEl.innerHTML = '';
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const today = new Date();
    let maxWords = 1;
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const count = (stats.weekly || {})[key] || 0;
        if (count > maxWords) maxWords = count;
        weekData.push({ day: days[d.getDay()], count, isToday: i === 0 });
    }
    weekData.forEach(d => {
        const height = Math.max(2, (d.count / maxWords) * 80);
        const bar = document.createElement('div');
        bar.className = 'weekly-bar';
        bar.innerHTML = `
      <span class="weekly-bar-value">${d.count || ''}</span>
      <div class="weekly-bar-fill" style="height:${height}px; ${d.isToday ? 'background:var(--orange);' : ''}"></div>
      <span class="weekly-bar-label" style="${d.isToday ? 'color:var(--orange);font-weight:700;' : ''}">${d.day}</span>
    `;
        weeklyEl.appendChild(bar);
    });
}

// ============ PLACEMENT TEST (Section 9.4 / Section 5) ============
function checkPlacementTest() {
    const stats = getStats();
    if (stats.placementDone) return;

    const data = getMasteryData();
    if (Object.keys(data).length > 0) {
        stats.placementDone = true;
        saveStats(stats);
        return;
    }

    showView('view-placement');
}

function startPlacementTest() {
    const stats = getStats();
    stats.placementDone = true;
    saveStats(stats);

    // Sample 5 words from each rank (20 total)
    const sampleWords = [];
    for (const rank of Object.keys(VOCAB_DATA)) {
        const rankWords = getWordsByRank(rank);
        const sampled = shuffleArray([...rankWords]).slice(0, 5);
        sampleWords.push(...sampled);
    }

    state.currentWords = sampleWords;
    state.sessionSource = 'placement';
    state.quizMode = 'quiz';
    state.placementDone = false;
    startQuiz(sampleWords);
}

function skipPlacementTest() {
    const stats = getStats();
    stats.placementDone = true;
    saveStats(stats);
    showView('view-home');
    updateHomeStats();
}

// Show placement result recommendation
function getPlacementRecommendation(results) {
    const ranks = Object.keys(VOCAB_DATA);
    const scoreByRank = {};

    for (const r of results) {
        const rank = r.word.rank || 'Rank 1';
        if (!scoreByRank[rank]) scoreByRank[rank] = { correct: 0, total: 0 };
        scoreByRank[rank].total++;
        if (r.correct) scoreByRank[rank].correct++;
    }

    for (const rank of ranks) {
        const s = scoreByRank[rank];
        if (!s || s.correct / s.total < 0.6) {
            return rank;
        }
    }
    return ranks[ranks.length - 1];
}

// ============ MY WORDS VIEW ============
function renderMyWords() {
    const list = document.getElementById('mywords-list');
    const words = getMyWords();
    list.innerHTML = '';

    if (words.length === 0) {
        list.innerHTML = '<div class="empty-state">まだ単語が登録されていません。<br>下のフォームから追加してください。</div>';
        return;
    }

    words.forEach(w => {
        const item = document.createElement('div');
        item.className = 'myword-item';
        item.innerHTML = `
      <span class="myword-en">${w.w}</span>
      <span class="myword-jp">${w.m}</span>
      <button class="myword-delete" onclick="deleteMyWord('${w.w.replace(/'/g, "\\'")}')">✕</button>
    `;
        list.appendChild(item);
    });
}

function addMyWordFromForm() {
    const enInput = document.getElementById('myword-input-en');
    const jpInput = document.getElementById('myword-input-jp');
    const en = enInput.value.trim();
    const jp = jpInput.value.trim();

    if (!en || !jp) {
        alert('中国語と意味の両方を入力してください');
        return;
    }

    if (addMyWord(en, jp)) {
        enInput.value = '';
        jpInput.value = '';
        renderMyWords();
    } else {
        alert('この単語は既に登録されています');
    }
}

function deleteMyWord(word) {
    removeMyWord(word);
    renderMyWords();
}

// ============ SETTINGS ============
function resetProgress() {
    if (confirm('全ての学習データをリセットしますか？\nこの操作は元に戻せません。')) {
        localStorage.removeItem('mikan_mastery');
        localStorage.removeItem('mikan_stats');
        localStorage.removeItem('mikan_mywords');
        localStorage.removeItem('mikan_pystats');
        updateHomeStats();
        alert('リセットしました');
    }
}

// ============ CONFETTI ============
function launchConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#FF6D00', '#FF9E40', '#66BB6A', '#42A5F5', '#FFC107', '#FF5252', '#AB47BC'];

    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.animationDuration = (1.5 + Math.random()) + 's';
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (6 + Math.random() * 8) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        container.appendChild(piece);
    }
    setTimeout(() => { container.innerHTML = ''; }, 3000);
}

// ============ UTILITY ============
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    renderCourses();
    updateHomeStats();

    // Check if placement test needed
    checkPlacementTest();

    // Override results for placement test
    const origShowResults = showResults;
    // We patch endQuiz for placement
    const origEndQuiz = endQuiz;
});

// Override showResults to detect placement test completion
const _origShowResults = showResults;
showResults = function (correct, total, timeMs, results) {
    _origShowResults(correct, total, timeMs, results);

    if (state.sessionSource === 'placement') {
        const rec = getPlacementRecommendation(results);
        const el = document.createElement('div');
        el.className = 'placement-result-banner';
        el.innerHTML = `
      <div class="placement-rec">
        <span class="placement-rec-icon"><svg class="i" aria-hidden="true"><use href="#i-target"/></svg></span>
        <div>
          <strong>あなたの推定スタートレベル</strong><br>
          <span class="placement-rec-rank">${rec}</span> からの学習がおすすめ！
        </div>
      </div>
    `;
        const resultsHeader = document.querySelector('.results-header');
        resultsHeader.after(el);
        state.sessionSource = null;
    }
};
