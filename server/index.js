import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { Server } from 'socket.io';
import { db, MEDIA_DIR, removeMediaFile } from './db.js';

const PORT = Number(process.env.PORT || 3001);
const HOUR = 3600_000;
const STORY_TTL = 24 * HOUR;
const MESSAGE_TTL = 24 * HOUR;
const UNOPENED_SNAP_TTL = 30 * 24 * HOUR;
const COLORS = ['#FFFC00', '#FF4D6D', '#4DA3FF', '#7CFF6B', '#C77DFF', '#FF9F1C', '#2EC4B6'];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const now = () => Date.now();
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const publicUser = (u) => u && { id: u.id, username: u.username, displayName: u.display_name, color: u.color };
const emitTo = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
  return token;
}

function userFromToken(token) {
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ error: 'Non authentifié' });
  req.user = user;
  req.token = token;
  next();
}

function areFriends(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted' AND
       ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`
    )
    .get(a, b, b, a);
}

function friendIds(userId) {
  return db
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS id
       FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
    )
    .all(userId, userId, userId)
    .map((r) => r.id);
}

/* ---------- Auth ---------- */

const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const key = req.ip;
  const t = now();
  const entry = authAttempts.get(key);
  if (!entry || t - entry.start > 15 * 60_000) {
    authAttempts.set(key, { start: t, count: 1 });
    return next();
  }
  if (++entry.count > 30) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans quelques minutes' });
  next();
}
setInterval(() => {
  const t = now();
  for (const [k, v] of authAttempts) if (t - v.start > 15 * 60_000) authAttempts.delete(k);
}, 5 * 60_000).unref();

app.post('/api/register', authRateLimit, (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const displayName = String(req.body.displayName || '').trim() || username;
  const password = String(req.body.password || '');
  if (!/^[a-z0-9._]{3,20}$/.test(username))
    return res.status(400).json({ error: "Nom d'utilisateur : 3 à 20 caractères (lettres, chiffres, . ou _)" });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" });
  const salt = crypto.randomBytes(16).toString('hex');
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (username, display_name, pass_hash, salt, color, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(username, displayName.slice(0, 30), hashPassword(password, salt), salt, color, now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.json({ token: createSession(user.id), user: publicUser(user) });
});

app.post('/api/login', authRateLimit, (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const ok =
    user &&
    crypto.timingSafeEqual(Buffer.from(hashPassword(String(req.body.password || ''), user.salt), 'hex'), Buffer.from(user.pass_hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: createSession(user.id), user: publicUser(user) });
});

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- Amis ---------- */

app.get('/api/friends', auth, (req, res) => {
  const me = req.user.id;
  const friends = db
    .prepare(
      `SELECT u.* FROM users u WHERE u.id IN (
         SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
         FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?))`
    )
    .all(me, me, me)
    .map((u) => {
      const unreadSnaps = db
        .prepare('SELECT id, media_type, created_at FROM snaps WHERE sender_id = ? AND recipient_id = ? AND opened_at IS NULL ORDER BY created_at')
        .all(u.id, me);
      const unreadMessages = db
        .prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL')
        .get(u.id, me).n;
      const lastSent = db
        .prepare('SELECT media_type, created_at, opened_at FROM snaps WHERE sender_id = ? AND recipient_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(me, u.id);
      const lastMsg = db
        .prepare(
          `SELECT sender_id, created_at, read_at FROM messages
           WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(me, u.id, u.id, me);
      const lastReceivedSnap = db
        .prepare('SELECT media_type, created_at, opened_at FROM snaps WHERE sender_id = ? AND recipient_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(u.id, me);
      const lastActivity = Math.max(
        lastSent?.created_at || 0,
        lastMsg?.created_at || 0,
        lastReceivedSnap?.opened_at || lastReceivedSnap?.created_at || 0
      );
      return {
        ...publicUser(u),
        unreadSnaps: unreadSnaps.map((s) => ({ id: s.id, mediaType: s.media_type, createdAt: s.created_at })),
        unreadMessages,
        lastSent: lastSent && { mediaType: lastSent.media_type, createdAt: lastSent.created_at, openedAt: lastSent.opened_at },
        lastReceived: lastReceivedSnap && {
          mediaType: lastReceivedSnap.media_type,
          createdAt: lastReceivedSnap.created_at,
          openedAt: lastReceivedSnap.opened_at,
        },
        lastMessage: lastMsg && { mine: lastMsg.sender_id === me, createdAt: lastMsg.created_at, readAt: lastMsg.read_at },
        lastActivity,
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  const incoming = db
    .prepare(`SELECT u.* FROM friendships f JOIN users u ON u.id = f.requester_id WHERE f.addressee_id = ? AND f.status = 'pending'`)
    .all(me)
    .map(publicUser);
  const outgoing = db
    .prepare(`SELECT u.* FROM friendships f JOIN users u ON u.id = f.addressee_id WHERE f.requester_id = ? AND f.status = 'pending'`)
    .all(me)
    .map(publicUser);
  res.json({ friends, incoming, outgoing });
});

