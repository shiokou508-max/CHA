/* ====================================================
   pinyin.js — ピンイン学習モード & マスコット & 音声強化
   (オリジナルキャラクター・オリジナル実装)
   ==================================================== */

/* ============ オリジナルマスコット (SVG生成) ============ */
let _mascotUid = 0;

function mascotSVG(mood = 'normal') {
    const uid = 'mk' + (++_mascotUid);
    const bodyId = uid + 'b', leafId = uid + 'l';

    // 表情パーツ
    let eyes, mouth, extra = '';
    switch (mood) {
        case 'cheer': // 大喜び (結果100点・お祝い)
            eyes = `<path d="M39 65 Q44 59 49 65" stroke="#4E342E" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                    <path d="M71 65 Q76 59 81 65" stroke="#4E342E" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
            mouth = `<path d="M49 76 Q60 93 71 76 Z" fill="#5D2E1A"/>
                     <ellipse cx="60" cy="83" rx="6" ry="3.5" fill="#FF8A65"/>`;
            extra = `<path d="M16 38 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2-5.4 -5.4-2.2 5.4-2.2z" fill="#FFC107"/>
                     <path d="M101 26 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8-4.4 -4.4-1.8 4.4-1.8z" fill="#FFC107"/>`;
            break;
        case 'happy': // にっこり (好成績)
            eyes = `<circle cx="44" cy="66" r="4.2" fill="#4E342E"/><circle cx="76" cy="66" r="4.2" fill="#4E342E"/>
                    <circle cx="45.5" cy="64.5" r="1.4" fill="#fff"/><circle cx="77.5" cy="64.5" r="1.4" fill="#fff"/>`;
            mouth = `<path d="M50 78 Q60 90 70 78 Z" fill="#5D2E1A"/>
                     <ellipse cx="60" cy="83" rx="5" ry="3" fill="#FF8A65"/>`;
            break;
        case 'fight': // がんばろう (要復習)
            eyes = `<circle cx="44" cy="67" r="4" fill="#4E342E"/><circle cx="76" cy="67" r="4" fill="#4E342E"/>
                    <path d="M37 58 L50 61.5" stroke="#4E342E" stroke-width="3" stroke-linecap="round"/>
                    <path d="M83 58 L70 61.5" stroke="#4E342E" stroke-width="3" stroke-linecap="round"/>`;
            mouth = `<path d="M52 81 Q60 77.5 68 81" stroke="#4E342E" stroke-width="3" fill="none" stroke-linecap="round"/>`;
            break;
        case 'wow': // びっくり
            eyes = `<circle cx="44" cy="66" r="5" fill="#4E342E"/><circle cx="76" cy="66" r="5" fill="#4E342E"/>
                    <circle cx="46" cy="64" r="1.7" fill="#fff"/><circle cx="78" cy="64" r="1.7" fill="#fff"/>`;
            mouth = `<ellipse cx="60" cy="82" rx="5.5" ry="6.5" fill="#5D2E1A"/>`;
            break;
        default: // normal にこにこ
            eyes = `<circle cx="44" cy="66" r="4.2" fill="#4E342E"/><circle cx="76" cy="66" r="4.2" fill="#4E342E"/>
                    <circle cx="45.5" cy="64.5" r="1.4" fill="#fff"/><circle cx="77.5" cy="64.5" r="1.4" fill="#fff"/>`;
            mouth = `<path d="M51 79 Q60 86 69 79" stroke="#4E342E" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    }

    return `<svg class="mascot-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
            <linearGradient id="${bodyId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FFB347"/>
                <stop offset="100%" stop-color="#FF8A00"/>
            </linearGradient>
            <linearGradient id="${leafId}" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#8BC34A"/>
                <stop offset="100%" stop-color="#558B2F"/>
            </linearGradient>
        </defs>
        <ellipse cx="60" cy="110" rx="30" ry="5" fill="rgba(120,70,20,0.10)"/>
        <circle cx="60" cy="69" r="40" fill="url(#${bodyId})" stroke="#E65100" stroke-width="2.5"/>
        <ellipse cx="44" cy="52" rx="11" ry="6.5" fill="#FFD9A8" opacity="0.75" transform="rotate(-22 44 52)"/>
        <path d="M60 30 C60 24 62 21 65 18" stroke="#6D4C41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M60 29 C57 17 45 12 36 17 C40 28 51 32 60 29 Z" fill="url(#${leafId})"/>
        <circle cx="37" cy="77" r="6" fill="#FF7043" opacity="0.35"/>
        <circle cx="83" cy="77" r="6" fill="#FF7043" opacity="0.35"/>
        ${eyes}
        ${mouth}
        ${extra}
    </svg>`;
}

