const app = document.querySelector('#app');

const KIND_LABELS = Object.freeze({
  monster: 'モンスター',
  training: 'Training',
  shugyo: '修行',
  breeder: 'ブリーダー',
  fusion: '特殊合体',
});

const FACTIONS = ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物'];
const FACTION_CLASS = Object.freeze({
  '機鋼': 'faction-inorganic',
  '神造': 'faction-creation',
  '幻霊': 'faction-spirit',
  '魔族': 'faction-demon',
  '獣族': 'faction-beast',
  '怪物': 'faction-monster',
  '汎用': 'faction-neutral',
});
const ORIGIN_LABELS = Object.freeze({ core: '汎用', booster: 'ブースター限定', trophy: '奪取限定', fusion: '特殊合体' });
const RARITY_LABELS = Object.freeze({ common: 'Common', rare: 'Rare', fusion: 'Fusion' });
const TYPE_FILTERS = [
  ['all', 'すべて'],
  ['monster', 'モンスター'],
  ['training', 'Training'],
  ['shugyo', '修行'],
  ['breeder', 'ブリーダー'],
  ['fusion', '特殊合体'],
];

const state = {
  cards: [],
  query: '',
  kind: 'all',
  faction: 'all',
  origin: 'all',
  rarity: 'all',
  sort: 'id',
};

const refs = {};

function el(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.htmlFor) element.htmlFor = options.htmlFor;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== null && value !== undefined) element.setAttribute(key, String(value));
    }
  }
  if (options.value !== undefined) element.value = options.value;
  if (options.type) element.type = options.type;
  if (options.onclick) element.addEventListener('click', options.onclick);
  if (options.oninput) element.addEventListener('input', options.oninput);
  if (options.onchange) element.addEventListener('change', options.onchange);
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) if (child) element.append(child);
  return element;
}

function numberFromId(id) {
  const match = String(id ?? '').match(/(\d+)$/);
  return match ? Number(match[1]) : 9999;
}

function originFor(card) {
  const id = String(card.id ?? '');
  const number = numberFromId(id);
  if (id.startsWith('breeder-') && ((number >= 29 && number <= 40) || (number >= 47 && number <= 52))) return 'trophy';
  if (id.startsWith('monster-') && number >= 19 && number <= 30) return 'booster';
  return 'core';
}

function rarityFor(card) {
  return card.kind === 'monster' ? 'rare' : 'common';
}

function spritePosition(index, columns, rows) {
  const x = columns === 1 ? 0 : (index % columns) * (100 / (columns - 1));
  const y = rows === 1 ? 0 : Math.floor(index / columns) * (100 / (rows - 1));
  return `--art-x:${x}%;--art-y:${y}%;`;
}

function artPresentation(item) {
  if (item.entryType === 'fusion') {
    const index = numberFromId(item.id) - 1;
    if (index >= 48) {
      return { className: 'card-visual standalone-art fusion-art', style: `--art-image:url("./assets/images/fusion-thumbnails/${item.id}.webp");` };
    }
    return { className: 'card-visual sprite-fusion fusion-art', style: spritePosition(index, 8, 6) };
  }
  if (item.kind === 'monster') {
    const index = numberFromId(item.id) - 1;
    if (index >= 18) {
      return { className: 'card-visual standalone-art monster-art', style: `--art-image:url("./assets/images/booster/${item.id}.webp");` };
    }
    return { className: 'card-visual sprite-monster monster-art', style: spritePosition(index, 6, 3) };
  }
  const index = item.kind === 'training' ? ['training-life', 'training-atk', 'training-def', 'shugyo-attack', 'shugyo-defense'].indexOf(item.id) : 5 + numberFromId(item.id) - 1;
  if (item.kind === 'breeder' && numberFromId(item.id) > 20) {
    return { className: 'card-visual standalone-art support-art', style: `--art-image:url("./assets/images/breeders/${item.id}.webp");` };
  }
  return { className: 'card-visual sprite-support support-art', style: spritePosition(index, 5, 5) };
}

