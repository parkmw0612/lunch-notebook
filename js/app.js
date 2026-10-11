import * as store from './store.js';

// ---------- 음식 분류 체계 ----------

const CATEGORIES = ['한식', '중식', '일식/면', '양식/간편'];
const TAGS = ['국물', '밥', '면', '해장', '빠른식사', '기타'];
const TAG_LABEL = { 해장: '해장/속풀이' };
const CAT_ICON = { '한식': '🍚', '중식': '🥟', '일식/면': '🍜', '양식/간편': '🍔' };

// 대표 메뉴 기준표: 메뉴를 고르면 카테고리와 태그를 자동으로 채운다.
const MENU_TABLE = {
  순대국: ['한식', ['국물', '밥', '해장']],
  해장국: ['한식', ['국물', '밥', '해장']],
  부대찌개: ['한식', ['국물', '밥']],
  순두부찌개: ['한식', ['국물', '밥', '해장']],
  김치찌개: ['한식', ['국물', '밥']],
  닭곰탕: ['한식', ['국물', '밥', '해장']],
  제육볶음: ['한식', ['밥']],
  백반: ['한식', ['밥']],
  짜장: ['중식', ['면']],
  짬뽕: ['중식', ['국물', '면', '해장']],
  라면: ['일식/면', ['국물', '면', '빠른식사']],
  칼국수: ['일식/면', ['국물', '면']],
  돈까스: ['일식/면', ['밥']],
  쌀국수: ['일식/면', ['국물', '면', '해장']],
  스파게티: ['양식/간편', ['면']],
  피자: ['양식/간편', ['기타']],
  샌드위치: ['양식/간편', ['기타', '빠른식사']],
  햄버거: ['양식/간편', ['기타', '빠른식사']],
};

const RATING_LABEL = { good: '좋았음', ok: '보통', never: '다시 안 감' };
const NEVER_REASONS = ['맛', '서비스', '가격', '대기시간'];
const DELETE_REASONS = ['폐점', '기타'];

// 앱을 백그라운드에 이만큼 두었다가 돌아오면 "다시 연 것"으로 본다.
const REOPEN_AFTER_MS = 10 * 60 * 1000;

// ---------- 상태 ----------

const state = {
  restaurants: [],
  visits: [],
  ratings: [],
  category: '전체',
  tags: new Set(),
};

// ---------- 도우미 ----------

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const tagLabel = (t) => `#${TAG_LABEL[t] || t}`;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());

function daysSince(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const n = new Date();
  const from = new Date(y, m - 1, d);
  const to = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((to - from) / 86400000);
}

function visitLabel(dateStr) {
  const n = daysSince(dateStr);
  if (n <= 0) return '오늘';
  if (n === 1) return '어제';
  return `${n}일 전`;
}

const byId = (id) => state.restaurants.find((r) => r.id === id);

function lastVisit(restaurantId) {
  let last = null;
  for (const v of state.visits) {
    if (v.restaurantId === restaurantId && (!last || v.date > last.date)) last = v;
  }
  return last;
}

function ratingSummary(restaurantId) {
  const sum = { good: 0, ok: 0, never: 0 };
  for (const r of state.ratings) if (r.restaurantId === restaurantId) sum[r.value] += 1;
  return sum;
}

