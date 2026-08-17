/* =========================================================
   LMFギフトンツール - LINE風チャットUI (chat.js)
   Gift/Tyrant機能をチャット対話形式で実装。
   相性計算ロジックは元ツール(script.js)の calculateScore を移植。
   ========================================================= */

// ---------- 定数 ----------
const LS_KEY_GIFT_INPUT = 'line_gift_last_input';
const LS_KEY_BLOODLINE = 'mf_bloodline_data';       // 元ツールと互換のキー名
const LS_KEY_NOBLE = 'mf_sim_noble_data';           // 元ツールと互換のキー名
const LS_KEY_OWNED_AURA = 'line_owned_road_aura';   // 所持ロード秘伝オーラ（詳細探索で使用予定）

const ROAD_AURA_COLORS = [
    { key: '赤', hex: '#8B0000' },
    { key: '青', hex: '#1a3a8B' },
    { key: '黄', hex: '#7a6a00' },
    { key: '緑', hex: '#0a5a0a' },
    { key: '白', hex: '#999999' },
    { key: '黒', hex: '#222222' },
];

const SYMBOL_COLOR = { '👑': '#f4c95d', '☆': '#f4c95d', '◎': '#06c755', '○': '#8aa0ab', '△': '#8aa0ab', '×': '#e0563f' };

// ---------- 計算ロジック（元ツールから移植） ----------
function getComb(youngerIdx, olderIdx) {
    if (youngerIdx === null || olderIdx === null) return 0;
    if (!COMPATIBILITY_MATRIX[youngerIdx]) return 0;
    return COMPATIBILITY_MATRIX[youngerIdx][olderIdx] || 0;
}

function calculateScore(childId, fId, ffId, fmId, mId, mfId, mmId, sec3, sec2, noble) {
    if ([childId, fId, ffId, fmId, mId, mfId, mmId].some(v => v === null)) return 0;
    let term1 = getComb(childId, fId);
    let term2 = Math.min(getComb(fId, ffId), getComb(childId, ffId));
    let term3 = Math.min(getComb(fId, fmId), getComb(childId, fmId));
    let term4 = getComb(childId, mId);
    let term5 = Math.min(getComb(mId, mfId), getComb(childId, mfId));
    let term6 = Math.min(getComb(mId, mmId), getComb(childId, mmId));
    let term7 = getComb(fId, mId);
    let base = 224;
    let bonus = (sec2 * 5) + (sec3 * 12.5) + Number(noble);
    return term1 + term2 + term3 + term4 + term5 + term6 + term7 + base + bonus;
}

function getSymbol(score) {
    if (score >= 660) return "👑";
    if (score >= 614) return "☆";
    if (score >= 490) return "◎";
    if (score >= 374) return "○";
    if (score >= 255) return "△";
    return "×";
}

function imgOf(idx) { return `images/${MONSTER_IMAGE_FILES[MONSTER_NAMES[idx]]}`; }
function imgOfName(name) { return `images/${MONSTER_IMAGE_FILES[name]}`; }

// ---------- ノーブルデータ ----------
let currentNobleData = { ...DEFAULT_NOBLE_DATA };
(function loadNobleData() {
    try {
        const saved = localStorage.getItem(LS_KEY_NOBLE);
        if (saved) currentNobleData = { ...DEFAULT_NOBLE_DATA, ...JSON.parse(saved) };
    } catch (e) { /* ignore */ }
})();

// =========================================================
// チャットログ描画ユーティリティ
// =========================================================
const chatLog = document.getElementById('chat-log');

function scrollChatToBottom() {
    requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight + 999; });
}

function nowTime() {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function appendRow(sender, innerHTML, withTime = true) {
    const row = document.createElement('div');
    row.className = `msg-row ${sender}`;
    row.innerHTML = `<div class="msg-stack">${innerHTML}${withTime ? `<div class="msg-time">${nowTime()}</div>` : ''}</div>`;
    chatLog.appendChild(row);
    scrollChatToBottom();
    return row;
}

function botTypingRow() {
    return appendRow('bot', `<div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`, false);
}

// Bot発言。delay後にタイピングを実際のメッセージへ差し替える
function botMessage(html, { delay = 420 } = {}) {
    return new Promise(resolve => {
        const typingRow = botTypingRow();
        setTimeout(() => {
            typingRow.querySelector('.msg-stack').innerHTML = `<div class="bubble">${html}</div><div class="msg-time">${nowTime()}</div>`;
            scrollChatToBottom();
            resolve(typingRow);
        }, delay);
    });
}

function userMessage(html) {
    appendRow('user', `<div class="bubble">${html}</div>`);
}

function userMonsterCard(idx, label) {
    userMessage(`<div class="bubble-card"><div><div class="cc-label">${label}</div><div class="cc-name">${MONSTER_NAMES[idx]}</div></div><img src="${imgOf(idx)}" onerror="this.style.display='none'"></div>`);
}

function sysNote(text) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'center';
    row.innerHTML = `<div class="sys-note">${text}</div>`;
    chatLog.appendChild(row);
    scrollChatToBottom();
}