function normalizedEntries(data) {
  const monsterByName = new Map((data.monsters ?? []).map((monster) => [monster.name, monster]));
  const movesByMonster = new Map();
  for (const move of data.moves ?? []) {
    if (!movesByMonster.has(move.monsterName)) movesByMonster.set(move.monsterName, []);
    movesByMonster.get(move.monsterName).push(move);
  }
  const basicCards = [...(data.monsters ?? []), ...(data.growthCards ?? []), ...(data.breeders ?? [])].map((card) => ({
    ...card,
    entryType: 'card',
    kindLabel: KIND_LABELS[card.kind] ?? card.kind,
    faction: card.faction ?? '汎用',
    cost: card.summonTp ?? card.tp,
    origin: originFor(card),
    rarity: rarityFor(card),
    effect: card.kind === 'monster' ? `${card.trait?.name ?? '特性'}：${card.trait?.effect ?? '—'}` : card.effect,
    stats: card.base ?? null,
    moves: card.kind === 'monster' ? (movesByMonster.get(card.name) ?? []) : [],
  }));
  const fusions = (data.fusions ?? []).map((fusion) => ({
    ...fusion,
    entryType: 'fusion',
    kind: 'fusion',
    kindLabel: KIND_LABELS.fusion,
    faction: monsterByName.get(fusion.main)?.faction ?? '汎用',
    cost: 2,
    origin: 'fusion',
    rarity: 'fusion',
    effect: fusion.trait,
    stats: null,
    moves: [],
  }));
  return [...basicCards, ...fusions];
}

function searchText(item) {
  return [
    item.id, item.name, item.kindLabel, item.faction, item.role, item.category,
    item.effect, item.trait?.name, item.trait?.effect, item.main, item.material,
    item.archetype, ORIGIN_LABELS[item.origin], RARITY_LABELS[item.rarity],
  ].filter(Boolean).join(' ').toLocaleLowerCase('ja');
}

function sortedItems(items) {
  const list = [...items];
  const kindOrder = { monster: 0, training: 1, shugyo: 2, breeder: 3, fusion: 4 };
  const idSort = (a, b) => {
    const kindDifference = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
    if (kindDifference) return kindDifference;
    const aNumber = numberFromId(a.id);
    const bNumber = numberFromId(b.id);
    if (aNumber !== 9999 || bNumber !== 9999) return aNumber - bNumber;
    return String(a.id).localeCompare(String(b.id), 'en');
  };
  if (state.sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'ja') || idSort(a, b));
  if (state.sort === 'cost-asc') return list.sort((a, b) => Number(a.cost) - Number(b.cost) || a.name.localeCompare(b.name, 'ja'));
  if (state.sort === 'cost-desc') return list.sort((a, b) => Number(b.cost) - Number(a.cost) || a.name.localeCompare(b.name, 'ja'));
  return list.sort(idSort);
}

function filteredItems() {
  const query = state.query.trim().toLocaleLowerCase('ja');
  return sortedItems(state.cards.filter((item) => {
    if (state.kind !== 'all' && item.kind !== state.kind) return false;
    if (state.faction !== 'all' && item.faction !== state.faction) return false;
    if (state.origin !== 'all' && item.origin !== state.origin) return false;
    if (state.rarity !== 'all' && item.rarity !== state.rarity) return false;
    return !query || searchText(item).includes(query);
  }));
}

function tag(text, className = '') {
  return el('span', { className: `tag ${className}`.trim(), text });
}

