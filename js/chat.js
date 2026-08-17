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
const LS_KEY_PATCH = 'mf_sim_patch_data';           // 基礎相性値の手動修正差分（元ツールと互換のキー名）

const ROAD_AURA_COLORS = [
    { key: '赤', hex: '#8B0000' },
    { key: '青', hex: '#1a3a8B' },
    { key: '黄', hex: '#7a6a00' },
    { key: '緑', hex: '#0a5a0a' },
    { key: '白', hex: '#999999' },
    { key: '黒', hex: '#222222' },
];

const SYMBOL_COLOR = { '👑': '#f4c95d', '☆': '#f4c95d', '◎': '#06c755', '○': '#8aa0ab', '△': '#8aa0ab', '×': '#e0563f' };

// ---------- 基礎相性値の手動修正（パッチ）システム ----------
// COMPATIBILITY_MATRIX の元データを退避し、ローカルストレージの差分(patchData)を重ねて適用する
let ORIGINAL_MATRIX = JSON.parse(JSON.stringify(COMPATIBILITY_MATRIX));
let patchData = {};
function loadPatchData() {
    try {
        const raw = localStorage.getItem(LS_KEY_PATCH);
        if (raw) patchData = JSON.parse(raw);
    } catch (e) { /* ignore */ }
}
function savePatchData() {
    try { localStorage.setItem(LS_KEY_PATCH, JSON.stringify(patchData)); } catch (e) { /* ignore */ }
}
function applyPatchToMatrix() {
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        for (let j = 0; j < MONSTER_NAMES.length; j++) {
            COMPATIBILITY_MATRIX[i][j] = ORIGINAL_MATRIX[i][j];
        }
    }
    for (const key in patchData) {
        const [c, p] = key.split('-').map(Number);
        if (!Number.isNaN(c) && !Number.isNaN(p) && COMPATIBILITY_MATRIX[c]) {
            COMPATIBILITY_MATRIX[c][p] += patchData[key];
        }
    }
}
loadPatchData();
applyPatchToMatrix(); // ページ読み込み時点で全ての計算に修正値を反映

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
// モンスター選択トレイ（キャンセル対応）
// =========================================================
const tray = document.getElementById('picker-tray');
const trayOverlay = document.getElementById('tray-overlay');
const trayBody = document.getElementById('tray-body');
const trayTitle = document.getElementById('tray-title');

let pendingTrayCancel = null; // トレイを閉じた（=選ばずに離脱した）ときに呼ばれるコールバック

function openTray(title) {
    trayTitle.textContent = title;
    tray.classList.add('show');
    trayOverlay.classList.add('show');
}
function closeTray() {
    tray.classList.remove('show');
    trayOverlay.classList.remove('show');
}
// 「閉じる」ボタン・オーバーレイタップ用：閉じてキャンセル通知する
function cancelTray() {
    closeTray();
    if (pendingTrayCancel) {
        const cb = pendingTrayCancel;
        pendingTrayCancel = null;
        cb();
    }
}

// 生のトレイ選択（1体・キャンセルするとonCancelが呼ばれ、Promiseは解決しない＝呼び出し元でリトライ可能にする）
function pickMonsterViaTrayRaw(title, onCancel) {
    return new Promise(resolve => {
        pendingTrayCancel = onCancel;
        trayBody.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'monster-grid';
        MONSTER_NAMES.forEach((name, idx) => {
            const cell = document.createElement('div');
            cell.className = 'monster-cell';
            cell.innerHTML = `<img src="${imgOf(idx)}" onerror="this.style.opacity=0"><span>${name}</span>`;
            cell.onclick = () => { pendingTrayCancel = null; closeTray(); resolve(idx); };
            grid.appendChild(cell);
        });
        trayBody.appendChild(grid);
        openTray(title);
    });
}