// 카테고리와 태그는 AND, 태그끼리는 OR. 식당 이름 가나다 순.
function filtered() {
  return state.restaurants
    .filter((r) => state.category === '전체' || r.category === state.category)
    .filter((r) => state.tags.size === 0 || r.tags.some((t) => state.tags.has(t)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경 */ }
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function reload() {
  [state.restaurants, state.visits, state.ratings] = await Promise.all([
    store.listRestaurants(), store.listVisits(), store.listRatings(),
  ]);
}

async function refresh() {
  await reload();
  renderHome();
}

// ---------- 설치 안내 ----------

function installContext() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const otherIosBrowser = ios && /CriOS|FxiOS|EdgiOS/.test(ua);
  return { ios, standalone, inApp, otherIosBrowser };
}

function installBanner() {
  const ctx = installContext();
  if (ctx.standalone || !ctx.ios || storageGet('installGuideDismissed') === '1') return '';
  return `
    <div class="banner">
      <p><strong>홈 화면에 추가</strong>하면 앱처럼 쓸 수 있어요.</p>
      <div class="banner-actions">
        <button class="link-btn" data-act="install-guide">방법 보기</button>
        <button class="link-btn muted" data-act="install-dismiss">닫기</button>
      </div>
    </div>`;
}

function openInstallGuide() {
  const ctx = installContext();
  const needSafari = ctx.inApp || ctx.otherIosBrowser;
  openSheet(`
    <h2 class="sheet-title">홈 화면에 추가하기</h2>
    ${needSafari ? '<p class="note warn">지금 브라우저에서는 추가할 수 없어요. 먼저 이 주소를 <strong>Safari</strong>로 열어 주세요.</p>' : ''}
    <ol class="steps">
      <li>Safari 아래쪽의 <strong>공유</strong> 버튼(네모에서 화살표가 올라가는 모양)을 누릅니다.</li>
      <li>목록을 내려 <strong>홈 화면에 추가</strong>를 누릅니다.</li>
      <li>오른쪽 위의 <strong>추가</strong>를 누릅니다.</li>
      <li>홈 화면에 생긴 <strong>식당 수첩</strong> 아이콘으로 실행합니다.</li>
    </ol>
    <p class="note">Safari와 홈 화면 앱은 데이터를 따로 저장합니다. 식당 등록은 홈 화면 앱에서 시작하세요.</p>
    <div class="sheet-actions"><button class="btn btn-ink" data-close>확인</button></div>
  `);
}

// ---------- 홈 ----------

function dateHeading() {
  const d = new Date();
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${week}요일`;
}

function cardHtml(r, todayVisit) {
  const last = lastVisit(r.id);
  const sum = ratingSummary(r.id);
  const rated = sum.good + sum.ok + sum.never > 0;
  const visitedToday = todayVisit && todayVisit.restaurantId === r.id;
  const meta = [
    r.walkMin != null ? `도보 ${r.walkMin}분` : '',
    r.price != null ? won(r.price) : '',
  ].filter(Boolean).join(' · ');

  return `
    <article class="card${visitedToday ? ' is-today' : ''}">
      <button class="card-body" data-act="edit" data-id="${esc(r.id)}" aria-label="${esc(r.name)} 수정">
        <span class="card-menu">${esc(r.name)}</span>
        ${r.menu ? `<span class="card-name">${esc(r.menu)}</span>` : ''}
        ${meta ? `<span class="card-meta">${esc(meta)}</span>` : ''}
        <span class="card-last${last ? '' : ' none'}">${last ? `${visitLabel(last.date)} 방문` : '방문 기록 없음'}</span>
        <span class="card-rate${rated ? '' : ' none'}">${rated
          ? `<span class="good">좋았음 ${sum.good}</span><span class="ok">보통 ${sum.ok}</span><span class="never">안 감 ${sum.never}</span>`
          : '평가 없음'}</span>
      </button>
      ${visitedToday
        ? `<button class="visit-btn done" data-act="unvisit" data-id="${esc(todayVisit.id)}">방문함 · 취소</button>`
        : `<button class="visit-btn" data-act="visit" data-id="${esc(r.id)}">오늘 여기 갔음</button>`}
    </article>`;
}

function renderHome() {
  const list = filtered();
  const todayVisit = state.visits.find((v) => v.date === today());
  const tabs = ['전체', ...CATEGORIES];

  let body;
  if (state.restaurants.length === 0) {
    body = `
      <div class="empty">
        <p class="empty-ico" aria-hidden="true">🍽️</p>
        <h2>아직 등록한 식당이 없어요</h2>
        <p>단골 식당을 등록하면 필터와 랜덤 추천으로<br>오늘 갈 곳을 빠르게 고를 수 있어요.</p>
        <button class="btn btn-accent" data-act="add">첫 식당 추가</button>
      </div>`;
  } else if (list.length === 0) {
    body = `
      <div class="empty">
        <h2>조건에 맞는 식당이 없어요</h2>
        <p>카테고리나 태그를 바꿔 보세요.</p>
        <button class="btn btn-line" data-act="clear-filter">필터 지우기</button>
      </div>`;
  } else {
    body = `<div class="grid">${list.map((r) => cardHtml(r, todayVisit)).join('')}</div>`;
  }

  const chipScroll = $('.filters .chips')?.scrollLeft || 0;
  $('#app').innerHTML = `
    <header class="top">
      <div class="top-row">
        <div>
          <p class="eyebrow">${dateHeading()}</p>
          <h1>점심 식당 수첩</h1>
        </div>
        <div class="top-actions">
          <button class="icon-btn" data-act="data" aria-label="데이터 관리">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/></svg>
          </button>
          <button class="btn btn-ink" data-act="add">식당 추가</button>
        </div>
      </div>
      ${installBanner()}
    </header>
    <div class="filters">
      <div class="tabs" role="tablist" aria-label="카테고리">
        ${tabs.map((t) => `<button role="tab" class="tab${state.category === t ? ' on' : ''}" aria-selected="${state.category === t}" data-act="tab" data-value="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="chips" aria-label="태그 필터">
        ${TAGS.map((t) => `<button class="chip${state.tags.has(t) ? ' on' : ''}" aria-pressed="${state.tags.has(t)}" data-act="tag" data-value="${esc(t)}">${esc(tagLabel(t))}</button>`).join('')}
      </div>
    </div>
    <main class="home-main">
      ${state.restaurants.length ? `<p class="count">${list.length}곳${list.length !== state.restaurants.length ? ` / 전체 ${state.restaurants.length}곳` : ''}</p>` : ''}
      ${body}
    </main>
    ${state.restaurants.length ? `<button class="fab" data-act="random" ${list.length ? '' : 'disabled'}>이 중 아무거나 추천!</button>` : ''}
  `;
  const chips = $('.filters .chips');
  if (chips) chips.scrollLeft = chipScroll;
}

async function doVisit(restaurantId) {
  const r = byId(restaurantId);
  if (!r) return;
  const prev = state.visits.find((v) => v.date === today());
  const prevRestaurant = prev ? byId(prev.restaurantId) : null;
  const { visit } = await store.recordVisit(restaurantId, today());
  await refresh();
  const replaced = prevRestaurant && prevRestaurant.id !== restaurantId;
  // 기록하자마자 평가를 묻는다. '나중에'를 고르면 다음에 앱을 열 때 다시 묻는다.
  if (ratingInProgress) return;
  ratingInProgress = true;
  try {
    await rateVisit(visit, r, replaced
      ? `오늘 방문을 '${prevRestaurant.name}'에서 바꿨습니다`
      : '오늘 방문을 기록했습니다');
  } finally {
    ratingInProgress = false;
    await refresh();
  }
}

async function undoVisit(visitId) {
  await store.cancelVisit(visitId);
  await refresh();
  toast('오늘 방문 기록을 취소했습니다.');
}

// ---------- 시트(팝업) ----------

let sheetOnClose = null;

function openSheet(html, { dismissable = true, onClose = null, animate = true } = {}) {
  const wrap = $('#sheet');
  wrap.innerHTML = `<div class="sheet-backdrop"${dismissable ? ' data-close' : ''}></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  wrap.classList.toggle('still', !animate);
  $('#toast').classList.remove('show'); // 시트 버튼을 가리지 않게 안내 문구를 내린다
  wrap.hidden = false;
  sheetOnClose = onClose;
  document.body.classList.add('lock');
  return $('.sheet', wrap);
}

function closeSheet() {
  const wrap = $('#sheet');
  if (wrap.hidden) return;
  wrap.hidden = true;
  wrap.innerHTML = '';
  if ($('#screen').hidden) document.body.classList.remove('lock');
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (cb) cb();
}

const sheetOpen = () => !$('#sheet').hidden;

// ---------- 랜덤 추천 ----------

function openRandom(excludeId = null) {
  const list = filtered();
  if (list.length === 0) return;
  const pool = list.length > 1 && excludeId ? list.filter((r) => r.id !== excludeId) : list;
  const r = pool[Math.floor(Math.random() * pool.length)];
  const last = lastVisit(r.id);
  const meta = [
    r.walkMin != null ? `도보 ${r.walkMin}분` : '',
    r.price != null ? won(r.price) : '',
    last ? `${visitLabel(last.date)} 방문` : '방문 기록 없음',
  ].filter(Boolean).join(' · ');

  const el = openSheet(`
    <p class="sheet-eyebrow">오늘은 여기 어때요</p>
    <div class="pick">
      <span class="pick-ico" aria-hidden="true">${CAT_ICON[r.category] || '🍽️'}</span>
      <h2 class="pick-menu">${esc(r.name)}</h2>
      ${r.menu ? `<p class="pick-name">${esc(r.menu)}</p>` : ''}
      <p class="pick-tags">${esc(r.category)}${r.tags.length ? ` · ${r.tags.map((t) => esc(tagLabel(t))).join(' ')}` : ''}</p>
      <p class="pick-meta">${esc(meta)}</p>
    </div>
    <div class="sheet-actions stack">
      <button class="btn btn-accent" data-pick="visit">오늘 여기 갔음</button>
      <button class="btn btn-line" data-pick="again" ${list.length > 1 ? '' : 'disabled'}>다시 뽑기</button>
      <button class="btn btn-ghost" data-close>닫기</button>
    </div>
  `, { animate: !excludeId });
  el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]')?.dataset.pick;
    if (pick === 'again') openRandom(r.id);
    if (pick === 'visit') { closeSheet(); await doVisit(r.id); }
  });
}

// ---------- 식후 평가 ----------

function askRating(visit, r, eyebrow) {
  return new Promise((resolve) => {
    const el = openSheet(`
      <p class="sheet-eyebrow">${esc(eyebrow || `${visitLabel(visit.date)} 다녀온 곳`)}</p>
      <h2 class="sheet-title">${esc(r.name)}, 어땠나요?</h2>
      ${r.menu ? `<p class="sheet-sub">${esc(r.menu)}</p>` : ''}
      <div class="rate-row">
        <button class="rate-btn good" data-rate="good"><span aria-hidden="true">😋</span>좋았음</button>
        <button class="rate-btn ok" data-rate="ok"><span aria-hidden="true">🙂</span>보통</button>
        <button class="rate-btn never" data-rate="never"><span aria-hidden="true">🙅</span>다시 안 감</button>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-line" data-rate="later">나중에</button>
        <button class="btn btn-ghost" data-rate="skip">건너뛰기</button>
      </div>
      <p class="sheet-foot">'나중에'는 다음에 앱을 열 때 다시 묻고, '건너뛰기'는 이 방문을 평가하지 않습니다.</p>
    `, { dismissable: false });
    el.addEventListener('click', (e) => {
      const value = e.target.closest('[data-rate]')?.dataset.rate;
      if (!value) return;
      closeSheet();
      resolve(value);
    });
  });
}

// 방문 1건의 평가를 받아 저장한다. '나중에'는 아무것도 저장하지 않아 다음에 다시 묻게 된다.
async function rateVisit(visit, r, eyebrow) {
  const value = await askRating(visit, r, eyebrow);
  if (value === 'later') {
    toast('다음에 앱을 열 때 다시 물어볼게요.');
    return;
  }
  if (value === 'skip') {
    await store.skipRating(visit.id);
    return;
  }
  const reasons = value === 'never' ? await askReasons(r) : [];
  await store.saveRating({ visitId: visit.id, restaurantId: r.id, value, reasons });
  toast(`'${r.name}' 평가를 남겼습니다: ${RATING_LABEL[value]}`);
}

function askReasons(r) {
  return new Promise((resolve) => {
    const picked = new Set();
    const el = openSheet(`
      <p class="sheet-eyebrow">${esc(r.name)}</p>
      <h2 class="sheet-title">어떤 점이 아쉬웠나요?</h2>
      <p class="sheet-sub">해당하는 것을 모두 골라 주세요.</p>
      <div class="chips reasons">
        ${NEVER_REASONS.map((x) => `<button class="chip" aria-pressed="false" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}
      </div>
      <div class="sheet-actions"><button class="btn btn-accent" data-save>저장</button></div>
    `, { dismissable: false });
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-reason]');
      if (chip) {
        const x = chip.dataset.reason;
        if (picked.has(x)) picked.delete(x); else picked.add(x);
        chip.classList.toggle('on', picked.has(x));
        chip.setAttribute('aria-pressed', String(picked.has(x)));
        return;
      }
      if (e.target.closest('[data-save]')) {
        closeSheet();
        resolve(NEVER_REASONS.filter((x) => picked.has(x)));
      }
    });
  });
}