function cardVisual(item, detail = false) {
  const presentation = artPresentation(item);
  const visual = el('div', {
    className: `${presentation.className}${detail ? ' is-detail' : ''}`,
    attrs: { style: presentation.style, role: 'img', 'aria-label': `${item.name}のカード画像` },
  }, [
    el('div', { className: 'visual-topline' }, [
      el('span', { text: item.id.toUpperCase() }),
      el('b', { text: `${item.cost} TP` }),
    ]),
    el('span', { className: `visual-faction ${FACTION_CLASS[item.faction] ?? ''}`, text: item.faction }),
    el('strong', { className: 'visual-name', text: item.name }),
    el('span', { className: 'visual-kind', text: item.kindLabel }),
  ]);
  return visual;
}

function renderTile(item) {
  const article = el('article', { className: `card-tile ${FACTION_CLASS[item.faction] ?? ''}` });
  const button = el('button', {
    className: 'card-tile-button',
    type: 'button',
    attrs: { 'aria-label': `${item.name}の詳細を表示` },
    onclick: () => openDetails(item),
  }, [
    cardVisual(item),
    el('div', { className: 'tile-copy' }, [
      el('div', { className: 'tile-tags' }, [
        tag(item.kindLabel, 'tag-kind'),
        tag(ORIGIN_LABELS[item.origin], 'tag-origin'),
        tag(RARITY_LABELS[item.rarity], `tag-rarity rarity-${item.rarity}`),
      ]),
      el('h2', { text: item.name }),
      el('p', { className: 'tile-effect', text: item.effect ?? '効果データなし' }),
      el('div', { className: 'tile-meta' }, [
        el('span', { text: item.entryType === 'fusion' ? `${item.main} ＋ ${item.material}` : item.faction }),
        item.stats ? el('span', { text: `LIFE ${item.stats.life} / ATK ${item.stats.atk} / DEF ${item.stats.def}` }) : el('span', { text: `${item.cost}TP` }),
      ]),
    ]),
    el('span', { className: 'tile-arrow', text: '›', attrs: { 'aria-hidden': 'true' } }),
  ]);
  article.append(button);
  return article;
}

function detailField(label, value) {
  return el('div', { className: 'detail-field' }, [el('dt', { text: label }), el('dd', { text: value ?? '—' })]);
}

function renderMoves(item) {
  if (item.kind !== 'monster' || !item.moves.length) return null;
  const rows = item.moves.map((move) => el('tr', {}, [
    el('td', { text: move.initial ? '初期' : '修行' }),
    el('th', { scope: 'row', text: move.name }),
    el('td', { text: `R${move.rank}` }),
    el('td', { text: move.power ?? '—' }),
    el('td', { text: `${move.tp}TP` }),
    el('td', { text: move.effect || '—' }),
  ]));
  return el('section', { className: 'detail-section detail-moves' }, [
    el('div', { className: 'section-heading' }, [el('h3', { text: '技一覧' }), el('span', { text: `${item.moves.length}件` })]),
    el('div', { className: 'move-table-wrap' }, el('table', { className: 'move-table' }, [
      el('thead', {}, el('tr', {}, ['習得', '技名', 'Rank', '威力', 'TP', '追加効果'].map((label) => el('th', { scope: 'col', text: label })))),
      el('tbody', {}, rows),
    ])),
  ]);
}

