import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../api';

export default function SendTo({ user, friends, conversations = [], preselect, onBack, onSend }) {
  const [selected, setSelected] = useState(() => new Set(preselect ? [preselect] : []));
  const [story, setStory] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [known, setKnown] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const others = conversations.filter((c) => c.canSnap);
  const listedIds = new Set([...friends, ...others].map((u) => u.id));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setFound([]);
    const t = setTimeout(
      () =>
        api(`/users/search?q=${encodeURIComponent(term)}`)
          .then((d) => setFound(d.users.filter((u) => u.canSnap && !listedIds.has(u.id))))
          .catch(() => {}),
      250
    );
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (u) => {
    setKnown((prev) => ({ ...prev, [u.id]: u }));
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(u.id) ? s.delete(u.id) : s.add(u.id);
      return s;
    });
  };

  const match = (f) => `${f.displayName} ${f.username}`.toLowerCase().includes(q.toLowerCase());
  const byId = { ...known, ...Object.fromEntries([...friends, ...others].map((u) => [u.id, u])) };
  const names = [...(story ? ['Ma Story'] : []), ...[...selected].map((id) => byId[id]?.displayName).filter(Boolean)];

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await onSend([...selected], story);
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  };

  const row = (f, sub) => (
    <button key={f.id} className={`row selectable ${selected.has(f.id) ? 'selected' : ''}`} onClick={() => toggle(f)}>
      <Avatar user={f} />
      <div className="row-main">
        <strong>{f.displayName}</strong>
        <span className="muted">{sub || `@${f.username}`}</span>
      </div>
      <span className="check">{selected.has(f.id) ? '✓' : ''}</span>
    </button>
  );

  return (
    <div className="screen panel overlay-screen">
      <header className="panel-header">
        <button className="icon-btn dark" onClick={onBack} aria-label="Retour">‹</button>
        <h2>Envoyer à…</h2>
        <span className="icon-btn placeholder" />
      </header>
      <input className="search" placeholder="Rechercher un ami ou un utilisateur" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" />
      <div className="list">
        <h3 className="section-title">Stories</h3>
        <button className={`row selectable ${story ? 'selected' : ''}`} onClick={() => setStory(!story)}>
          <div className="avatar story-avatar">+</div>
          <div className="row-main">
            <strong>Ma Story</strong>
            <span className="muted">
              {user?.storyPrivacy === 'everyone' ? 'Visible par tout le monde pendant 24 h' : 'Visible par vos amis pendant 24 h'}
            </span>
          </div>
          <span className="check">{story ? '✓' : ''}</span>
        </button>
        <h3 className="section-title">Amis</h3>
        {!friends.length && <p className="empty">Ajoutez des amis depuis votre profil pour leur envoyer des snaps.</p>}
        {friends.filter(match).map((f) => row(f))}
        {others.filter(match).length > 0 && (
          <>
            <h3 className="section-title">Autres discussions</h3>
            {others.filter(match).map((f) => row(f))}
          </>
        )}
        {found.length > 0 && (
          <>
            <h3 className="section-title">Accepte les snaps de tout le monde</h3>
            {found.map((f) => row(f))}
          </>
        )}
      </div>
      {error && <div className="error floating">{error}</div>}
      {names.length > 0 && (
        <div className="send-bar">
          <span className="send-names">{names.join(', ')}</span>
          <button className="send-arrow" onClick={send} disabled={sending} aria-label="Envoyer">
            {sending ? '…' : '➤'}
          </button>
        </div>
      )}
    </div>
  );
}