app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const users = db
    .prepare('SELECT * FROM users WHERE id != ? AND (username LIKE ? OR display_name LIKE ?) LIMIT 20')
    .all(req.user.id, `%${q}%`, `%${q}%`)
    .map(publicUser);
  res.json({ users });
});

app.post('/api/friends/request', auth, (req, res) => {
  const me = req.user.id;
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim().toLowerCase());
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (target.id === me) return res.status(400).json({ error: 'Vous ne pouvez pas vous ajouter vous-même' });
  const reverse = db.prepare('SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ?').get(target.id, me);
  if (reverse) {
    if (reverse.status === 'pending') {
      db.prepare(`UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?`).run(target.id, me);
      emitTo(target.id, 'friends:changed', {});
    }
    return res.json({ status: 'accepted' });
  }
  const existing = db.prepare('SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ?').get(me, target.id);
  if (existing) return res.json({ status: existing.status });
  db.prepare(`INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)`).run(me, target.id, now());
  emitTo(target.id, 'friends:changed', { request: publicUser(req.user) });
  res.json({ status: 'pending' });
});

app.post('/api/friends/:id/accept', auth, (req, res) => {
  const other = Number(req.params.id);
  const r = db
    .prepare(`UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`)
    .run(other, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Demande introuvable' });
  emitTo(other, 'friends:changed', {});
  res.json({ ok: true });
});

app.delete('/api/friends/:id', auth, (req, res) => {
  const other = Number(req.params.id);
  db.prepare('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)').run(
    req.user.id, other, other, req.user.id
  );
  emitTo(other, 'friends:changed', {});
  res.json({ ok: true });
});

/* ---------- Snaps & Stories ---------- */

const ALLOWED_FILTERS = new Set(['normal', 'noir', 'sepia', 'vintage', 'chaud', 'froid', 'neon', 'drama', 'reve', 'inverse']);

function parseSnapUpload(req) {
  const media = req.files?.media?.[0];
  const overlay = req.files?.overlay?.[0];
  if (!media) throw new Error('Média manquant');
  const mediaType = media.mimetype.startsWith('video/') ? 'video' : media.mimetype.startsWith('image/') ? 'image' : null;
  if (!mediaType) throw new Error('Format non supporté');
  const duration = Math.max(0, Math.min(10, parseInt(req.body.duration, 10) || 0));
  let meta = {};
  try {
    const m = JSON.parse(req.body.meta || '{}');
    meta = { filter: ALLOWED_FILTERS.has(m.filter) ? m.filter : 'normal', mirror: !!m.mirror };
  } catch {
    meta = { filter: 'normal', mirror: false };
  }
  return { media, overlay, mediaType, duration, meta };
}

function copyMedia(name) {
  const copy = crypto.randomBytes(16).toString('hex');
  fs.copyFileSync(path.join(MEDIA_DIR, name), path.join(MEDIA_DIR, copy));
  return copy;
}

app.post(
  '/api/snaps',
  auth,
  upload.fields([{ name: 'media', maxCount: 1 }, { name: 'overlay', maxCount: 1 }]),
  (req, res) => {
    let parsed;
    try {
      parsed = parseSnapUpload(req);
    } catch (e) {
      Object.values(req.files || {}).flat().forEach((f) => removeMediaFile(f.filename));
      return res.status(400).json({ error: e.message });
    }
    const { media, overlay, mediaType, duration, meta } = parsed;
    const me = req.user.id;
    let recipients = [];
    try {
      recipients = JSON.parse(req.body.recipients || '[]').map(Number).filter((id) => areFriends(me, id));
    } catch {}
    const toStory = req.body.story === 'true';
    if (!recipients.length && !toStory) {
      removeMediaFile(media.filename);
      removeMediaFile(overlay?.filename);
      return res.status(400).json({ error: 'Choisissez au moins un destinataire' });
    }

    const metaJson = JSON.stringify(meta);
    const insertSnap = db.prepare(
      `INSERT INTO snaps (sender_id, recipient_id, media_file, overlay_file, media_type, mime, duration, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const targets = [...recipients.map((id) => ({ kind: 'snap', id })), ...(toStory ? [{ kind: 'story' }] : [])];
    targets.forEach((t, i) => {
      const last = i === targets.length - 1;
      const mFile = last ? media.filename : copyMedia(media.filename);
      const oFile = overlay ? (last ? overlay.filename : copyMedia(overlay.filename)) : null;
      if (t.kind === 'snap') {
        const { lastInsertRowid } = insertSnap.run(me, t.id, mFile, oFile, mediaType, media.mimetype, duration, metaJson, now());
        emitTo(t.id, 'snap:new', { id: Number(lastInsertRowid), from: publicUser(req.user), mediaType });
      } else {
        db.prepare(
          `INSERT INTO stories (user_id, media_file, overlay_file, media_type, mime, duration, meta, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(me, mFile, oFile, mediaType, media.mimetype, duration || 5, metaJson, now(), now() + STORY_TTL);
        friendIds(me).forEach((fid) => emitTo(fid, 'story:new', { from: publicUser(req.user) }));
      }
    });
    res.json({ ok: true, sent: recipients.length, story: toStory });
  }
);

