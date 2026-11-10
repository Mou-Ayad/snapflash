import Avatar from './Avatar';
import { timeAgo } from '../filters';

function status(f) {
  if (f.unreadSnaps.length) {
    const video = f.unreadSnaps.some((s) => s.mediaType === 'video');
    return { icon: 'filled', color: video ? 'purple' : 'red', text: f.unreadSnaps.length > 1 ? `${f.unreadSnaps.length} nouveaux snaps` : 'Nouveau snap', bold: true };
  }
  if (f.unreadMessages) return { icon: 'filled', color: 'blue', text: f.unreadMessages > 1 ? `${f.unreadMessages} nouveaux chats` : 'Nouveau chat', bold: true };
  const candidates = [];
  if (f.lastSent)
    candidates.push({
      at: f.lastSent.createdAt,
      icon: f.lastSent.openedAt ? 'opened' : 'sent',
      color: f.lastSent.mediaType === 'video' ? 'purple' : 'red',
      text: f.lastSent.openedAt ? 'Ouvert' : 'Envoyé',
    });
  if (f.lastReceived?.openedAt)
    candidates.push({
      at: f.lastReceived.openedAt,
      icon: 'received',
      color: f.lastReceived.mediaType === 'video' ? 'purple' : 'red',
      text: 'Vu',
    });
  if (f.lastMessage)
    candidates.push({
      at: f.lastMessage.createdAt,
      icon: f.lastMessage.mine ? (f.lastMessage.readAt ? 'opened' : 'sent') : 'received',
      color: 'blue',
      text: f.lastMessage.mine ? (f.lastMessage.readAt ? 'Lu' : 'Envoyé') : 'Reçu',
    });
  const last = candidates.sort((a, b) => b.at - a.at)[0];
  if (last) return { ...last, text: `${last.text} · ${timeAgo(last.at)}` };
  return { icon: 'none', text: 'Appuyez pour discuter' };
}

const ICONS = { filled: '■', sent: '➤', opened: '▷', received: '□', none: '' };

export default function ChatList({ user, data, pendingRequests, onOpen, onChat, onProfile }) {
  return (
    <div className="screen panel">
      <header className="panel-header">
        <button className="icon-btn avatar-btn" onClick={onProfile} aria-label="Profil et amis">
          <Avatar user={user} size={36} />
          {pendingRequests > 0 && <span className="badge">{pendingRequests}</span>}
        </button>
        <h2>Discussions</h2>
        <button className="icon-btn dark" onClick={onProfile} aria-label="Ajouter des amis">👤+</button>
      </header>
      <div className="list">
        {!data.friends.length && (
          <div className="empty">
            <p>Aucun ami pour l'instant.</p>
            <button className="btn primary" onClick={onProfile}>Ajouter des amis</button>
          </div>
        )}
        {data.friends.map((f) => {
          const s = status(f);
          return (
            <div key={f.id} className="row">
              <button className="row-tap" onClick={() => onOpen(f)}>
                <Avatar user={f} />
                <div className="row-main">
                  <strong>{f.displayName}</strong>
                  <span className={`status ${s.bold ? 'bold' : ''} ${s.color || ''}`}>
                    <i className={`status-icon ${s.icon}`}>{ICONS[s.icon]}</i> {s.text}
                  </span>
                </div>
              </button>
              <button className="icon-btn dark small" onClick={() => onChat(f)} aria-label={`Discuter avec ${f.displayName}`}>💬</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