function setMascot(elementId, mood) {
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = mascotSVG(mood);
}

/* ============ ピンイン ユーティリティ ============ */
const PY_TONED = {
    a: ['a', 'ā', 'á', 'ǎ', 'à'],
    e: ['e', 'ē', 'é', 'ě', 'è'],
    i: ['i', 'ī', 'í', 'ǐ', 'ì'],
    o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
    u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
    'ü': ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

// 声調記号つき文字 → {base, tone}
const PY_REVERSE = (() => {
    const map = {};
    for (const base in PY_TONED) {
        PY_TONED[base].forEach((ch, tone) => { map[ch] = { base, tone }; });
    }
    return map;
})();

// 音節から声調(0=軽声, 1〜4)を検出
function pyDetectTone(syllable) {
    for (const ch of syllable) {
        const r = PY_REVERSE[ch];
        if (r && r.tone > 0) return r.tone;
    }
    return 0;
}

// 声調記号を外す
function pyStrip(syllable) {
    let out = '';
    for (const ch of syllable) {
        const r = PY_REVERSE[ch];
        out += r ? r.base : ch;
    }
    return out;
}

// 記号なし音節に声調をつける (表記ルール: a > e > o / iu→u / その他は最後の母音)
function pyApplyTone(plain, tone) {
    if (tone === 0) return plain;
    let idx = -1;
    if (plain.includes('a')) idx = plain.indexOf('a');
    else if (plain.includes('e')) idx = plain.indexOf('e');
    else if (plain.includes('o')) idx = plain.indexOf('o');
    else if (plain.endsWith('iu')) idx = plain.length - 1;
    else {
        for (let i = plain.length - 1; i >= 0; i--) {
            if ('iuü'.includes(plain[i])) { idx = i; break; }
        }
    }
    if (idx < 0) return plain;
    const base = plain[idx];
    if (!PY_TONED[base]) return plain;
    return plain.slice(0, idx) + PY_TONED[base][tone] + plain.slice(idx + 1);
}

// "nǐ hǎo" → ["nǐ","hǎo"] (NFC正規化で声調記号の分解表記にも対応)
function pySyllables(p) {
    return (p || '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
}

// 音節の声調を変えた表記を返す
function pyChangeTone(syllable, newTone) {
    return pyApplyTone(pyStrip(syllable), newTone);
}

const PY_TONE_NAMES = ['軽声', '第1声', '第2声', '第3声', '第4声'];
const PY_TONE_SHAPES = ['・', 'ˉ', 'ˊ', 'ˇ', 'ˋ'];

/* ============ ピンイン成績 ============ */
function getPyStats() {
    try { return JSON.parse(localStorage.getItem('mikan_pystats') || '{}'); }
    catch { return {}; }
}

function savePyStats(s) {
    localStorage.setItem('mikan_pystats', JSON.stringify(s));
}

function addPyStat(kind, correct, total) {
    const s = getPyStats();
    if (!s[kind]) s[kind] = { c: 0, t: 0 };
    s[kind].c += correct;
    s[kind].t += total;
    savePyStats(s);
}

/* ============ ピンインタブ ホーム ============ */
const PY_BUBBLES = [
    '声調がわかると<br>聞き取りがグッと楽になるよ！',
    'ピンインは中国語の<br>発音の設計図だよ！',
    '毎日少しずつ、<br>耳を鍛えていこう！',
    '第3声は低く抑えるのがコツ！',
    '発音表で迷ったら<br>いつでも確認してね！',
];

function renderPinyinHome() {
    const s = getPyStats();
    const fmt = (k) => {
        const d = s[k];
        if (!d || d.t === 0) return '正答率 --%';
        return `正答率 ${Math.round(d.c / d.t * 100)}% (${d.t}問)`;
    };
    const toneEl = document.getElementById('py-stat-tone');
    const choiceEl = document.getElementById('py-stat-choice');
    if (toneEl) toneEl.textContent = fmt('tone');
    if (choiceEl) choiceEl.textContent = fmt('choice');

    const bubble = document.getElementById('py-bubble');
    if (bubble) bubble.innerHTML = PY_BUBBLES[Math.floor(Math.random() * PY_BUBBLES.length)];
    setMascot('py-mascot-icon', 'normal');
}

/* ============ ピンインクイズ (声調 / 4択) ============ */
const pyState = {
    kind: 'tone',       // 'tone' | 'choice'
    words: [],
    index: 0,
    results: [],        // {word, correct, answerLabel}
    target: 0,          // 対象音節 index (tone)
    timer: null,
    timerStart: 0,
    startTime: 0,
    lock: false,
};

function pyQuizPool() {
    const all = getAllWords().filter(w => w.p && pySyllables(w.p).length > 0);
    return all;
}

function startPinyinQuiz(kind) {
    const count = getSettings().quizCount;
    let pool = pyQuizPool();

    if (kind === 'tone') {
        // 声調1〜4の音節を含む語のみ。短い語を優先
        pool = pool.filter(w => pySyllables(w.p).some(s => pyDetectTone(s) > 0));
        const short = pool.filter(w => pySyllables(w.p).length <= 2);
        if (short.length >= count * 2) pool = short;
    }

    if (pool.length === 0) {
        alert('出題できる単語がありません');
        return;
    }

    pyState.kind = kind;
    pyState.words = shuffleArray([...pool]).slice(0, count);
    pyState.index = 0;
    pyState.results = [];
    pyState.startTime = Date.now();
    pyState.lock = false;

    document.getElementById('pyquiz-total').textContent = pyState.words.length;
    document.getElementById('pyquiz-label').textContent = kind === 'tone' ? '声調クイズ' : 'ピンイン4択';

    showView('view-pyquiz');
    showPinyinQuestion();
}

function showPinyinQuestion() {
    if (pyState.index >= pyState.words.length) {
        endPinyinQuiz();
        return;
    }

    pyState.lock = false;
    const word = pyState.words[pyState.index];
    const syls = pySyllables(word.p);

    document.getElementById('pyquiz-current').textContent = pyState.index + 1;
    updateSessionBar('pyquiz-session-fill', pyState.index, pyState.words.length);

    const wordEl = document.getElementById('pyquiz-word');
    const subEl = document.getElementById('pyquiz-sub');
    const qEl = document.getElementById('pyquiz-question');
    const optsEl = document.getElementById('pyquiz-options');
    optsEl.innerHTML = '';

    wordEl.style.animation = 'none';
    requestAnimationFrame(() => { wordEl.style.animation = 'wordIn 0.3s ease'; });

    if (pyState.kind === 'tone') {
        // ---- 声調クイズ ----
        let candidates = syls.map((s, i) => ({ s, i, tone: pyDetectTone(s) })).filter(x => x.tone > 0);
        // 三声が連続する音節は声調変化(連読変調)で音が変わるため出題から外す
        const safe = candidates.filter(x =>
            !(x.tone === 3 && x.i + 1 < syls.length && pyDetectTone(syls[x.i + 1]) === 3));
        if (safe.length > 0) candidates = safe;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        pyState.target = pick.i;
        const correctTone = pick.tone;
        const plain = pyStrip(pick.s);

        // 漢字表示 (対象音節をハイライト)
        const chars = [...word.w];
        if (chars.length === syls.length) {
            wordEl.innerHTML = chars.map((c, i) =>
                i === pick.i ? `<span class="py-syll-hl">${c}</span>` : c
            ).join('');
        } else {
            wordEl.textContent = word.w;
        }

        qEl.textContent = '音声を聞いて声調を当てよう';
        subEl.textContent = `${plain} + ?`;

        // 選択肢: 同じ音節の4声調表記
        [1, 2, 3, 4].forEach((tone, i) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.innerHTML = `
                <span class="quiz-option-num">${i + 1}</span>
                <span class="quiz-option-label">${pyApplyTone(plain, tone)}</span>
                <span class="py-tone-shape">${PY_TONE_SHAPES[tone]} ${PY_TONE_NAMES[tone]}</span>`;
            btn.onclick = () => handlePinyinAnswer(btn, tone === correctTone, word, String(tone));
            optsEl.appendChild(btn);
        });
        pyState.correctLabel = pyApplyTone(plain, correctTone);

    } else {
        // ---- ピンイン4択 ----
        wordEl.textContent = word.w;
        qEl.textContent = '正しいピンインはどれ？';
        subEl.textContent = '';

        const correct = word.p;
        const options = new Set([correct]);

        // 声調違いの誤答を生成
        let guard = 0;
        while (options.size < 3 && guard++ < 40) {
            const idx = Math.floor(Math.random() * syls.length);
            const curTone = pyDetectTone(syls[idx]);
            let newTone = 1 + Math.floor(Math.random() * 4);
            if (newTone === curTone) newTone = (newTone % 4) + 1;
            const variant = syls.map((s, i) => i === idx ? pyChangeTone(s, newTone) : s).join(' ');
            if (variant !== correct) options.add(variant);
        }
        // 他の単語のピンイン (同音節数優先)
        const others = pyQuizPool().filter(w2 => w2.p !== correct && pySyllables(w2.p).length === syls.length);
        let guard2 = 0;
        while (options.size < 4 && guard2++ < 40) {
            const src = others.length > 0 ? others : pyQuizPool().filter(w2 => w2.p !== correct);
            if (src.length === 0) break;
            options.add(src[Math.floor(Math.random() * src.length)].p);
        }
        // 念のため埋める
        let guard3 = 0;
        while (options.size < 4 && guard3++ < 40) {
            const idx = Math.floor(Math.random() * syls.length);
            const t = 1 + Math.floor(Math.random() * 4);
            options.add(syls.map((s, i) => i === idx ? pyChangeTone(s, t) : s).join(' '));
        }

        const shuffled = shuffleArray([...options]).slice(0, 4);
        if (!shuffled.includes(correct)) { shuffled[0] = correct; shuffleArray(shuffled); }

        shuffled.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.innerHTML = `
                <span class="quiz-option-num">${i + 1}</span>
                <span class="quiz-option-label" style="font-family:var(--font-en);">${opt}</span>`;
            btn.onclick = () => handlePinyinAnswer(btn, opt === correct, word, opt);
            optsEl.appendChild(btn);
        });
        pyState.correctLabel = correct;
    }

    // 自動再生 + タイマー
    speakWord(word.w);
    startPinyinTimer();
}