function openDetails(item) {
  refs.dialogTitle.textContent = item.name;
  refs.dialogBody.replaceChildren();
  const detail = el('div', { className: 'detail-layout' }, [
    el('div', { className: 'detail-visual-column' }, [cardVisual(item, true), tag(`${item.id} / ${RARITY_LABELS[item.rarity]}`, 'detail-code')]),
    el('div', { className: 'detail-copy' }, [
      el('div', { className: 'detail-tags' }, [tag(item.kindLabel, 'tag-kind'), tag(ORIGIN_LABELS[item.origin], 'tag-origin'), item.faction !== '汎用' ? tag(item.faction, `tag-faction ${FACTION_CLASS[item.faction] ?? ''}`) : tag('汎用', 'tag-faction faction-neutral')]),
      el('dl', { className: 'detail-fields' }, item.entryType === 'fusion'
        ? [detailField('種類', '特殊合体'), detailField('素材', `${item.main} ＋ ${item.material}`), detailField('合体コスト', `${item.cost}TP`), detailField('アーキタイプ', item.archetype ?? '—')]
        : [detailField('種類', item.kindLabel), detailField('分類', item.faction), detailField('コスト', `${item.cost}TP`), detailField('レア度', RARITY_LABELS[item.rarity]), detailField('入手経路', ORIGIN_LABELS[item.origin]), item.role ? detailField('役割', item.role) : null]),
      item.stats ? el('div', { className: 'stat-strip' }, [['LIFE', item.stats.life], ['ATK', item.stats.atk], ['DEF', item.stats.def]].map(([label, value]) => el('div', {}, [el('small', { text: label }), el('strong', { text: String(value) })]))) : null,
      el('section', { className: 'effect-panel' }, [el('small', { text: item.entryType === 'fusion' ? '特殊特性' : item.kind === 'monster' ? (item.trait?.name ?? '特性') : 'カード効果' }), el('p', { text: item.effect ?? '効果データなし' })]),
    ]),
  ]);
  refs.dialogBody.append(detail);
  const extra = item.entryType === 'fusion'
    ? el('section', { className: 'detail-section fusion-notes' }, [el('div', { className: 'section-heading' }, [el('h3', { text: '攻略メモ' }), el('span', { text: item.watch === '監視' ? '要チェック' : '基本データ' })]), el('p', { text: `素材は ${item.main} と ${item.material}。${item.archetype ? `役割は「${item.archetype}」。` : ''}${item.watch === '監視' ? '対戦環境での採用率が高い注目レシピです。' : '合体後はこの特性を活かせる盤面づくりを意識しましょう。'}` })])
    : renderMoves(item);
  if (extra) refs.dialogBody.append(extra);
  if (typeof refs.dialog.showModal === 'function') refs.dialog.showModal();
  else refs.dialog.setAttribute('open', '');
}

function closeDetails() {
  if (typeof refs.dialog.close === 'function' && refs.dialog.open) refs.dialog.close();
  else refs.dialog.removeAttribute('open');
}

function renderTypeFilters() {
  refs.typeFilters.replaceChildren(...TYPE_FILTERS.map(([id, label]) => {
    const count = state.cards.filter((item) => id === 'all' || item.kind === id).length;
    return el('button', {
      className: `filter-pill${state.kind === id ? ' selected' : ''}`,
      type: 'button',
      attrs: { 'aria-pressed': state.kind === id ? 'true' : 'false' },
      onclick: () => { state.kind = id; renderTypeFilters(); renderResults(); },
    }, [el('span', { text: label }), el('small', { text: String(count) })]);
  }));
}

function renderResults() {
  const items = filteredItems();
  const total = state.cards.length;
  refs.resultCount.textContent = `${items.length}件表示`;
  refs.resultHint.textContent = state.query || state.kind !== 'all' || state.faction !== 'all' || state.origin !== 'all' || state.rarity !== 'all'
    ? `全${total}件から条件に一致するカードを表示中`
    : `全${total}件のカードデータを収録`;
  refs.resultGrid.replaceChildren();
  if (!items.length) {
    refs.resultGrid.append(el('div', { className: 'empty-result' }, [el('strong', { text: '該当するカードがありません' }), el('p', { text: '検索語や絞り込み条件を変更してみてください。' })]));
    return;
  }
  refs.resultGrid.append(...items.map(renderTile));
}

function selectControl(id, label, options, value, onChange) {
  const select = el('select', { attrs: { id, 'aria-label': label }, onchange: (event) => onChange(event.target.value) }, options.map(([optionId, text]) => el('option', { value: optionId, selected: value === optionId, text })));
  return el('label', { className: 'select-control' }, [el('span', { text: label }), select]);
}