function clearQuickReplies() {
    const existing = document.getElementById('active-quick-replies');
    if (existing) existing.remove();
}

function showQuickReplies(options) {
    clearQuickReplies();
    const bar = document.createElement('div');
    bar.id = 'active-quick-replies';
    bar.className = 'quick-replies';
    options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'quick-reply';
        b.textContent = opt.label;
        b.onclick = () => { clearQuickReplies(); userMessage(opt.label); opt.onClick(); };
        bar.appendChild(b);
    });
    chatLog.parentElement.insertBefore(bar, document.getElementById('bottom-menu'));
    scrollChatToBottom();
}

// =========================================================
// モンスター選択トレイ
// =========================================================
const tray = document.getElementById('picker-tray');
const trayOverlay = document.getElementById('tray-overlay');
const trayBody = document.getElementById('tray-body');
const trayTitle = document.getElementById('tray-title');

function openTray(title) {
    trayTitle.textContent = title;
    tray.classList.add('show');
    trayOverlay.classList.add('show');
}
function closeTray() {
    tray.classList.remove('show');
    trayOverlay.classList.remove('show');
}

function pickMonsterViaTray(title) {
    return new Promise(resolve => {
        trayBody.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'monster-grid';
        MONSTER_NAMES.forEach((name, idx) => {
            const cell = document.createElement('div');
            cell.className = 'monster-cell';
            cell.innerHTML = `<img src="${imgOf(idx)}" onerror="this.style.opacity=0"><span>${name}</span>`;
            cell.onclick = () => { closeTray(); resolve(idx); };
            grid.appendChild(cell);
        });
        trayBody.appendChild(grid);
        openTray(title);
    });
}

// =========================================================
// スライダー入力（吹き出し内インタラクティブUI）
// =========================================================
let sliderStepCounter = 0;

function askSliderStep({ label, min, max, def, formatValue, note }) {
    return new Promise(resolve => {
        sliderStepCounter++;
        const uid = `sl-${sliderStepCounter}`;
        botMessage(`
            <div class="slider-bubble">
                <div class="sb-label">${label}${note ? `<br><span style="opacity:.7">${note}</span>` : ''}</div>
                <div class="sb-label">現在値：<span class="sb-value" id="${uid}-val">${formatValue ? formatValue(def) : def}</span></div>
                <div class="slider-row">
                    <button class="adj-btn" id="${uid}-minus">−</button>
                    <input type="range" id="${uid}-range" min="${min}" max="${max}" value="${def}">
                    <button class="adj-btn" id="${uid}-plus">＋</button>
                </div>
                <div class="bubble-buttons"><button class="bubble-btn" id="${uid}-ok">この値で決定</button></div>
            </div>
        `).then(() => {
            const range = document.getElementById(`${uid}-range`);
            const valEl = document.getElementById(`${uid}-val`);
            const update = v => { valEl.textContent = formatValue ? formatValue(v) : v; };
            range.addEventListener('input', () => update(Number(range.value)));
            document.getElementById(`${uid}-minus`).onclick = () => { range.value = Math.max(min, Number(range.value) - 1); update(Number(range.value)); };
            document.getElementById(`${uid}-plus`).onclick = () => { range.value = Math.min(max, Number(range.value) + 1); update(Number(range.value)); };
            document.getElementById(`${uid}-ok`).onclick = () => {
                const v = Number(range.value);
                // 操作不能化
                [`${uid}-minus`, `${uid}-plus`, `${uid}-ok`].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
                range.disabled = true;
                userMessage(`${label}：<b>${formatValue ? formatValue(v) : v}</b>`);
                resolve(v);
            };
        });
    });
}