function startPinyinTimer() {
    clearTimeout(pyState.timer);
    const duration = getSettings().quizTime * 1000;
    const fill = document.getElementById('pyquiz-timer-fill');
    if (fill) {
        fill.style.transition = 'none';
        fill.style.width = '100%';
        requestAnimationFrame(() => {
            fill.style.transition = `width ${duration}ms linear`;
            fill.style.width = '0%';
        });
    }
    pyState.timerStart = Date.now();
    pyState.timer = setTimeout(() => handlePinyinTimeout(), duration);
}

function handlePinyinTimeout() {
    if (pyState.lock) return;
    pyState.lock = true;
    const word = pyState.words[pyState.index];
    pyState.results.push({ word, correct: false });
    flashJudge(false);
    revealPinyinAnswer(null);
    setTimeout(() => { pyState.index++; showPinyinQuestion(); }, 1200);
}

function handlePinyinAnswer(btn, isCorrect, word, _label) {
    if (pyState.lock) return;
    pyState.lock = true;
    clearTimeout(pyState.timer);

    pyState.results.push({ word, correct: isCorrect });
    flashJudge(isCorrect);
    revealPinyinAnswer(isCorrect ? btn : null);
    if (!isCorrect && btn) btn.classList.add('chosen-wrong');

    setTimeout(() => { pyState.index++; showPinyinQuestion(); }, isCorrect ? 600 : 1300);
}