function buildPage(data) {
  state.cards = normalizedEntries(data);
  replaceApp();
  refs.search = document.querySelector('#card-search');
  refs.typeFilters = document.querySelector('#type-filters');
  refs.resultCount = document.querySelector('#result-count');
  refs.resultHint = document.querySelector('#result-hint');
  refs.resultGrid = document.querySelector('#result-grid');
  refs.dialog = document.querySelector('#card-dialog');
  refs.dialogTitle = document.querySelector('#dialog-title');
  refs.dialogBody = document.querySelector('#dialog-body');
  refs.search.addEventListener('input', (event) => { state.query = event.target.value; renderResults(); });
  document.querySelector('#faction-filter').addEventListener('change', (event) => { state.faction = event.target.value; renderResults(); });
  document.querySelector('#origin-filter').addEventListener('change', (event) => { state.origin = event.target.value; renderResults(); });
  document.querySelector('#rarity-filter').addEventListener('change', (event) => { state.rarity = event.target.value; renderResults(); });
  document.querySelector('#sort-filter').addEventListener('change', (event) => { state.sort = event.target.value; renderResults(); });
  document.querySelector('#reset-filters').addEventListener('click', () => {
    state.query = ''; state.kind = 'all'; state.faction = 'all'; state.origin = 'all'; state.rarity = 'all'; state.sort = 'id';
    refs.search.value = '';
    for (const id of ['faction-filter', 'origin-filter', 'rarity-filter', 'sort-filter']) document.querySelector(`#${id}`).value = state[id.replace('-filter', '')] ?? 'all';
    document.querySelector('#sort-filter').value = 'id';
    renderTypeFilters(); renderResults();
  });
  document.querySelector('#dialog-close').addEventListener('click', closeDetails);
  refs.dialog.addEventListener('click', (event) => { if (event.target === refs.dialog) closeDetails(); });
  renderTypeFilters();
  renderResults();
}

