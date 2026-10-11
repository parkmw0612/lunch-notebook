// 저장 계층.
// 화면 코드(app.js)는 이 파일이 내보내는 함수만 호출한다.
// 팀 버전에서는 같은 함수 이름을 유지한 채 내부를 서버 API 호출로 바꾸면 된다.

const DB_NAME = 'lunch-notebook';
const DB_VERSION = 1;
const STORES = ['restaurants', 'visits', 'ratings', 'deletions'];

export const EXPORT_APP = 'lunch-notebook';
export const EXPORT_VERSION = 1;

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function getAll(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(name).objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 쓰기는 미리 읽어 둔 값으로 put/delete만 동기적으로 나열한다.
// (트랜잭션 안에서 await를 쓰지 않아 브라우저별 차이를 피한다.)
async function write(stores, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장 작업이 취소되었습니다.'));
    try {
      fn((name) => tx.objectStore(name));
    } catch (err) {
      try { tx.abort(); } catch { /* 이미 끝난 트랜잭션 */ }
      reject(err);
    }
  });
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

// ---------- 조회 ----------

export const listRestaurants = () => getAll('restaurants');
export const listVisits = () => getAll('visits');
export const listRatings = () => getAll('ratings');
export const listDeletions = () => getAll('deletions');

// ---------- 식당 ----------

export async function saveRestaurant(input) {
  const record = {
    id: input.id || newId(),
    name: input.name,
    category: input.category,
    tags: [...input.tags],
    menu: input.menu || '',
    price: input.price ?? null,
    walkMin: input.walkMin ?? null,
    imageUrl: input.imageUrl || '', // 다음 단계(대표 메뉴 이미지)용 빈 칸
    createdAt: input.createdAt || now(),
    updatedAt: now(),
  };
  await write(['restaurants'], (s) => s('restaurants').put(record));
  return record;
}

// 삭제 사유만 기록으로 남기고 방문·평가 이력은 함께 지운다.
export async function deleteRestaurant(id, reason) {
  const [restaurants, visits, ratings] = await Promise.all([
    getAll('restaurants'), getAll('visits'), getAll('ratings'),
  ]);
  const target = restaurants.find((r) => r.id === id);
  if (!target) return;
  await write(['restaurants', 'visits', 'ratings', 'deletions'], (s) => {
    s('restaurants').delete(id);
    for (const v of visits) if (v.restaurantId === id) s('visits').delete(v.id);
    for (const r of ratings) if (r.restaurantId === id) s('ratings').delete(r.id);
    s('deletions').put({ id: newId(), name: target.name, reason, deletedAt: now() });
  });
}

// ---------- 방문 ----------

// 방문 기록은 하루 1곳. 같은 날 다른 식당을 기록하면 교체한다.
export async function recordVisit(restaurantId, date) {
  const [visits, ratings] = await Promise.all([getAll('visits'), getAll('ratings')]);
  const sameDay = visits.filter((v) => v.date === date);
  const visit = { id: newId(), restaurantId, date, ratingSkipped: false, createdAt: now() };
  await write(['visits', 'ratings'], (s) => {
    for (const old of sameDay) {
      s('visits').delete(old.id);
      for (const r of ratings) if (r.visitId === old.id) s('ratings').delete(r.id);
    }
    s('visits').put(visit);
  });
  return { visit, replacedRestaurantId: sameDay[0]?.restaurantId ?? null };
}

export async function cancelVisit(visitId) {
  const ratings = await getAll('ratings');
  await write(['visits', 'ratings'], (s) => {
    s('visits').delete(visitId);
    for (const r of ratings) if (r.visitId === visitId) s('ratings').delete(r.id);
  });
}

// ---------- 평가 ----------

// 방문 기록 1건당 평가 1회.
export async function saveRating({ visitId, restaurantId, value, reasons = [] }) {
  const ratings = await getAll('ratings');
  const rating = { id: newId(), visitId, restaurantId, value, reasons: [...reasons], createdAt: now() };
  await write(['ratings'], (s) => {
    for (const r of ratings) if (r.visitId === visitId) s('ratings').delete(r.id);
    s('ratings').put(rating);
  });
  return rating;
}

export async function skipRating(visitId) {
  const visits = await getAll('visits');
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) return;
  await write(['visits'], (s) => s('visits').put({ ...visit, ratingSkipped: true }));
}

// ---------- 내보내기·가져오기 ----------

export async function exportAll() {
  const [restaurants, visits, ratings, deletions] = await Promise.all(STORES.map(getAll));
  return {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt: now(),
    restaurants, visits, ratings, deletions,
  };
}

// 기존 데이터를 지우고 파일 내용으로 덮어쓴다.
export async function importAll(data) {
  await write(STORES, (s) => {
    for (const name of STORES) {
      const store = s(name);
      store.clear();
      for (const row of data[name] || []) store.put(row);
    }
  });
}

// 브라우저가 저장소를 임의로 비우지 않도록 요청한다(지원하는 경우에만).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* 지원하지 않는 브라우저 */ }
  return false;
}