// 正解選択肢を緑表示 + サブにフルピンイン表示
function revealPinyinAnswer(_correctBtn) {
    const word = pyState.words[pyState.index];
    document.querySelectorAll('#pyquiz-options .quiz-option').forEach(opt => {
        opt.classList.add('disabled');
        const label = opt.querySelector('.quiz-option-label');
        if (label && label.textContent === pyState.correctLabel) opt.classList.add('correct');
    });
    const subEl = document.getElementById('pyquiz-sub');
    if (subEl) subEl.textContent = word.p;
}

function speakPinyinQuizWord() {
    const word = pyState.words[pyState.index];
    if (word) speakWord(word.w);
}

function confirmExitPinyin() {
    if (confirm('学習を終了しますか？')) {
        clearTimeout(pyState.timer);
        switchTab('view-pinyin');
    }
}

function endPinyinQuiz() {
    clearTimeout(pyState.timer);
    const totalTime = Date.now() - pyState.startTime;
    const correct = pyState.results.filter(r => r.correct).length;
    const total = pyState.results.length;

    addPyStat(pyState.kind, correct, total);
    addSessionStat(total, totalTime);
    state.sessionSource = 'pinyin-' + pyState.kind;

    showPinyinResults(correct, total, totalTime);
}

function retryPinyinSession() {
    startPinyinQuiz(pyState.kind);
}

