import { useState } from 'react';
import Avatar from './Avatar';

export default function SendTo({ friends, preselect, onBack, onSend }) {
  const [selected, setSelected] = useState(() => new Set(preselect ? [preselect] : []));
  const [story, setStory] = useState(false);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const visible = friends.filter((f) => `${f.displayName} ${f.username}`.toLowerCase().includes(q.toLowerCase()));
  const names = [...(story ? ['Ma Story'] : []), ...friends.filter((f) => selected.has(f.id)).map((f) => f.displayName)];

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

  return (
    <div className="screen panel overlay-screen">
      <header className="panel-header">
        <button className="icon-btn dark" onClick={onBack} aria-label="Retour">‹</button>
        <h2>Envoyer à…</h2>
        <span className="icon-btn placeholder" />
      </header>
      <input className="search" placeholder="Rechercher un ami" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list">
        <h3 className="section-title">Stories</h3>
        <button className={`row selectable ${story ? 'selected' : ''}`} onClick={() => setStory(!story)}>
          <div className="avatar story-avatar">+</div>
          <div className="row-main">
            <strong>Ma Story</strong>
            <span className="muted">Visible par vos amis pendant 24 h</span>
          </div>
          <span className="check">{story ? '✓' : ''}</span>
        </button>
        <h3 className="section-title">Amis</h3>
        {!friends.length && <p className="empty">Ajoutez des amis depuis votre profil pour leur envoyer des snaps.</p>}
        {visible.map((f) => (
          <button key={f.id} className={`row selectable ${selected.has(f.id) ? 'selected' : ''}`} onClick={() => toggle(f.id)}>
            <Avatar user={f} />
            <div className="row-main">
              <strong>{f.displayName}</strong>
              <span className="muted">@{f.username}</span>
            </div>
            <span className="check">{selected.has(f.id) ? '✓' : ''}</span>
          </button>
        ))}
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
