import { useEffect } from 'react';
import Avatar from './Avatar';
import { timeAgo } from '../filters';

export default function Stories({ user, groups, onOpen, onAdd, onProfile, onRefresh }) {
  useEffect(() => {
    onRefresh();
  }, []);
  const mine = groups.find((g) => g.mine);
  const myIndex = groups.indexOf(mine);
  const others = groups.map((g, i) => ({ g, i })).filter(({ g }) => !g.mine);

  return (
    <div className="screen panel">
      <header className="panel-header">
        <button className="icon-btn avatar-btn" onClick={onProfile} aria-label="Profil">
          <Avatar user={user} size={36} />
        </button>
        <h2>Stories</h2>
        <span className="icon-btn placeholder" />
      </header>
      <div className="list">
        <h3 className="section-title">Ma Story</h3>
        <div className="row">
          <button className="row-tap" onClick={() => (mine ? onOpen(myIndex) : onAdd())}>
            <Avatar user={user} ring={mine ? 'seen' : null} />
            <div className="row-main">
              <strong>Ma Story</strong>
              <span className="muted">
                {mine
                  ? `${mine.stories.length} snap${mine.stories.length > 1 ? 's' : ''} · 👁 ${mine.stories.reduce((n, s) => n + (s.views || 0), 0)} vue(s)`
                  : 'Appuyez pour ajouter un snap à votre story'}
              </span>
            </div>
          </button>
          <button className="icon-btn dark small" onClick={onAdd} aria-label="Ajouter à ma story">+</button>
        </div>
        <h3 className="section-title">Amis</h3>
        {!others.length && <p className="empty">Aucune story récente de vos amis.</p>}
        <div className="story-grid">
          {others.map(({ g, i }) => (
            <button key={g.user.id} className={`story-card ${g.allSeen ? 'seen' : ''}`} onClick={() => onOpen(i)}>
              <Avatar user={g.user} size={64} ring={g.allSeen ? 'seen' : 'new'} />
              <strong>{g.user.displayName}</strong>
              <span className="muted small">{timeAgo(g.stories.at(-1).createdAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