function readAsDataUrl(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(path.join(MEDIA_DIR, file)).toString('base64')}`;
}

// Ouvre un snap : renvoie le contenu une seule fois puis le supprime définitivement du serveur.
app.post('/api/snaps/:id/open', auth, (req, res) => {
  const snap = db.prepare('SELECT * FROM snaps WHERE id = ? AND recipient_id = ?').get(Number(req.params.id), req.user.id);
  if (!snap) return res.status(404).json({ error: 'Snap introuvable' });
  if (snap.opened_at || !snap.media_file) return res.status(410).json({ error: 'Ce snap a déjà été ouvert' });
  let payload;
  try {
    payload = {
      id: snap.id,
      mediaType: snap.media_type,
      duration: snap.duration,
      meta: JSON.parse(snap.meta),
      media: readAsDataUrl(snap.media_file, snap.mime),
      overlay: snap.overlay_file ? readAsDataUrl(snap.overlay_file, 'image/png') : null,
    };
  } catch {
    return res.status(410).json({ error: 'Média expiré' });
  }
  db.prepare('UPDATE snaps SET opened_at = ?, media_file = NULL, overlay_file = NULL WHERE id = ?').run(now(), snap.id);
  removeMediaFile(snap.media_file);
  removeMediaFile(snap.overlay_file);
  emitTo(snap.sender_id, 'snap:opened', { id: snap.id, by: req.user.id });
  res.json(payload);
});

app.get('/api/stories', auth, (req, res) => {
  const me = req.user.id;
  const ids = [me, ...friendIds(me)];
  const rows = db
    .prepare(
      `SELECT s.id, s.user_id, s.media_type, s.created_at, s.expires_at,
              (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS views,
              EXISTS(SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = ?) AS seen
       FROM stories s WHERE s.expires_at > ? AND s.user_id IN (${ids.map(() => '?').join(',')})
       ORDER BY s.created_at`
    )
    .all(me, now(), ...ids);
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
      byUser.set(r.user_id, { user: publicUser(u), mine: r.user_id === me, stories: [] });
    }
    byUser.get(r.user_id).stories.push({
      id: r.id,
      mediaType: r.media_type,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      seen: !!r.seen,
      views: r.user_id === me ? r.views : undefined,
    });
  }
  const groups = [...byUser.values()].map((g) => ({ ...g, allSeen: g.stories.every((s) => s.seen) }));
  groups.sort((a, b) => (a.mine ? -1 : b.mine ? 1 : a.allSeen - b.allSeen || b.stories.at(-1).createdAt - a.stories.at(-1).createdAt));
  res.json({ groups });
});

app.get('/api/stories/:id', auth, (req, res) => {
  const me = req.user.id;
  const s = db.prepare('SELECT * FROM stories WHERE id = ? AND expires_at > ?').get(Number(req.params.id), now());
  if (!s || (s.user_id !== me && !areFriends(me, s.user_id))) return res.status(404).json({ error: 'Story introuvable' });
  if (s.user_id !== me) {
    db.prepare('INSERT OR IGNORE INTO story_views (story_id, viewer_id, viewed_at) VALUES (?, ?, ?)').run(s.id, me, now());
  }
  const viewers =
    s.user_id === me
      ? db
          .prepare('SELECT u.* FROM story_views v JOIN users u ON u.id = v.viewer_id WHERE v.story_id = ? ORDER BY v.viewed_at DESC')
          .all(s.id)
          .map(publicUser)
      : undefined;
  res.json({
    id: s.id,
    mediaType: s.media_type,
    duration: s.duration,
    meta: JSON.parse(s.meta),
    media: readAsDataUrl(s.media_file, s.mime),
    overlay: s.overlay_file ? readAsDataUrl(s.overlay_file, 'image/png') : null,
    createdAt: s.created_at,
    viewers,
  });
});

app.delete('/api/stories/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!s) return res.status(404).json({ error: 'Story introuvable' });
  db.prepare('DELETE FROM stories WHERE id = ?').run(s.id);
  removeMediaFile(s.media_file);
  removeMediaFile(s.overlay_file);
  res.json({ ok: true });
});

/* ---------- Messages éphémères ---------- */

const publicMessage = (m) => ({
  id: m.id,
  senderId: m.sender_id,
  recipientId: m.recipient_id,
  body: m.body,
  createdAt: m.created_at,
  readAt: m.read_at,
  saved: !!m.saved,
});

app.get('/api/messages/:friendId', auth, (req, res) => {
  const me = req.user.id;
  const other = Number(req.params.friendId);
  if (!areFriends(me, other)) return res.status(403).json({ error: "Vous n'êtes pas amis" });
  const unread = db.prepare('SELECT id FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').all(other, me);
  if (unread.length) {
    const t = now();
    db.prepare('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').run(t, other, me);
    emitTo(other, 'message:read', { ids: unread.map((r) => r.id), by: me, readAt: t });
  }
  const messages = db
    .prepare(
      `SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at`
    )
    .all(me, other, other, me)
    .map(publicMessage);
  res.json({ messages });
});

app.post('/api/messages/:friendId', auth, (req, res) => {
  const me = req.user.id;
  const other = Number(req.params.friendId);
  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Message vide' });
  if (!areFriends(me, other)) return res.status(403).json({ error: "Vous n'êtes pas amis" });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(me, other, body, now());
  const msg = publicMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid));
  emitTo(other, 'message:new', { message: msg, from: publicUser(req.user) });
  res.json({ message: msg });
});

app.post('/api/messages/item/:id/read', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND recipient_id = ?').get(Number(req.params.id), req.user.id);
  if (!m) return res.status(404).json({ error: 'Message introuvable' });
  if (!m.read_at) {
    const t = now();
    db.prepare('UPDATE messages SET read_at = ? WHERE id = ?').run(t, m.id);
    emitTo(m.sender_id, 'message:read', { ids: [m.id], by: req.user.id, readAt: t });
  }
  res.json({ ok: true });
});

app.post('/api/messages/item/:id/save', auth, (req, res) => {
  const me = req.user.id;
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)').get(Number(req.params.id), me, me);
  if (!m) return res.status(404).json({ error: 'Message introuvable' });
  const saved = m.saved ? 0 : 1;
  db.prepare('UPDATE messages SET saved = ? WHERE id = ?').run(saved, m.id);
  const other = m.sender_id === me ? m.recipient_id : m.sender_id;
  emitTo(other, 'message:saved', { id: m.id, saved: !!saved });
  res.json({ saved: !!saved });
});

// Quand on quitte une conversation, les messages lus et non enregistrés disparaissent (pour les deux).
function purgeReadMessages(me, other) {
  const rows = db
    .prepare(
      `SELECT id FROM messages WHERE saved = 0 AND read_at IS NOT NULL AND
       ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))`
    )
    .all(other, me, me, other);
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  db.prepare(`DELETE FROM messages WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  emitTo(other, 'messages:deleted', { ids });
  emitTo(me, 'messages:deleted', { ids });
}

