const DB_NAME = 'snapflash-outbox';
const STORE = 'items';
let dbPromise;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const addToOutbox = (item) => run('readwrite', (s) => s.add({ ...item, createdAt: Date.now() }));
export const outboxItems = () => run('readonly', (s) => s.getAll());
export const removeFromOutbox = (id) => run('readwrite', (s) => s.delete(id));
export const clearOutbox = () => run('readwrite', (s) => s.clear());

export async function snapItem(draft, recipients, story) {
  return {
    type: 'snap',
    media: await draft.media.arrayBuffer(),
    mediaType: draft.media.type,
    overlay: draft.overlay ? await draft.overlay.arrayBuffer() : null,
    duration: draft.duration,
    meta: draft.meta,
    recipients,
    story,
  };
}

export function snapForm(item) {
  const form = new FormData();
  const ext = item.mediaType.split('/')[1]?.split(';')[0] || 'bin';
  form.append('media', new Blob([item.media], { type: item.mediaType }), `media.${ext}`);
  if (item.overlay) form.append('overlay', new Blob([item.overlay], { type: 'image/png' }), 'overlay.png');
  form.append('duration', String(item.duration));
  form.append('meta', JSON.stringify(item.meta));
  form.append('recipients', JSON.stringify(item.recipients));
  form.append('story', String(item.story));
  return form;
}