let ratingInProgress = false;

// 앱을 열 때, '나중에'로 미뤄 둔 방문을 오래된 것부터 다시 묻는다.
async function promptPendingRatings() {
  if (ratingInProgress || sheetOpen() || !$('#screen').hidden) return;
  const pending = state.visits
    .filter((v) => !v.ratingSkipped && !state.ratings.some((x) => x.visitId === v.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pending.length === 0) return;

  ratingInProgress = true;
  try {
    for (const visit of pending) {
      const r = byId(visit.restaurantId);
      if (!r) continue;
      await rateVisit(visit, r);
    }
  } finally {
    ratingInProgress = false;
    await refresh();
  }
}

// ---------- 화면(전체 화면 오버레이) ----------

function openScreen(html) {
  const el = $('#screen');
  el.innerHTML = html;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.classList.add('lock');
  return el;
}

function closeScreen() {
  const el = $('#screen');
  el.hidden = true;
  el.innerHTML = '';
  el.onclick = null;
  el.oninput = null;
  el.onchange = null;
  if (!sheetOpen()) document.body.classList.remove('lock');
}

const backIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

// ---------- 식당 추가·수정 ----------

function openForm(existing = null) {
  const draft = {
    category: existing?.category || '',
    tags: new Set(existing?.tags || []),
  };

  const el = openScreen(`
    <header class="screen-top">
      <button class="icon-btn" data-form="back" aria-label="뒤로">${backIcon}</button>
      <h1>${existing ? '식당 수정' : '식당 추가'}</h1>
      <span class="spacer"></span>
    </header>
    <form class="form" novalidate>
      <label class="field">
        <span class="label">식당 이름 <em>필수</em></span>
        <input name="name" type="text" maxlength="40" autocomplete="off" placeholder="예: 할매순대국" value="${esc(existing?.name || '')}">
      </label>

      <div class="field">
        <label class="label" for="f-menu">대표 메뉴</label>
        <input id="f-menu" name="menu" type="text" maxlength="30" autocomplete="off" placeholder="직접 입력하거나 아래에서 선택" value="${esc(existing?.menu || '')}">
        <div class="menu-picks" aria-label="대표 메뉴 빠른 선택">
          ${Object.keys(MENU_TABLE).map((m) => `<button type="button" class="chip small" data-menu="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>
        <p class="hint" data-hint="menu">목록에서 고르면 카테고리와 태그가 자동으로 채워집니다.</p>
      </div>

      <div class="field">
        <span class="label">카테고리 <em>필수</em></span>
        <div class="seg" data-group="category">
          ${CATEGORIES.map((c) => `<button type="button" class="seg-btn" data-cat="${esc(c)}"><span aria-hidden="true">${CAT_ICON[c]}</span>${esc(c)}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="label">태그</span>
        <div class="chips" data-group="tags">
          ${TAGS.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(tagLabel(t))}</button>`).join('')}
        </div>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="label">가격</span>
          <span class="unit-input"><input name="price" type="number" inputmode="numeric" min="0" step="100" placeholder="8000" value="${existing?.price ?? ''}"><span>원</span></span>
        </label>
        <label class="field">
          <span class="label">도보 시간</span>
          <span class="unit-input"><input name="walkMin" type="number" inputmode="numeric" min="0" max="120" placeholder="5" value="${existing?.walkMin ?? ''}"><span>분</span></span>
        </label>
      </div>

      <p class="form-error" role="alert" hidden></p>

      <div class="form-actions">
        <button type="submit" class="btn btn-accent">${existing ? '수정 내용 저장' : '식당 저장'}</button>
        ${existing ? '<button type="button" class="btn btn-danger" data-form="delete">이 식당 삭제</button>' : ''}
      </div>
    </form>
  `);

  const form = $('form', el);
  const errorEl = $('.form-error', el);

  const paint = () => {
    el.querySelectorAll('[data-cat]').forEach((b) => {
      const on = b.dataset.cat === draft.category;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    el.querySelectorAll('[data-tag]').forEach((b) => {
      const on = draft.tags.has(b.dataset.tag);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const menu = form.menu.value.trim();
    el.querySelectorAll('[data-menu]').forEach((b) => b.classList.toggle('on', b.dataset.menu === menu));
  };

  const applyMenu = (menu) => {
    const hit = MENU_TABLE[menu];
    if (!hit) return false;
    draft.category = hit[0];
    draft.tags = new Set(hit[1]);
    $('[data-hint="menu"]', el).textContent = `'${menu}' 기준으로 카테고리와 태그를 채웠습니다. 필요하면 바꿔 주세요.`;
    return true;
  };

  paint();

  el.oninput = (e) => {
    if (e.target === form.menu) {
      applyMenu(form.menu.value.trim());
      paint();
    }
  };

  el.onclick = async (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      form.menu.value = menuBtn.dataset.menu;
      applyMenu(menuBtn.dataset.menu);
      paint();
      return;
    }
    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) { draft.category = catBtn.dataset.cat; paint(); return; }
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) {
      const t = tagBtn.dataset.tag;
      if (draft.tags.has(t)) draft.tags.delete(t); else draft.tags.add(t);
      paint();
      return;
    }
    const act = e.target.closest('[data-form]')?.dataset.form;
    if (act === 'back') closeScreen();
    if (act === 'delete') openDeleteReason(existing);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const problems = [];
    if (!name) problems.push('식당 이름을 입력해 주세요.');
    if (!draft.category) problems.push('카테고리를 선택해 주세요.');
    if (problems.length) {
      errorEl.textContent = problems.join(' ');
      errorEl.hidden = false;
      return;
    }
    const num = (v) => (v === '' || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
    await store.saveRestaurant({
      ...(existing || {}),
      name,
      category: draft.category,
      tags: TAGS.filter((t) => draft.tags.has(t)),
      menu: form.menu.value.trim(),
      price: num(form.price.value),
      walkMin: num(form.walkMin.value),
    });
    closeScreen();
    await refresh();
    toast(existing ? `'${name}' 정보를 수정했습니다.` : `'${name}'을(를) 추가했습니다.`);
  });
}

function openDeleteReason(r) {
  let reason = '';
  const el = openSheet(`
    <h2 class="sheet-title">'${esc(r.name)}'을(를) 삭제할까요?</h2>
    <p class="sheet-sub">삭제 사유만 기록으로 남고, 이 식당의 방문·평가 이력은 함께 지워집니다.</p>
    <div class="seg two" role="radiogroup" aria-label="삭제 사유">
      ${DELETE_REASONS.map((x) => `<button class="seg-btn" role="radio" aria-checked="false" data-reason="${esc(x)}">${esc(x)}</button>`).join('')}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>취소</button>
      <button class="btn btn-danger solid" data-confirm disabled>삭제</button>
    </div>
  `);
  el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-reason]');
    if (pick) {
      reason = pick.dataset.reason;
      el.querySelectorAll('[data-reason]').forEach((b) => {
        const on = b === pick;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      $('[data-confirm]', el).disabled = false;
      return;
    }
    if (e.target.closest('[data-confirm]') && reason) {
      await store.deleteRestaurant(r.id, reason);
      closeSheet();
      closeScreen();
      await refresh();
      toast(`'${r.name}'을(를) 삭제했습니다. (사유: ${reason})`);
    }
  });
}

// ---------- 데이터 관리 ----------

function validateImport(data) {
  if (!data || typeof data !== 'object' || data.app !== store.EXPORT_APP) {
    throw new Error('이 앱에서 내보낸 파일이 아닙니다.');
  }
  if (Number(data.version) > store.EXPORT_VERSION) {
    throw new Error('더 새로운 버전에서 내보낸 파일이라 읽을 수 없습니다.');
  }
  const str = (v, max = 60) => (typeof v === 'string' ? v.slice(0, max) : '');
  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const dateOk = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const arr = (v) => (Array.isArray(v) ? v : []);

  const restaurants = arr(data.restaurants)
    .filter((r) => r && typeof r.id === 'string' && str(r.name).trim() && CATEGORIES.includes(r.category))
    .map((r) => ({
      id: r.id,
      name: str(r.name).trim(),
      category: r.category,
      tags: TAGS.filter((t) => arr(r.tags).includes(t)),
      menu: str(r.menu),
      price: numOrNull(r.price),
      walkMin: numOrNull(r.walkMin),
      imageUrl: '',
      createdAt: str(r.createdAt),
      updatedAt: str(r.updatedAt),
    }));
  const ids = new Set(restaurants.map((r) => r.id));

  const seenDates = new Set();
  const visits = arr(data.visits)
    .filter((v) => v && typeof v.id === 'string' && ids.has(v.restaurantId) && dateOk(v.date))
    .filter((v) => (seenDates.has(v.date) ? false : seenDates.add(v.date)))
    .map((v) => ({
      id: v.id, restaurantId: v.restaurantId, date: v.date,
      ratingSkipped: v.ratingSkipped === true, createdAt: str(v.createdAt),
    }));
  const visitIds = new Set(visits.map((v) => v.id));

  const seenVisits = new Set();
  const ratings = arr(data.ratings)
    .filter((r) => r && typeof r.id === 'string' && visitIds.has(r.visitId) && ids.has(r.restaurantId) && r.value in RATING_LABEL)
    .filter((r) => (seenVisits.has(r.visitId) ? false : seenVisits.add(r.visitId)))
    .map((r) => ({
      id: r.id, visitId: r.visitId, restaurantId: r.restaurantId, value: r.value,
      reasons: NEVER_REASONS.filter((x) => arr(r.reasons).includes(x)), createdAt: str(r.createdAt),
    }));

  const deletions = arr(data.deletions)
    .filter((d) => d && typeof d.id === 'string' && str(d.name) && DELETE_REASONS.includes(d.reason))
    .map((d) => ({ id: d.id, name: str(d.name), reason: d.reason, deletedAt: str(d.deletedAt) }));

  return { restaurants, visits, ratings, deletions };
}

async function exportData() {
  const data = await store.exportAll();
  const text = JSON.stringify(data, null, 2);
  const name = `lunch-notebook-${today()}.json`;
  const file = new File([text], name, { type: 'application/json' });

  // 폰에서는 공유 시트("파일에 저장")를 쓰고, 그 밖에는 바로 내려받는다.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '점심 식당 수첩 데이터' });
      toast('데이터를 내보냈습니다.');
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(`${name} 파일로 내보냈습니다.`);
}

function confirmImport(clean) {
  const el = openSheet(`
    <h2 class="sheet-title">파일 내용으로 바꿀까요?</h2>
    <p class="sheet-sub">지금 저장된 데이터(식당 ${state.restaurants.length}곳, 방문 ${state.visits.length}건)를 지우고
    파일의 데이터(식당 ${clean.restaurants.length}곳, 방문 ${clean.visits.length}건, 평가 ${clean.ratings.length}건)로 덮어씁니다.</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>취소</button>
      <button class="btn btn-accent" data-confirm>덮어쓰기</button>
    </div>
  `);
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-confirm]')) return;
    await store.importAll(clean);
    closeSheet();
    closeScreen();
    state.category = '전체';
    state.tags.clear();
    await refresh();
    toast(`데이터를 가져왔습니다. (식당 ${clean.restaurants.length}곳)`);
  });
}

async function openData() {
  const deletions = (await store.listDeletions()).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  const el = openScreen(`
    <header class="screen-top">
      <button class="icon-btn" data-data="back" aria-label="뒤로">${backIcon}</button>
      <h1>데이터 관리</h1>
      <span class="spacer"></span>
    </header>
    <div class="data">
      <section class="panel">
        <dl class="stats">
          <div><dt>식당</dt><dd>${state.restaurants.length}</dd></div>
          <div><dt>방문</dt><dd>${state.visits.length}</dd></div>
          <div><dt>평가</dt><dd>${state.ratings.length}</dd></div>
        </dl>
        <p class="note">모든 데이터는 <strong>이 기기 안에만</strong> 저장됩니다. 앱을 홈 화면에서 지우거나 기기를 바꾸면 사라지므로, 가끔 파일로 내보내 보관해 주세요.</p>
      </section>

      <section class="panel">
        <h2>내보내기</h2>
        <p>식당, 방문 기록, 평가, 삭제 기록을 JSON 파일 하나로 저장합니다.</p>
        <button class="btn btn-ink" data-data="export">JSON 파일로 내보내기</button>
      </section>

      <section class="panel">
        <h2>가져오기</h2>
        <p>내보낸 파일로 데이터를 복원합니다. 지금 있는 데이터는 지워지고 파일 내용으로 바뀝니다.</p>
        <label class="btn btn-line file-btn">
          JSON 파일 선택
          <input type="file" accept="application/json,.json" data-data="import" hidden>
        </label>
        <p class="form-error" role="alert" hidden></p>
      </section>

      <section class="panel">
        <h2>삭제 기록</h2>
        ${deletions.length
          ? `<ul class="log">${deletions.map((d) => `<li><span>${esc(d.name)}</span><span class="muted">${esc(d.reason)} · ${esc(String(d.deletedAt).slice(0, 10))}</span></li>`).join('')}</ul>`
          : '<p class="muted">삭제한 식당이 없습니다.</p>'}
      </section>
    </div>
  `);

  el.onclick = (e) => {
    const act = e.target.closest('[data-data]')?.dataset.data;
    if (act === 'back') closeScreen();
    if (act === 'export') exportData();
  };
  el.onchange = async (e) => {
    if (e.target.dataset.data !== 'import') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const errorEl = $('.form-error', el);
    errorEl.hidden = true;
    try {
      const clean = validateImport(JSON.parse(await file.text()));
      confirmImport(clean);
    } catch (err) {
      errorEl.textContent = err instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다.' : err.message;
      errorEl.hidden = false;
    }
  };
}

// ---------- 이벤트 ----------

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') && e.target.closest('#sheet')) closeSheet();
});

$('#app').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id, value } = btn.dataset;
  switch (act) {
    case 'tab': state.category = value; renderHome(); break;
    case 'tag':
      if (state.tags.has(value)) state.tags.delete(value); else state.tags.add(value);
      renderHome();
      break;
    case 'clear-filter': state.category = '전체'; state.tags.clear(); renderHome(); break;
    case 'add': openForm(); break;
    case 'edit': { const r = byId(id); if (r) openForm(r); break; }
    case 'visit': await doVisit(id); break;
    case 'unvisit': await undoVisit(id); break;
    case 'random': openRandom(); break;
    case 'data': await openData(); break;
    case 'install-guide': openInstallGuide(); break;
    case 'install-dismiss': storageSet('installGuideDismissed', '1'); renderHome(); break;
    default:
  }
});

let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  await refresh().catch(() => {});
  if (away >= REOPEN_AFTER_MS) promptPendingRatings();
});

// ---------- 시작 ----------

async function start() {
  try {
    await reload();
  } catch (err) {
    $('#app').innerHTML = `<div class="empty"><h2>저장소를 열 수 없어요</h2><p>사생활 보호 모드에서는 데이터를 저장할 수 없습니다. 일반 창에서 다시 열어 주세요.</p></div>`;
    console.error(err);
    return;
  }
  renderHome();
  store.requestPersistence();
  promptPendingRatings();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
  }
}

start();