/* ============ ピンイン専用リザルト ============ */
function showPinyinResults(correct, total, timeMs) {
    showView('view-results');
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    let praise;
    if (pct === 100) praise = 'パーフェクト！耳が育ってる！';
    else if (pct >= 80) praise = 'すごい！いい耳してる！';
    else if (pct >= 60) praise = 'いい調子！繰り返そう！';
    else praise = '発音表も見直してみよう！';

    document.getElementById('results-praise').textContent = praise;
    document.getElementById('result-correct').textContent = correct;
    document.getElementById('result-wrong').textContent = total - correct;
    document.getElementById('result-time').textContent = Math.round(timeMs / 1000) + 's';
    document.getElementById('score-text').textContent = pct + '%';
    setResultsMascotByPct(pct);

    const circumference = 2 * Math.PI * 52;
    const ring = document.getElementById('score-ring-fill');
    ring.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
        ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
    });

    // リスト: 漢字 / ピンイン / 正誤
    const listEl = document.getElementById('results-word-list');
    listEl.innerHTML = '';
    pyState.results.forEach(r => {
        const item = document.createElement('div');
        item.className = 'result-word-item';
        item.innerHTML = `
            <span class="result-word-en">${r.word.w}</span>
            <span class="py-result-pinyin">${r.word.p}</span>
            <span class="result-word-jp">${r.word.m}</span>
            <span class="py-result-mark ${r.correct ? 'ok' : 'ng'}">
                <svg class="i" aria-hidden="true"><use href="#${r.correct ? 'i-check' : 'i-x'}"/></svg>
            </span>`;
        listEl.appendChild(item);
    });

    // ピンインでは不要なボタンを隠す
    const weakBtn = document.getElementById('btn-weak-review');
    const nextBtn = document.getElementById('btn-next-section');
    if (weakBtn) weakBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';

    if (pct >= 80) launchConfetti();
}