app.post('/api/messages/:friendId/leave', auth, (req, res) => {
  purgeReadMessages(req.user.id, Number(req.params.friendId));
  res.json({ ok: true });
});

/* ---------- Temps réel ---------- */

const online = new Map();

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  online.set(user.id, (online.get(user.id) || 0) + 1);
  socket.on('typing', ({ to, typing }) => {
    if (areFriends(user.id, Number(to))) emitTo(Number(to), 'typing', { from: user.id, typing: !!typing });
  });
  socket.on('disconnect', () => {
    const n = (online.get(user.id) || 1) - 1;
    if (n <= 0) online.delete(user.id);
    else online.set(user.id, n);
  });
});

/* ---------- Nettoyage périodique ---------- */

function cleanup() {
  const t = now();
  for (const s of db.prepare('SELECT * FROM stories WHERE expires_at <= ?').all(t)) {
    removeMediaFile(s.media_file);
    removeMediaFile(s.overlay_file);
  }
  db.prepare('DELETE FROM stories WHERE expires_at <= ?').run(t);
  for (const s of db.prepare('SELECT * FROM snaps WHERE opened_at IS NULL AND created_at <= ?').all(t - UNOPENED_SNAP_TTL)) {
    removeMediaFile(s.media_file);
    removeMediaFile(s.overlay_file);
  }
  db.prepare('DELETE FROM snaps WHERE opened_at IS NULL AND created_at <= ?').run(t - UNOPENED_SNAP_TTL);
  db.prepare('DELETE FROM snaps WHERE opened_at IS NOT NULL AND opened_at <= ?').run(t - 7 * 24 * HOUR);
  db.prepare('DELETE FROM messages WHERE saved = 0 AND created_at <= ?').run(t - MESSAGE_TTL);
}
cleanup();
setInterval(cleanup, 60_000).unref();

/* ---------- Frontend ---------- */

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => console.log(`SnapFlash en écoute sur http://localhost:${PORT}`));