function askNobleStep() {
    return new Promise(resolve => {
        sliderStepCounter++;
        const uid = `nb-${sliderStepCounter}`;
        let mode = 'val'; // 'val' or 'star'
        botMessage(`
            <div class="slider-bubble">
                <div class="segment-mini">
                    <div id="${uid}-m-star">★(ノーブル秘伝の個数)</div>
                    <div id="${uid}-m-val" class="active">123(加算値を直接入力)</div>
                </div>
                <div class="sb-label">ノーブル加算値：<span class="sb-value" id="${uid}-val">0</span></div>
                <div class="slider-row">
                    <button class="adj-btn" id="${uid}-minus">−</button>
                    <input type="range" id="${uid}-range" min="0" max="300" value="0">
                    <button class="adj-btn" id="${uid}-plus">＋</button>
                </div>
                <div class="bubble-buttons"><button class="bubble-btn" id="${uid}-ok">この値で決定</button></div>
            </div>
        `).then(() => {
            const range = document.getElementById(`${uid}-range`);
            const valEl = document.getElementById(`${uid}-val`);
            const mStar = document.getElementById(`${uid}-m-star`);
            const mVal = document.getElementById(`${uid}-m-val`);

            function computedNoble() {
                const raw = Number(range.value);
                if (mode === 'star') return raw === 0 ? 0 : (currentNobleData[raw] || 0);
                return raw;
            }
            function refresh() {
                valEl.textContent = mode === 'star' ? `${computedNoble()} (★${range.value})` : computedNoble();
            }
            function setMode(m) {
                mode = m;
                mStar.classList.toggle('active', m === 'star');
                mVal.classList.toggle('active', m === 'val');
                range.max = m === 'star' ? 36 : 300;
                range.value = 0;
                refresh();
            }
            mStar.onclick = () => setMode('star');
            mVal.onclick = () => setMode('val');
            range.addEventListener('input', refresh);
            document.getElementById(`${uid}-minus`).onclick = () => { range.value = Math.max(Number(range.min), Number(range.value) - 1); refresh(); };
            document.getElementById(`${uid}-plus`).onclick = () => { range.value = Math.min(Number(range.max), Number(range.value) + 1); refresh(); };
            document.getElementById(`${uid}-ok`).onclick = () => {
                const noble = computedNoble();
                [`${uid}-minus`, `${uid}-plus`, `${uid}-ok`].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
                range.disabled = true; mStar.style.pointerEvents = 'none'; mVal.style.pointerEvents = 'none';
                userMessage(`ノーブル加算値：<b>${noble}</b>`);
                resolve(noble);
            };
        });
    });
}

// =========================================================
// Gift / Tyrant フロー
// =========================================================
const GIFT_STEPS = [
    { key: 'f', label: '父親', q: 'まずは【父親】を選んでください👇' },
    { key: 'ff', label: '祖父（父方）', q: '次に【父方の祖父】を選んでください👇' },
    { key: 'fm', label: '祖母（父方）', q: '続いて【父方の祖母】を選んでください👇' },
    { key: 'm', label: '母親', q: '次は【母親】です👇' },
    { key: 'mf', label: '祖父（母方）', q: '【母方の祖父】を選んでください👇' },
    { key: 'mm', label: '祖母（母方）', q: '最後に【母方の祖母】を選んでください👇' },
];

let giftInput = { f: null, ff: null, fm: null, m: null, mf: null, mm: null, s3: 0, s2: 0, noble: 0 };
let giftFlowRunning = false;