/* ============ 発音表 ============ */
const PY_CHART = {
    tones: [
        { py: 'ā', name: '第1声', ex: '妈 mā', speak: '妈', desc: '高く平らに' },
        { py: 'á', name: '第2声', ex: '麻 má', speak: '麻', desc: '一気に上げる' },
        { py: 'ǎ', name: '第3声', ex: '马 mǎ', speak: '马', desc: '低く抑える' },
        { py: 'à', name: '第4声', ex: '骂 mà', speak: '骂', desc: '一気に下げる' },
        { py: 'a', name: '軽声', ex: '吗 ma', speak: '吗', desc: '軽く短く' },
    ],
    initials: [
        { py: 'b', ex: '玻 bō', speak: '玻' }, { py: 'p', ex: '坡 pō', speak: '坡' },
        { py: 'm', ex: '摸 mō', speak: '摸' }, { py: 'f', ex: '佛 fó', speak: '佛' },
        { py: 'd', ex: '得 dé', speak: '得' }, { py: 't', ex: '特 tè', speak: '特' },
        { py: 'n', ex: '讷 nè', speak: '讷' }, { py: 'l', ex: '勒 lè', speak: '勒' },
        { py: 'g', ex: '哥 gē', speak: '哥' }, { py: 'k', ex: '科 kē', speak: '科' },
        { py: 'h', ex: '喝 hē', speak: '喝' }, { py: 'j', ex: '基 jī', speak: '基' },
        { py: 'q', ex: '欺 qī', speak: '欺' }, { py: 'x', ex: '希 xī', speak: '希' },
        { py: 'zh', ex: '知 zhī', speak: '知' }, { py: 'ch', ex: '吃 chī', speak: '吃' },
        { py: 'sh', ex: '诗 shī', speak: '诗' }, { py: 'r', ex: '日 rì', speak: '日' },
        { py: 'z', ex: '资 zī', speak: '资' }, { py: 'c', ex: '雌 cí', speak: '雌' },
        { py: 's', ex: '思 sī', speak: '思' },
        { py: 'y', ex: '衣 yī', speak: '衣' }, { py: 'w', ex: '乌 wū', speak: '乌' },
    ],
    finalsGroups: [
        {
            title: '単母音',
            items: [
                { py: 'a', ex: '啊 ā', speak: '啊' }, { py: 'o', ex: '喔 ō', speak: '喔' },
                { py: 'e', ex: '鹅 é', speak: '鹅' }, { py: 'i', ex: '衣 yī', speak: '衣' },
                { py: 'u', ex: '乌 wū', speak: '乌' }, { py: 'ü', ex: '迂 yū', speak: '迂' },
                { py: 'er', ex: '儿 ér', speak: '儿' },
            ],
        },
        {
            title: '複母音・鼻母音',
            items: [
                { py: 'ai', ex: '哀 āi', speak: '哀' }, { py: 'ei', ex: '诶 ēi', speak: '诶' },
                { py: 'ao', ex: '熬 áo', speak: '熬' }, { py: 'ou', ex: '欧 ōu', speak: '欧' },
                { py: 'an', ex: '安 ān', speak: '安' }, { py: 'en', ex: '恩 ēn', speak: '恩' },
                { py: 'ang', ex: '昂 áng', speak: '昂' }, { py: 'eng', ex: '灯 dēng', speak: '灯' },
                { py: 'ong', ex: '东 dōng', speak: '东' },
            ],
        },
        {
            title: 'i ではじまる韻母',
            items: [
                { py: 'ia', ex: '鸭 yā', speak: '鸭' }, { py: 'ie', ex: '耶 yē', speak: '耶' },
                { py: 'iao', ex: '腰 yāo', speak: '腰' }, { py: 'iou', ex: '优 yōu', speak: '优' },
                { py: 'ian', ex: '烟 yān', speak: '烟' }, { py: 'in', ex: '音 yīn', speak: '音' },
                { py: 'iang', ex: '央 yāng', speak: '央' }, { py: 'ing', ex: '英 yīng', speak: '英' },
                { py: 'iong', ex: '雍 yōng', speak: '雍' },
            ],
        },
        {
            title: 'u ではじまる韻母',
            items: [
                { py: 'ua', ex: '蛙 wā', speak: '蛙' }, { py: 'uo', ex: '窝 wō', speak: '窝' },
                { py: 'uai', ex: '歪 wāi', speak: '歪' }, { py: 'uei', ex: '威 wēi', speak: '威' },
                { py: 'uan', ex: '弯 wān', speak: '弯' }, { py: 'uen', ex: '温 wēn', speak: '温' },
                { py: 'uang', ex: '汪 wāng', speak: '汪' }, { py: 'ueng', ex: '翁 wēng', speak: '翁' },
            ],
        },
        {
            title: 'ü ではじまる韻母',
            items: [
                { py: 'üe', ex: '约 yuē', speak: '约' }, { py: 'üan', ex: '冤 yuān', speak: '冤' },
                { py: 'ün', ex: '晕 yūn', speak: '晕' },
            ],
        },
    ],
};

let _pyChartKind = 'tones';

function showPinyinChart() {
    _pyChartKind = 'tones';
    updatePyChartTabs();
    renderPinyinChart();
    showView('view-pychart');
}