// 「タップして選ぶ」ボタン付きの吹き出しを出し、押されたらトレイを開く。
// トレイを選ばずに閉じた場合はボタンを再度押せる状態に戻す（詰まらないようにする）。
function askAndPickMonster(questionHtml, trayTitle) {
    return new Promise(resolve => {
        botMessage(`${questionHtml}<div class="bubble-buttons"><button class="bubble-btn">👉 タップしてモンスターを選ぶ</button></div>`).then(row => {
            const btn = row.querySelector('button');
            const openFlow = () => {
                btn.disabled = true;
                btn.textContent = '選択中…（トレイを開いています）';
                pickMonsterViaTrayRaw(trayTitle, () => {
                    btn.disabled = false;
                    btn.textContent = '👉 タップしてモンスターを選ぶ';
                }).then(idx => {
                    btn.disabled = true;
                    btn.textContent = '✅ 選択済み';
                    resolve(idx);
                });
            };
            btn.onclick = openFlow;
        });
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
        const idx = await askAndPickMonster(step.q, `${step.label}を選択`);
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
// 補完探索（総合力育成 / バトル用育成 統合フロー）
// =========================================================
const TARGET_SYMBOL_OPTIONS = [
    { label: '指定なし（最大値を探索）', value: 999 },
    { label: '👑 (660〜)', value: 660 },
    { label: '☆ (614〜)', value: 614 },
    { label: '◎ (490〜)', value: 490 },
];
const ROAD_COLORS_ONLY = ['赤', '青', '黄', '緑', '白', '黒'];

let complementFlowRunning = false;

function calculateItemsForScore(currentScore, targetScore) {
    if (targetScore === 999 || currentScore >= targetScore) {
        return { s3: 0, s2: 0, noble: 0, totalScore: currentScore };
    }
    let diff = targetScore - currentScore;
    let s3Part = diff * (12 / 25);
    let s2Part = diff * (1 / 25);
    let n3 = Math.round(s3Part / 12.5);
    let n2 = Math.round(s2Part / 5);
    let currentCover = (n3 * 12.5) + (n2 * 5);
    let remainder = diff - currentCover;
    let nn = Math.ceil(remainder);
    if (nn < 0) nn = 0;
    if ((n3 * 12.5) + (n2 * 5) + nn < diff) nn = Math.ceil(diff - ((n3 * 12.5) + (n2 * 5)));
    return { s3: n3, s2: n2, noble: nn, totalScore: currentScore + (n3 * 12.5) + (n2 * 5) + nn };
}

// ---- 汎用トレイ：モンスター1体選択（スキップ可） ----
function pickMonsterOrSkipRaw(title, poolFilter, onCancel) {
    return new Promise(resolve => {
        pendingTrayCancel = onCancel;
        const pool = poolFilter ? MONSTER_NAMES.map((_, i) => i).filter(poolFilter) : MONSTER_NAMES.map((_, i) => i);
        trayBody.innerHTML = `<div style="margin-bottom:8px;"><button class="chip-btn" id="skip-btn">この枠は指定しない（自動探索）</button></div><div class="monster-grid" id="pick-grid"></div>`;
        const grid = document.getElementById('pick-grid');
        pool.forEach(idx => {
            const cell = document.createElement('div');
            cell.className = 'monster-cell';
            cell.innerHTML = `<img src="${imgOf(idx)}" onerror="this.style.opacity=0"><span>${MONSTER_NAMES[idx]}</span>`;
            cell.onclick = () => { pendingTrayCancel = null; closeTray(); resolve(idx); };
            grid.appendChild(cell);
        });
        document.getElementById('skip-btn').onclick = () => { pendingTrayCancel = null; closeTray(); resolve(null); };
        openTray(title);
    });
}

// 質問文＋「タップして選ぶ／スキップ可」ボタンを出し、閉じても再挑戦できるようにするラッパー
function askMonsterOrSkip(questionHtml, trayTitle, poolFilter) {
    return new Promise(resolve => {
        botMessage(`${questionHtml}<div class="bubble-buttons"><button class="bubble-btn">👉 タップして選ぶ（スキップ可）</button></div>`).then(row => {
            const btn = row.querySelector('button');
            const openFlow = () => {
                btn.disabled = true;
                btn.textContent = '選択中…（トレイを開いています）';
                pickMonsterOrSkipRaw(trayTitle, poolFilter, () => {
                    btn.disabled = false;
                    btn.textContent = '👉 タップして選ぶ（スキップ可）';
                }).then(idx => {
                    btn.disabled = true;
                    btn.textContent = idx === null ? '✅ 指定しない（自動探索）' : '✅ 選択済み';
                    resolve(idx);
                });
            };
            btn.onclick = openFlow;
        });
    });
}

// ---- 汎用トレイ：除外モンスターの複数選択 ----
function pickExclusionSetRaw(title, initialSet, onCancel) {
    return new Promise(resolve => {
        pendingTrayCancel = onCancel;
        const localSet = new Set(initialSet);
        function draw() {
            trayBody.innerHTML = `
                <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                    <button class="chip-btn" id="ex-clear">全解除</button>
                    <button class="chip-btn" id="ex-done">この内容で決定（${localSet.size}体除外中）</button>
                </div>
                <div class="monster-grid" id="ex-grid"></div>
            `;
            const grid = document.getElementById('ex-grid');
            MONSTER_NAMES.forEach((name, idx) => {
                const cell = document.createElement('div');
                cell.className = 'monster-cell' + (localSet.has(idx) ? ' excluded' : '');
                cell.innerHTML = `<img src="${imgOf(idx)}" onerror="this.style.opacity=0"><span>${name}</span>`;
                cell.onclick = () => { if (localSet.has(idx)) localSet.delete(idx); else localSet.add(idx); draw(); };
                grid.appendChild(cell);
            });
            document.getElementById('ex-clear').onclick = () => { localSet.clear(); draw(); };
            document.getElementById('ex-done').onclick = () => { pendingTrayCancel = null; closeTray(); resolve(localSet); };
        }
        draw();
        openTray(title);
    });
}

// 質問文＋「タップして設定する」ボタンを出し、閉じても再挑戦できるようにするラッパー
function askExclusionSet(questionHtml, trayTitle, initialSet) {
    return new Promise(resolve => {
        botMessage(`${questionHtml}<div class="bubble-buttons"><button class="bubble-btn">👉 タップして設定する</button></div>`).then(row => {
            const btn = row.querySelector('button');
            const openFlow = () => {
                btn.disabled = true;
                btn.textContent = '設定中…（トレイを開いています）';
                pickExclusionSetRaw(trayTitle, initialSet, () => {
                    btn.disabled = false;
                    btn.textContent = '👉 タップして設定する';
                }).then(set => {
                    btn.disabled = true;
                    btn.textContent = `✅ ${set.size}体を除外に設定`;
                    resolve(set);
                });
            };
            btn.onclick = openFlow;
        });
    });
}

function quickReplyPromise(options) {
    return new Promise(resolve => {
        showQuickReplies(options.map(o => ({ label: o.label, onClick: () => resolve(o.value) })));
    });
}
// 質問文を送ってからクイックリプライを出す（読む時間を確保するためbotMessageの完了を待つ）
function quickReplyPromise2(questionHtml, options) {
    return new Promise(resolve => {
        botMessage(questionHtml).then(() => {
            showQuickReplies(options.map(o => ({ label: o.label, onClick: () => resolve(o.value) })));
        });
    });
}

// ---- 相性計算コア（父親側/母親側それぞれの最良候補を算出） ----
function computeUnitCandidates(childId, fixedP, fixedGp1, fixedGp2, poolList) {
    const GP_POOL_SIZE = 5;
    let candidates = [];
    const pList = (fixedP !== null) ? [fixedP] : poolList;
    for (const i of pList) {
        const gp1List = (fixedGp1 !== null) ? [fixedGp1] : poolList;
        const gp1Cands = gp1List.map(g => ({ id: g, score: Math.min(getComb(i, g), getComb(childId, g)) }));
        gp1Cands.sort((a, b) => b.score - a.score);
        const topGP1 = gp1Cands.slice(0, GP_POOL_SIZE);

        const gp2List = (fixedGp2 !== null) ? [fixedGp2] : poolList;
        const gp2Cands = gp2List.map(g => ({ id: g, score: Math.min(getComb(i, g), getComb(childId, g)) }));
        gp2Cands.sort((a, b) => b.score - a.score);
        const topGP2 = gp2Cands.slice(0, GP_POOL_SIZE);

        if (topGP1.length === 0 || topGP2.length === 0) continue;
        const base = getComb(childId, i);
        let tuples = [];
        for (const g1 of topGP1) for (const g2 of topGP2) tuples.push({ id: i, gp1: g1.id, gp2: g2.id, score: base + g1.score + g2.score });
        tuples.sort((a, b) => b.score - a.score);
        candidates.push(...tuples.slice(0, GP_POOL_SIZE));
    }
    return candidates;
}

function combineUnits(childId, pUnits, mUnits) {
    let all = [];
    for (const p of pUnits) for (const m of mUnits) {
        const fmScore = getComb(p.id, m.id);
        const total = p.score + m.score + fmScore + 224;
        all.push({ f: p.id, ff: p.gp1, fm: p.gp2, m: m.id, mf: m.gp1, mm: m.gp2, child: childId, rawScore: total });
    }
    all.sort((a, b) => b.rawScore - a.rawScore);
    return all;
}

function poolExcluding(excludedSet) {
    return MONSTER_NAMES.map((_, i) => i).filter(i => !excludedSet.has(i));
}
function poolByColor(color, excludedSet) {
    return MONSTER_NAMES.map((_, i) => i).filter(i => !excludedSet.has(i) && bloodlineData[MONSTER_NAMES[i]] && bloodlineData[MONSTER_NAMES[i]][color]);
}

// ---- 結果表示 ----
function comboCardHTML(combo, rank, targetSymbol) {
    const itemRes = calculateItemsForScore(combo.rawScore, targetSymbol);
    const finalScore = itemRes.totalScore;
    const itemsNote = (itemRes.s3 > 0 || itemRes.s2 > 0 || itemRes.noble > 0)
        ? `<div style="margin-top:6px; font-size:0.72rem; color:var(--muted);">推奨秘伝：共通III ${itemRes.s3}個 / 共通II ${itemRes.s2}個 / ノーブル加算 ${itemRes.noble}</div>` : '';
    return `
        <div class="result-cell" style="grid-column: span 2; text-align:left; display:flex; gap:8px; align-items:flex-start;">
            <div style="flex:0 0 auto; font-weight:700; color:var(--gold);">#${rank}</div>
            <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="color:${SYMBOL_COLOR[getSymbol(finalScore)]}">${getSymbol(finalScore)}</span>
                    <b>${finalScore.toFixed(1)}</b>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div>
                        <div style="font-size:0.65rem; color:var(--muted);">父親側</div>
                        <div style="display:flex; gap:2px;">
                            <img src="${imgOf(combo.f)}" title="${MONSTER_NAMES[combo.f]}" style="width:26px;height:26px;">
                            <img src="${imgOf(combo.ff)}" title="${MONSTER_NAMES[combo.ff]}" style="width:26px;height:26px;">
                            <img src="${imgOf(combo.fm)}" title="${MONSTER_NAMES[combo.fm]}" style="width:26px;height:26px;">
                        </div>
                    </div>
                    <div>
                        <div style="font-size:0.65rem; color:var(--muted);">母親側</div>
                        <div style="display:flex; gap:2px;">
                            <img src="${imgOf(combo.m)}" title="${MONSTER_NAMES[combo.m]}" style="width:26px;height:26px;">
                            <img src="${imgOf(combo.mf)}" title="${MONSTER_NAMES[combo.mf]}" style="width:26px;height:26px;">
                            <img src="${imgOf(combo.mm)}" title="${MONSTER_NAMES[combo.mm]}" style="width:26px;height:26px;">
                        </div>
                    </div>
                </div>
                ${itemsNote}
            </div>
        </div>
    `;
}

function openComboDetailPanel(combos, targetSymbol, childId) {
    document.getElementById('detail-panel-title').textContent = `育成候補 上位${combos.length}件`;
    const body = document.getElementById('detail-panel-body');
    body.innerHTML = `
        <div class="bubble-card" style="margin-bottom:10px;"><img src="${imgOf(childId)}"><div><div class="cc-label">育成モンスター</div><div class="cc-name">${MONSTER_NAMES[childId]}</div></div></div>
        <div class="result-grid" style="grid-template-columns: 1fr;">
            ${combos.map((c, i) => comboCardHTML(c, i + 1, targetSymbol)).join('')}
        </div>
    `;
    document.getElementById('detail-panel').classList.add('show');
    document.getElementById('detail-overlay').classList.add('show');
}

function comboSummaryHTML(combos, targetSymbol) {
    const top3 = combos.slice(0, 3);
    const rows = top3.map((c, i) => {
        const itemRes = calculateItemsForScore(c.rawScore, targetSymbol);
        return `<div class="result-summary-row">
            <span class="rank">${i + 1}</span>
            <span>${getSymbol(itemRes.totalScore)} 父:${MONSTER_NAMES[c.f]} / 母:${MONSTER_NAMES[c.m]}</span>
            <span class="score">${itemRes.totalScore.toFixed(1)}</span>
        </div>`;
    }).join('');
    return `<div style="font-weight:700; margin-bottom:4px;">計算結果（上位3組）</div><div class="result-summary-list">${rows}</div>`;
}

// ---- メインフロー ----
async function startComplementFlow() {
    if (complementFlowRunning) return;
    complementFlowRunning = true;
    clearQuickReplies();
    setHeader('reverse');

    await botMessage('補完探索を始めましょう🧩<br>育成モンスター（子）を1体選んで、足りない親・祖父母を自動で探し出します。');

    const mode = await quickReplyPromise([
        { label: '🏆 総合力育成（通常の補完探索）', value: 'total' },
        { label: '⚔️ バトル用育成（オーラ指定あり）', value: 'battle' },
    ]);

    if (mode === 'total') {
        await runTotalPowerFlow();
    } else {
        await runBattleFlow();
    }
    complementFlowRunning = false;
}

async function pickChildMonster() {
    const idx = await askAndPickMonster('まず、育成したいモンスター（子）を選んでください👇', '育成モンスター（子）を選択');
    userMonsterCard(idx, '育成モンスター（子）');
    return idx;
}

async function askTargetSymbol() {
    await botMessage('目標とする相性シンボルはありますか？（推奨秘伝数の計算に使います）');
    const val = await quickReplyPromise(TARGET_SYMBOL_OPTIONS.map(o => ({ label: o.label, value: o.value })));
    return val;
}

async function runTotalPowerFlow() {
    await botMessage('了解です、総合力重視の補完探索ですね。');
    const child = await pickChildMonster();

    let excluded = new Set();
    const exAns = await quickReplyPromise2('除外したいモンスターはいますか？（父親側・母親側で共通の除外リストです）', [{ label: '設定する', value: true }, { label: '設定しない', value: false }]);
    if (exAns) {
        excluded = await askExclusionSet('除外するモンスターをタップして選んでください👇', '除外モンスターを選択', excluded);
    }

    let fatherFixed = { f: null, ff: null, fm: null };
    let motherFixed = { m: null, mf: null, mm: null };
    const fixAns = await quickReplyPromise2('親・祖父母の中で「この子は固定したい」という枠はありますか？（指定しない枠は自動で探索します）', [{ label: '指定する', value: true }, { label: '指定しない（全自動探索）', value: false }]);
    if (fixAns) {
        for (const [key, label] of [['f', '父親'], ['ff', '父方の祖父'], ['fm', '父方の祖母']]) {
            fatherFixed[key] = await askMonsterOrSkip(`【${label}】を固定しますか？`, `${label}を選択（任意）`);
        }
        for (const [key, label] of [['m', '母親'], ['mf', '母方の祖父'], ['mm', '母方の祖母']]) {
            motherFixed[key] = await askMonsterOrSkip(`【${label}】を固定しますか？`, `${label}を選択（任意）`);
        }
    }

    const targetSymbol = await askTargetSymbol();

    await botMessage('入力内容を確認しました。この内容で計算しますか？');
    const action = await quickReplyPromise([
        { label: '✅ 計算する', value: 'calc' },
        { label: '🔄 父親側⇔母親側を入れ替えて計算', value: 'swap' },
    ]);
    if (action === 'swap') { [fatherFixed, motherFixed] = [motherFixed, fatherFixed]; }

    await botMessage('計算しています…🔮');
    const pool = poolExcluding(excluded);
    const pUnits = computeUnitCandidates(child, fatherFixed.f, fatherFixed.ff, fatherFixed.fm, pool);
    const mUnits = computeUnitCandidates(child, motherFixed.m, motherFixed.mf, motherFixed.mm, pool);
    const combos = combineUnits(child, pUnits, mUnits).slice(0, 10);

    if (combos.length === 0) {
        await botMessage('条件に合う組み合わせが見つかりませんでした。除外設定を見直してみてください。');
    } else {
        await botMessage(comboSummaryHTML(combos, targetSymbol));
        appendDetailButton(() => openComboDetailPanel(combos, targetSymbol, child));
    }
    afterComplementMenu();
}

async function runBattleFlow() {
    await botMessage('バトル用育成ですね⚔️<br>父親側が「ロード秘伝オーラ」担当、母親側が「ノーブル秘伝」担当という前提で進めます。');
    const child = await pickChildMonster();

    const childName = MONSTER_NAMES[child];
    const childData = bloodlineData[childName] || {};
    const trueColors = ROAD_COLORS_ONLY.filter(c => childData[c]);

    let targetColor = null;
    if (trueColors.length === 0) {
        await botMessage('このモンスターの血統にはロード秘伝オーラの設定がありませんでした。今回はオーラ制限なしで探索します。');
    } else if (trueColors.length === 1) {
        targetColor = trueColors[0];
        await botMessage(`このモンスターの血統は【${targetColor}】オーラです。狙うオーラ色を${targetColor}に設定しました。`);
    } else {
        targetColor = await quickReplyPromise2(`このモンスターの血統は複数のオーラ色（${trueColors.join('・')}）を持っています。今回狙うオーラ色を選んでください。`, trueColors.map(c => ({ label: c, value: c })));
    }

    let eligibleColors = null; // null = 制限なし
    if (targetColor) {
        if (ownedAuraData[targetColor]) {
            eligibleColors = [targetColor];
            await botMessage(`【${targetColor}】のロード秘伝オーラを所持しています。父親側の探索対象を${targetColor}系の血統に限定します。`);
        } else {
            const owned = ROAD_COLORS_ONLY.filter(c => ownedAuraData[c]);
            if (owned.length === 0) {
                await botMessage(`【${targetColor}】のロード秘伝オーラを未所持で、他に所持しているオーラもありませんでした。今回はオーラ制限なしで探索します。<br>（⚙️データ管理から所持オーラを登録しておくと、次回から自動で絞り込めます）`);
            } else {
                eligibleColors = owned;
                await botMessage(`【${targetColor}】のロード秘伝オーラは未所持ですが、【${owned.join('・')}】を所持しています。父親側の探索対象をこれらのオーラ系統に限定します（それぞれの色ごとに、父親と祖父母のオーラが揃うように探索します）。`);
            }
        }
    }

    await botMessage('ここからは【父親側】の入力です（オーラ色の制限は自動探索の枠のみに適用され、固定した枠はそのまま使われます）。');
    let fatherFixed = { f: null, ff: null, fm: null };
    for (const [key, label] of [['f', '父親'], ['ff', '父方の祖父'], ['fm', '父方の祖母']]) {
        fatherFixed[key] = await askMonsterOrSkip(`【${label}】を固定しますか？`, `${label}を選択（任意）`);
    }

    let excludedFather = new Set();
    const exFAns = await quickReplyPromise2('父親側で除外したいモンスターはいますか？', [{ label: '設定する', value: true }, { label: '設定しない', value: false }]);
    if (exFAns) {
        excludedFather = await askExclusionSet('父親側で除外するモンスターをタップして選んでください👇', '父親側の除外モンスターを選択', excludedFather);
    }

    await botMessage('続いて【母親側】の入力です（ノーブル秘伝担当・今回はオーラの自動連携はまだ行いません）。');
    let motherFixed = { m: null, mf: null, mm: null };
    for (const [key, label] of [['m', '母親'], ['mf', '母方の祖父'], ['mm', '母方の祖母']]) {
        motherFixed[key] = await askMonsterOrSkip(`【${label}】を固定しますか？`, `${label}を選択（任意）`);
    }

    let excludedMother = new Set();
    const exMAns = await quickReplyPromise2('母親側で除外したいモンスターはいますか？', [{ label: '設定する', value: true }, { label: '設定しない', value: false }]);
    if (exMAns) {
        excludedMother = await askExclusionSet('母親側で除外するモンスターをタップして選んでください👇', '母親側の除外モンスターを選択', excludedMother);
    }

    const targetSymbol = await askTargetSymbol();

    const action = await quickReplyPromise2('入力内容を確認しました。この内容で計算しますか？', [
        { label: '✅ 計算する', value: 'calc' },
        { label: '🔄 父親側⇔母親側の入力を入れ替えて計算', value: 'swap' },
    ]);
    if (action === 'swap') {
        [fatherFixed, motherFixed] = [motherFixed, fatherFixed];
        [excludedFather, excludedMother] = [excludedMother, excludedFather];
        await botMessage('入れ替えました。ただしオーラの絞り込みは元々の父親側の設定のまま探索対象に適用されます。');
    }

    await botMessage('計算しています…🔮');
    let pUnits;
    if (eligibleColors) {
        pUnits = eligibleColors.flatMap(color => computeUnitCandidates(child, fatherFixed.f, fatherFixed.ff, fatherFixed.fm, poolByColor(color, excludedFather)));
    } else {
        pUnits = computeUnitCandidates(child, fatherFixed.f, fatherFixed.ff, fatherFixed.fm, poolExcluding(excludedFather));
    }
    const mUnits = computeUnitCandidates(child, motherFixed.m, motherFixed.mf, motherFixed.mm, poolExcluding(excludedMother));
    const combos = combineUnits(child, pUnits, mUnits).slice(0, 10);

    if (combos.length === 0) {
        await botMessage('条件に合う組み合わせが見つかりませんでした。除外設定やオーラ条件を見直してみてください。');
    } else {
        await botMessage(comboSummaryHTML(combos, targetSymbol));
        appendDetailButton(() => openComboDetailPanel(combos, targetSymbol, child));
    }
    afterComplementMenu();
}

function appendDetailButton(onClick) {
    const rows = chatLog.querySelectorAll('.msg-row.bot');
    const last = rows[rows.length - 1];
    const bubble = last.querySelector('.bubble');
    const btnWrap = document.createElement('div');
    btnWrap.className = 'bubble-buttons';
    btnWrap.innerHTML = `<button class="bubble-btn">📋 上位10件の詳細を見る</button>`;
    btnWrap.querySelector('button').onclick = onClick;
    bubble.appendChild(btnWrap);
}

function afterComplementMenu() {
    showQuickReplies([
        { label: '🔁 もう一度探索する', onClick: () => startComplementFlow() },
        { label: '🎁 Gift/Tyrantを使う', onClick: () => selectFeature('gift') },
    ]);
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
    if (feature === 'reverse') {
        if (!complementFlowRunning) {
            clearQuickReplies();
            sysNote('補完探索 タブに切り替えました');
            await startComplementFlow();
        }
        return;
    }
    clearQuickReplies();
    sysNote(`${FEATURE_META[feature].title.replace('Bot', '')} タブに切り替えました`);
    await botMessage(`${FEATURE_META[feature].icon} この機能は現在チャットUI対応の準備中です。<br>Gift/TyrantとBox補完探索から会話型に作り直しています。今しばらくお待ちください🙏`);
    showQuickReplies([
        { label: '🎁 Gift/Tyrantを使う', onClick: () => selectFeature('gift') },
        { label: '🧩 補完探索を使う', onClick: () => selectFeature('reverse') },
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

// ---- 基礎相性値マトリクスの表示・編集 ----
function renderMatrixTable() {
    const container = document.getElementById('matrix-table-wrap');
    let html = '<div class="matrix-scroll"><table class="matrix-table"><thead><tr><th class="corner">子＼親</th>';
    MONSTER_NAMES.forEach(name => { html += `<th><img src="${imgOfName(name)}" title="${name}" onerror="this.style.display='none'"></th>`; });
    html += '</tr></thead><tbody>';
    MONSTER_NAMES.forEach((childName, cIdx) => {
        html += `<tr><th><img src="${imgOfName(childName)}" title="${childName}" onerror="this.style.display='none'"></th>`;
        MONSTER_NAMES.forEach((parentName, pIdx) => {
            const val = COMPATIBILITY_MATRIX[cIdx][pIdx];
            const patched = patchData[`${cIdx}-${pIdx}`] !== undefined;
            html += `<td class="matrix-cell${patched ? ' patched' : ''}" data-c="${cIdx}" data-p="${pIdx}">${val}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('.matrix-cell').forEach(td => {
        td.onclick = () => openMatrixEditTray(Number(td.dataset.c), Number(td.dataset.p));
    });
}

function openMatrixEditTray(c, p) {
    pendingTrayCancel = null; // 設定パネルからの編集はチャットフローのキャンセル通知と無関係
    const key = `${c}-${p}`;
    const currentVal = COMPATIBILITY_MATRIX[c][p];
    const baseVal = ORIGINAL_MATRIX[c][p];
    trayBody.innerHTML = `
        <div style="display:flex; justify-content:center; gap:16px; align-items:center; margin-bottom:10px;">
            <div style="text-align:center;"><img src="${imgOfName(MONSTER_NAMES[c])}" style="width:42px;height:42px;" onerror="this.style.display='none'"><div style="font-size:0.7rem;">${MONSTER_NAMES[c]}（子）</div></div>
            <div style="font-size:1.2rem; color:var(--muted);">×</div>
            <div style="text-align:center;"><img src="${imgOfName(MONSTER_NAMES[p])}" style="width:42px;height:42px;" onerror="this.style.display='none'"><div style="font-size:0.7rem;">${MONSTER_NAMES[p]}（親）</div></div>
        </div>
        <div style="text-align:center; margin-bottom:8px; font-size:0.78rem; color:var(--muted);">基準値：${baseVal}</div>
        <div class="slider-row" style="justify-content:center; margin-bottom:14px;">
            <button class="adj-btn" id="mx-minus">−</button>
            <input type="number" id="mx-input" value="${currentVal}" style="width:90px; text-align:center; font-size:1.15rem; background:#10202b; color:#fff; border:1px solid var(--border); border-radius:8px; padding:8px;">
            <button class="adj-btn" id="mx-plus">＋</button>
        </div>
        <div class="bubble-buttons" style="justify-content:center;">
            <button class="chip-btn" id="mx-reset">基準値に戻す</button>
            <button class="bubble-btn" id="mx-save">この値で保存</button>
        </div>
    `;
    const input = document.getElementById('mx-input');
    document.getElementById('mx-minus').onclick = () => { input.value = Number(input.value) - 1; };
    document.getElementById('mx-plus').onclick = () => { input.value = Number(input.value) + 1; };
    document.getElementById('mx-reset').onclick = () => { input.value = baseVal; };
    document.getElementById('mx-save').onclick = () => {
        const newVal = Number(input.value);
        const diff = newVal - baseVal;
        if (diff === 0) { delete patchData[key]; } else { patchData[key] = diff; }
        COMPATIBILITY_MATRIX[c][p] = newVal;
        savePatchData();
        closeTray();
        renderMatrixTable();
    };
    openTray('基礎相性値を編集');
}

function resetAllPatches() {
    if (!confirm('相性値の修正内容をすべてリセットします。よろしいですか？')) return;
    patchData = {};
    applyPatchToMatrix();
    savePatchData();
    renderMatrixTable();
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
    document.getElementById('stab-matrix').classList.toggle('active', tab === 'matrix');
    document.getElementById('stab-about').classList.toggle('active', tab === 'about');
    document.getElementById('settings-view-bloodline').style.display = tab === 'bloodline' ? 'block' : 'none';
    document.getElementById('settings-view-owned-aura').style.display = tab === 'owned-aura' ? 'block' : 'none';
    document.getElementById('settings-view-matrix').style.display = tab === 'matrix' ? 'block' : 'none';
    document.getElementById('settings-view-about').style.display = tab === 'about' ? 'block' : 'none';
    if (tab === 'owned-aura') renderOwnedAuraTab();
    if (tab === 'matrix') renderMatrixTable();
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
    if (!confirm('保存されている入力データ・血統データ・相性値の修正内容をすべて削除します。よろしいですか？')) return;
    localStorage.removeItem(LS_KEY_GIFT_INPUT);
    localStorage.removeItem(LS_KEY_BLOODLINE);
    localStorage.removeItem(LS_KEY_OWNED_AURA);
    localStorage.removeItem(LS_KEY_PATCH);
    bloodlineData = JSON.parse(JSON.stringify(DEFAULT_BLOODLINE_DATA));
    ownedAuraData = loadOwnedAura();
    patchData = {};
    applyPatchToMatrix();
    renderBloodlineTable();
    renderOwnedAuraTab();
    renderMatrixTable();
    alert('削除しました。');
}

// =========================================================
// 初期化
// =========================================================
async function showWelcomeMessage() {
    document.getElementById('header-title').textContent = 'ギフトンBot';
    document.getElementById('header-bot-avatar').textContent = '🤖';
    document.getElementById('header-subtitle').textContent = 'モードを選んでください';
    await botMessage('はじめまして、LMFギフトンツールのBotです🎉<br>モンスターの相性計算や配合候補の探索をお手伝いします。');
    await botMessage('下のナビゲーションバーから使いたいモードを選んでください👇<br>🎁 Gift/Tyrant：親を指定して育成候補モンスターを計算<br>🧩 補完探索：育成したいモンスターから足りない親を自動探索');
}

document.addEventListener('DOMContentLoaded', () => {
    showWelcomeMessage();
});