function saveGiftInput() {
    try { localStorage.setItem(LS_KEY_GIFT_INPUT, JSON.stringify(giftInput)); } catch (e) { /* ignore */ }
}
function loadGiftInput() {
    try {
        const raw = localStorage.getItem(LS_KEY_GIFT_INPUT);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

async function runGiftMonsterSteps(prefill) {
    for (const step of GIFT_STEPS) {
        if (prefill && prefill[step.key] !== null && prefill[step.key] !== undefined) {
            giftInput[step.key] = prefill[step.key];
            continue;
        }
        await botMessage(step.q);
        const idx = await pickMonsterViaTray(`${step.label}を選択`);
        giftInput[step.key] = idx;
        userMonsterCard(idx, step.label);
    }
}

async function runGiftValueSteps(prefill) {
    if (prefill && prefill.s3 !== undefined) { giftInput.s3 = prefill.s3; }
    else { giftInput.s3 = await askSliderStep({ label: '共通秘伝III の所持数は？', min: 0, max: 20, def: 0, formatValue: v => `${v}個` }); }

    if (prefill && prefill.s2 !== undefined) { giftInput.s2 = prefill.s2; }
    else { giftInput.s2 = await askSliderStep({ label: '共通秘伝II の所持数は？', min: 0, max: 20, def: 0, formatValue: v => `${v}個` }); }

    if (prefill && prefill.noble !== undefined) { giftInput.noble = prefill.noble; }
    else { giftInput.noble = await askNobleStep(); }
}

function giftSummaryHTML() {
    const rows = GIFT_STEPS.map(s => `<div class="bubble-card" style="margin-bottom:4px;"><img src="${imgOf(giftInput[s.key])}" onerror="this.style.display='none'"><div><div class="cc-label">${s.label}</div><div class="cc-name">${MONSTER_NAMES[giftInput[s.key]]}</div></div></div>`).join('');
    return `
        <div style="font-weight:700; margin-bottom:6px;">入力内容の確認</div>
        ${rows}
        <div style="margin-top:6px; font-size:0.82rem; color:var(--muted);">
            共通秘伝III：${giftInput.s3}個 ／ 共通秘伝II：${giftInput.s2}個 ／ ノーブル加算：${giftInput.noble}
        </div>
    `;
}

function computeGiftResults() {
    const { f, ff, fm, m, mf, mm, s3, s2, noble } = giftInput;
    let results = [];
    MONSTER_NAMES.forEach((name, idx) => {
        const score = calculateScore(idx, f, ff, fm, m, mf, mm, s3, s2, noble);
        results.push({ id: idx, name, score, symbol: getSymbol(score) });
    });
    results.sort((a, b) => b.score - a.score);
    return results;
}

function resultSummaryHTML(results) {
    const top5 = results.slice(0, 5);
    const rows = top5.map((r, i) => `
        <div class="result-summary-row">
            <span class="rank">${i + 1}</span>
            <img src="${imgOf(r.id)}" onerror="this.style.display='none'">
            <span>${r.symbol} ${r.name}</span>
            <span class="score">${r.score.toFixed(1)}</span>
        </div>
    `).join('');
    return `
        <div style="font-weight:700; margin-bottom:4px;">計算結果（上位5体）</div>
        <div class="result-summary-list">${rows}</div>
    `;
}

function openDetailPanelWithResults(results) {
    document.getElementById('detail-panel-title').textContent = `計算結果一覧（全${results.length}体）`;
    const body = document.getElementById('detail-panel-body');
    body.innerHTML = `<div class="result-grid">${results.map((r, i) => `
        <div class="result-cell">
            <div class="rc-symbol" style="color:${SYMBOL_COLOR[r.symbol]}">${r.symbol}</div>
            <img src="${imgOf(r.id)}" onerror="this.style.display='none'">
            <div class="rc-name">${i + 1}. ${r.name}</div>
            <div class="rc-score">${r.score.toFixed(1)}</div>
        </div>
    `).join('')}</div>`;
    document.getElementById('detail-panel').classList.add('show');
    document.getElementById('detail-overlay').classList.add('show');
}
function closeDetailPanel() {
    document.getElementById('detail-panel').classList.remove('show');
    document.getElementById('detail-overlay').classList.remove('show');
}

async function afterResultsMenu() {
    showQuickReplies([
        { label: '🔁 親だけ変更して再計算', onClick: () => startGiftFlow({ mode: 'keep-values' }) },
        { label: '🆕 最初からやり直す', onClick: () => startGiftFlow({ mode: 'fresh' }) },
        { label: '💾 この内容のまま終了', onClick: async () => { saveGiftInput(); await botMessage('保存しました。次回起動時にこの内容を呼び出せます。'); } },
    ]);
}

async function startGiftFlow(opts = {}) {
    if (giftFlowRunning) return;
    giftFlowRunning = true;
    clearQuickReplies();
    setHeader('gift');

    let prefillMonsters = null;
    let prefillValues = null;

    if (opts.mode === 'restore') {
        prefillMonsters = opts.data;
        prefillValues = opts.data;
    } else if (opts.mode === 'keep-values') {
        prefillValues = { s3: giftInput.s3, s2: giftInput.s2, noble: giftInput.noble };
    } else if (opts.mode === 'fresh') {
        // no prefill
        await botMessage('了解です、最初から入力していきましょう！');
    } else if (!opts.mode) {
        await botMessage('タイラント計算を始めましょう🎁<br>親・祖父母を6体選んで、共通秘伝とノーブル値を入力すると、育成候補モンスターの相性ランキングを計算します。');
    }

    giftInput = { f: null, ff: null, fm: null, m: null, mf: null, mm: null, s3: 0, s2: 0, noble: 0 };

    await runGiftMonsterSteps(prefillMonsters);
    await runGiftValueSteps(prefillValues);

    await botMessage(giftSummaryHTML());
    showQuickReplies([
        { label: '✅ この内容で計算する', onClick: runGiftCalculation },
        { label: '✏️ もう一度入力し直す', onClick: () => startGiftFlow({ mode: 'fresh' }) },
    ]);

    giftFlowRunning = false;
}

async function runGiftCalculation() {
    clearQuickReplies();
    await botMessage('計算しています…🔮');
    const results = computeGiftResults();
    saveGiftInput();
    await botMessage(resultSummaryHTML(results));
    appendResultDetailButton(results);
    await afterResultsMenu();
}

function appendResultDetailButton(results) {
    const rows = chatLog.querySelectorAll('.msg-row.bot');
    const last = rows[rows.length - 1];
    const bubble = last.querySelector('.bubble');
    const btnWrap = document.createElement('div');
    btnWrap.className = 'bubble-buttons';
    btnWrap.innerHTML = `<button class="bubble-btn">📋 詳細な全体ランキングを見る</button>`;
    btnWrap.querySelector('button').onclick = () => openDetailPanelWithResults(results);
    bubble.appendChild(btnWrap);
}

// =========================================================
// 起動時：前回入力の復元チェック
// =========================================================
async function maybeOfferRestore() {
    const saved = loadGiftInput();
    const hasAllMonsters = saved && GIFT_STEPS.every(s => saved[s.key] !== null && saved[s.key] !== undefined);
    if (!hasAllMonsters) {
        await startGiftFlow();
        return;
    }
    sysNote('前回の入力データを読み込みました');
    await botMessage('前回入力した内容が保存されています。この内容を引き継いで計算しますか？');
    showQuickReplies([
        { label: '▶️ 前回の内容で再開', onClick: () => startGiftFlow({ mode: 'restore', data: saved }) },
        { label: '🆕 新しく入力する', onClick: () => startGiftFlow({ mode: 'fresh' }) },
    ]);
}

// =========================================================
// 下部メニュー（機能切替）
// =========================================================
const FEATURE_META = {
    gift: { title: 'ギフトンBot', icon: '🎁' },
    reverse: { title: '補完探索Bot', icon: '🧩' },
    detail: { title: '詳細探索Bot', icon: '🎯' },
    general: { title: '汎用探索Bot', icon: '🔍' },
};

function setHeader(feature) {
    const meta = FEATURE_META[feature];
    document.getElementById('header-title').textContent = meta.title;
    document.getElementById('header-bot-avatar').textContent = meta.icon;
    document.querySelectorAll('.menu-item').forEach(el => el.classList.toggle('active', el.dataset.feature === feature));
}

async function selectFeature(feature) {
    closeAnySubView();
    setHeader(feature);
    if (feature === 'gift') {
        if (!giftFlowRunning) {
            clearQuickReplies();
            sysNote('Gift/Tyrant タブに切り替えました');
            await maybeOfferRestore();
        }
        return;
    }
    clearQuickReplies();
    sysNote(`${FEATURE_META[feature].title.replace('Bot', '')} タブに切り替えました`);
    await botMessage(`${FEATURE_META[feature].icon} この機能は現在チャットUI対応の準備中です。<br>まずはGift/Tyrant機能から会話型に作り直しています。今しばらくお待ちください🙏`);
    showQuickReplies([
        { label: '🎁 Gift/Tyrantを使う', onClick: () => selectFeature('gift') },
    ]);
}

function closeAnySubView() {
    closeTray();
    closeDetailPanel();
    closeSettingsPanel();
}

// =========================================================
// 設定パネル（データ管理・血統データ）
// =========================================================
function loadBloodlineData() {
    try {
        const raw = localStorage.getItem(LS_KEY_BLOODLINE);
        if (raw) return { ...JSON.parse(JSON.stringify(DEFAULT_BLOODLINE_DATA)), ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_BLOODLINE_DATA));
}
let bloodlineData = loadBloodlineData();

function saveBloodlineData() {
    try { localStorage.setItem(LS_KEY_BLOODLINE, JSON.stringify(bloodlineData)); } catch (e) { /* ignore */ }
}

function renderBloodlineTable() {
    const container = document.getElementById('bloodline-table');
    container.innerHTML = MONSTER_NAMES.map(name => {
        const data = bloodlineData[name] || {};
        const checks = AURA_LABELS.map(aura => {
            const on = !!data[aura];
            return `<div class="bl-check ${on ? 'on' : ''}" data-aura="${aura}" data-name="${name}">${aura === 'ノーブル' ? '⭐' : aura}</div>`;
        }).join('');
        return `<div class="bl-row"><img src="${imgOfName(name)}" onerror="this.style.display='none'"><div class="bl-name">${name}</div><div class="bl-checks">${checks}</div></div>`;
    }).join('');

    container.querySelectorAll('.bl-check').forEach(el => {
        el.onclick = () => {
            const name = el.dataset.name, aura = el.dataset.aura;
            if (!bloodlineData[name]) bloodlineData[name] = {};
            bloodlineData[name][aura] = !bloodlineData[name][aura];
            el.classList.toggle('on', !!bloodlineData[name][aura]);
            saveBloodlineData();
        };
    });
}

function bloodlineCheckAll(value) {
    MONSTER_NAMES.forEach(name => {
        if (!bloodlineData[name]) bloodlineData[name] = {};
        AURA_LABELS.forEach(a => bloodlineData[name][a] = value);
    });
    saveBloodlineData();
    renderBloodlineTable();
}

// ---- 所持ロード秘伝オーラ（赤青黄緑白黒／詳細探索で使用予定） ----
function loadOwnedAura() {
    try {
        const raw = localStorage.getItem(LS_KEY_OWNED_AURA);
        if (raw) return { ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    // デフォルトは全て未所持
    const d = {}; ROAD_AURA_COLORS.forEach(c => d[c.key] = false); return d;
}
let ownedAuraData = loadOwnedAura();
function saveOwnedAura() {
    try { localStorage.setItem(LS_KEY_OWNED_AURA, JSON.stringify(ownedAuraData)); } catch (e) { /* ignore */ }
}

function renderOwnedAuraTab() {
    const container = document.getElementById('owned-aura-grid');
    container.innerHTML = ROAD_AURA_COLORS.map(c => `
        <div class="aura-toggle ${ownedAuraData[c.key] ? 'on' : ''}" data-aura="${c.key}" style="--aura-color:${c.hex}">
            <div class="aura-swatch"></div>
            <div class="aura-label">${c.key}</div>
            <div class="aura-state">${ownedAuraData[c.key] ? '所持ずみ' : '未所持'}</div>
        </div>
    `).join('');
    container.querySelectorAll('.aura-toggle').forEach(el => {
        el.onclick = () => {
            const key = el.dataset.aura;
            ownedAuraData[key] = !ownedAuraData[key];
            saveOwnedAura();
            renderOwnedAuraTab();
        };
    });
}

function switchSettingsTab(tab) {
    document.getElementById('stab-bloodline').classList.toggle('active', tab === 'bloodline');
    document.getElementById('stab-owned-aura').classList.toggle('active', tab === 'owned-aura');
    document.getElementById('stab-about').classList.toggle('active', tab === 'about');
    document.getElementById('settings-view-bloodline').style.display = tab === 'bloodline' ? 'block' : 'none';
    document.getElementById('settings-view-owned-aura').style.display = tab === 'owned-aura' ? 'block' : 'none';
    document.getElementById('settings-view-about').style.display = tab === 'about' ? 'block' : 'none';
    if (tab === 'owned-aura') renderOwnedAuraTab();
}

function openSettingsPanel() {
    renderBloodlineTable();
    document.getElementById('settings-panel').classList.add('show');
    document.getElementById('settings-overlay').classList.add('show');
}
function closeSettingsPanel() {
    document.getElementById('settings-panel').classList.remove('show');
    document.getElementById('settings-overlay').classList.remove('show');
}

function resetAllData() {
    if (!confirm('保存されている入力データと血統データをすべて削除します。よろしいですか？')) return;
    localStorage.removeItem(LS_KEY_GIFT_INPUT);
    localStorage.removeItem(LS_KEY_BLOODLINE);
    localStorage.removeItem(LS_KEY_OWNED_AURA);
    bloodlineData = JSON.parse(JSON.stringify(DEFAULT_BLOODLINE_DATA));
    ownedAuraData = loadOwnedAura();
    renderBloodlineTable();
    renderOwnedAuraTab();
    alert('削除しました。');
}

// =========================================================
// 初期化
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    setHeader('gift');
    maybeOfferRestore();
});