function switchPinyinChart(kind) {
    _pyChartKind = kind;
    updatePyChartTabs();
    renderPinyinChart();
}

function updatePyChartTabs() {
    document.querySelectorAll('.pychart-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.chart === _pyChartKind);
    });
}

function pyChartCell(item, extraHtml = '') {
    const cell = document.createElement('button');
    cell.className = 'pychart-cell';
    cell.innerHTML = `${extraHtml}<span class="pychart-cell-py">${item.py}</span><span class="pychart-cell-ex">${item.ex}</span>`;
    cell.onclick = () => {
        speakWord(item.speak);
        cell.classList.add('playing');
        setTimeout(() => cell.classList.remove('playing'), 700);
    };
    return cell;
}

function renderPinyinChart() {
    const content = document.getElementById('pychart-content');
    content.innerHTML = '';

    if (_pyChartKind === 'tones') {
        const grid = document.createElement('div');
        grid.className = 'pychart-grid tones';
        PY_CHART.tones.forEach(t => {
            grid.appendChild(pyChartCell(
                { py: t.py, ex: t.ex, speak: t.speak },
                `<span class="pychart-tone-name">${t.name}</span>`
            ));
        });
        content.appendChild(grid);

        // 説明
        const note = document.createElement('div');
        note.className = 'pychart-section-title';
        note.textContent = PY_CHART.tones.map(t => `${t.name}: ${t.desc}`).join(' ／ ');
        note.style.lineHeight = '1.8';
        content.appendChild(note);

    } else if (_pyChartKind === 'initials') {
        const title = document.createElement('div');
        title.className = 'pychart-section-title';
        title.textContent = '声母 (21) + y・w';
        content.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'pychart-grid';
        PY_CHART.initials.forEach(i => grid.appendChild(pyChartCell(i)));
        content.appendChild(grid);

    } else {
        PY_CHART.finalsGroups.forEach(group => {
            const title = document.createElement('div');
            title.className = 'pychart-section-title';
            title.textContent = group.title;
            content.appendChild(title);
            const grid = document.createElement('div');
            grid.className = 'pychart-grid';
            group.items.forEach(i => grid.appendChild(pyChartCell(i)));
            content.appendChild(grid);
        });
    }
}

/* ============ 今日の学習 (おまかせCTA) ============ */
function startTodaySession() {
    const due = getWordsDueForReview();
    if (due.length > 0) { startQuickSession('due'); return; }

    const all = getAllWords();
    const data = getMasteryData();
    const unlearned = all.some(w => { const m = data[w.w]; return !m || m.level === 'unlearned'; });
    if (unlearned) { startQuickSession('unlearned'); return; }

    const weak = all.some(w => { const m = data[w.w]; return m && m.level === 'weak'; });
    if (weak) { startQuickSession('weak'); return; }

    startQuickSession('review');
}

/* ============ リザルトのマスコット表情 ============ */
function setResultsMascotByPct(pct) {
    let mood = 'normal';
    if (pct === 100) mood = 'cheer';
    else if (pct >= 70) mood = 'happy';
    else if (pct >= 50) mood = 'normal';
    else mood = 'fight';
    setMascot('results-mascot', mood);
}

// 通常リザルト(app.js)にマスコット表情とボタン復帰を追加
const _pyPrevShowResults = showResults;
showResults = function (correct, total, timeMs, results) {
    // ピンインで隠したボタンを元に戻す
    const weakBtn = document.getElementById('btn-weak-review');
    const nextBtn = document.getElementById('btn-next-section');
    if (weakBtn) weakBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';

    _pyPrevShowResults(correct, total, timeMs, results);

    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    setResultsMascotByPct(pct);
};

/* ============ 初期化 (マスコット配置) ============ */
function initMikanUI() {
    setMascot('logo-mascot', 'normal');
    setMascot('home-mascot-icon', 'cheer');
    setMascot('py-mascot-icon', 'normal');
    setMascot('placement-mascot', 'happy');
    setMascot('milestone-mascot', 'cheer');
    setMascot('rankup-mascot', 'fight');
    setMascot('results-mascot', 'happy');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMikanUI);
} else {
    initMikanUI();
}