function replaceApp() {
  const counts = {
    basic: state.cards.filter((item) => item.entryType === 'card').length,
    fusions: state.cards.filter((item) => item.entryType === 'fusion').length,
    monsters: state.cards.filter((item) => item.kind === 'monster').length,
    moves: 0,
  };
  const html = el('main', { className: 'guide-page' }, [
    el('header', { className: 'site-header' }, [
      el('a', { className: 'brand', attrs: { href: './', 'aria-label': 'カード一覧トップへ' } }, [el('span', { className: 'brand-sigil', text: 'MC' }), el('span', {}, [el('strong', { text: 'MONSTER' }), el('small', { text: 'CONSTRUCTION 攻略' })])]),
      el('div', { className: 'header-label' }, [el('span', { text: '攻略データベース' }), el('b', { text: 'CARD INDEX' })]),
    ]),
    el('section', { className: 'hero' }, [
      el('div', { className: 'hero-copy' }, [el('p', { className: 'eyebrow', text: 'SIM8.7 / CARD DATABASE' }), el('h1', { text: 'カード一覧' }), el('p', { className: 'hero-lead', text: 'カード名・種類・分類・入手経路から探せる、モンスターコンストラクションの攻略データベース。カードをタップすると能力と効果、モンスターの技一覧を確認できます。' })]),
      el('div', { className: 'hero-orb', attrs: { 'aria-hidden': 'true' } }, [el('span', { text: 'CARD' }), el('strong', { text: 'INDEX' }), el('i')]),
    ]),
    el('section', { className: 'summary-strip', attrs: { 'aria-label': '収録データ概要' } }, [
      el('div', {}, [el('small', { text: '基本カード' }), el('strong', { text: String(counts.basic) })]),
      el('div', {}, [el('small', { text: 'モンスター' }), el('strong', { text: String(counts.monsters) })]),
      el('div', {}, [el('small', { text: '特殊合体' }), el('strong', { text: String(counts.fusions) })]),
      el('div', {}, [el('small', { text: '技データ' }), el('strong', { text: String((state.cards.find((item) => item.kind === 'monster')?.moves.length ?? 0) * counts.monsters) })]),
    ]),
    el('section', { className: 'filter-panel', attrs: { 'aria-label': 'カードを検索・絞り込み' } }, [
      el('div', { className: 'search-row' }, [el('label', { className: 'search-box', attrs: { for: 'card-search' } }, [el('span', { text: '⌕', attrs: { 'aria-hidden': 'true' } }), el('input', { attrs: { id: 'card-search', type: 'search', placeholder: 'カード名・効果・IDで検索', autocomplete: 'off' } })]), el('button', { id: 'reset-filters', className: 'reset-button', type: 'button', text: '条件をリセット' })]),
      el('div', { className: 'filter-group' }, [el('span', { className: 'filter-label', text: 'カード種別' }), el('div', { id: 'type-filters', className: 'filter-pills' })]),
      el('div', { className: 'select-row' }, [
        selectControl('faction-filter', '分類', [['all', 'すべての分類'], ...FACTIONS.map((faction) => [faction, faction])], 'all', (value) => { state.faction = value; renderResults(); }),
        selectControl('origin-filter', '入手経路', [['all', 'すべての入手経路'], ['core', '汎用'], ['booster', 'ブースター限定'], ['trophy', '奪取限定'], ['fusion', '特殊合体']], 'all', (value) => { state.origin = value; renderResults(); }),
        selectControl('rarity-filter', 'レア度', [['all', 'すべてのレア度'], ['rare', 'Rare（モンスター）'], ['common', 'Common（サポート）'], ['fusion', 'Fusion（特殊合体）']], 'all', (value) => { state.rarity = value; renderResults(); }),
        selectControl('sort-filter', '並び順', [['id', 'カード番号順'], ['name', '名前順'], ['cost-asc', 'コストの低い順'], ['cost-desc', 'コストの高い順']], 'id', (value) => { state.sort = value; renderResults(); }),
      ]),
    ]),
    el('section', { className: 'results-section', attrs: { 'aria-live': 'polite' } }, [
      el('div', { className: 'results-heading' }, [el('div', {}, [el('p', { className: 'eyebrow', text: 'RESULTS' }), el('h2', { id: 'result-count', text: '—' })]), el('p', { id: 'result-hint', text: '' })]),
      el('div', { id: 'result-grid', className: 'card-grid' }),
    ]),
    el('footer', { className: 'site-footer' }, [el('span', { text: 'MONSTER CONSTRUCTION / SIM8.7' }), el('span', { text: 'カードデータはゲーム内マスターデータを参照' })]),
  ]);
  const dialog = el('dialog', { id: 'card-dialog', className: 'card-dialog', attrs: { 'aria-labelledby': 'dialog-title' } }, [
    el('div', { className: 'dialog-shell' }, [el('div', { className: 'dialog-header' }, [el('div', {}, [el('p', { className: 'eyebrow', text: 'CARD DETAIL' }), el('h2', { id: 'dialog-title', text: '' })]), el('button', { id: 'dialog-close', className: 'dialog-close', type: 'button', text: '閉じる', attrs: { 'aria-label': '詳細を閉じる' } })]), el('div', { id: 'dialog-body', className: 'dialog-body' })]),
  ]);
  app.replaceChildren(html, dialog);
}

async function boot() {
  try {
    const response = await fetch('./data/master-data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buildPage(await response.json());
  } catch (error) {
    app.replaceChildren(el('main', { className: 'error-state' }, [el('div', { className: 'loading-mark', text: '!' }), el('h1', { text: 'カードデータを読み込めませんでした' }), el('p', { text: 'このサイトは静的サーバーで開くと正しく表示されます。READMEの手順を確認してください。' }), el('small', { text: String(error.message ?? error) })]));
  }
}

boot();
