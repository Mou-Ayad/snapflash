import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../api';

export default function Friends({ user, data, onClose, onChanged, onLogout, onSettings, notify }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(term)}`).then((d) => setResults(d.users)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const friendIds = new Set(data.friends.map((f) => f.id));
  const outgoingIds = new Set(data.outgoing.map((f) => f.id));
  const incomingIds = new Set(data.incoming.map((f) => f.id));

  const add = async (u) => {
    try {
      const d = await api('/friends/request', { method: 'POST', body: { username: u.username } });
      notify(d.status === 'accepted' ? `Vous êtes maintenant ami avec ${u.displayName} !` : `Demande envoyée à ${u.displayName}`);
      onChanged();
    } catch (e) {
      notify(e.message);
    }
  };
  const accept = async (u) => {
    await api(`/friends/${u.id}/accept`, { method: 'POST' }).catch(() => {});
    notify(`Vous êtes maintenant ami avec ${u.displayName} !`);
    onChanged();
  };
  const block = async (u) => {
    if (!confirm(`Bloquer ${u.displayName} ? Vous ne serez plus amis et il ne pourra plus vous contacter ni vous trouver.`)) return;
    await api('/blocks', { method: 'POST', body: { userId: u.id } }).catch(() => {});
    notify(`${u.displayName} est bloqué`);
    setResults((prev) => prev.filter((r) => r.id !== u.id));
    onChanged();
  };
  const remove = async (u) => {
    if (!confirm(`Retirer ${u.displayName} de vos amis ?`)) return;
    await api(`/friends/${u.id}`, { method: 'DELETE' }).catch(() => {});
    onChanged();
  };

  return (
    <div className="screen panel overlay-screen">
      <header className="panel-header">
        <button className="icon-btn dark" onClick={onClose} aria-label="Fermer">‹</button>
        <h2>Profil & amis</h2>
        <span className="icon-btn placeholder" />
      </header>
      <div className="list">
        <div className="profile-card">
          <Avatar user={user} size={84} />
          <h2>{user.displayName}</h2>
          <span className="muted">@{user.username}</span>
          <div className="profile-actions">
            <button className="btn ghost" onClick={onSettings}>⚙️ Paramètres</button>
            <button className="btn ghost" onClick={onLogout}>Se déconnecter</button>
          </div>
        </div>

        <h3 className="section-title">Ajouter des amis</h3>
        <input className="search inline" placeholder="Rechercher par nom d'utilisateur" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" />
        {results.map((u) => (
          <div key={u.id} className="row">
            <Avatar user={u} />
            <div className="row-main">
              <strong>{u.displayName}</strong>
              <span className="muted">@{u.username}</span>
            </div>
            {friendIds.has(u.id) ? (
              <span className="muted small">Ami ✓</span>
            ) : outgoingIds.has(u.id) ? (
              <span className="muted small">Demande envoyée</span>
            ) : incomingIds.has(u.id) ? (
              <button className="btn small primary" onClick={() => accept(u)}>Accepter</button>
            ) : (
              <button className="btn small primary" onClick={() => add(u)}>+ Ajouter</button>
            )}
          </div>
        ))}
        {q.trim().length >= 2 && !results.length && <p className="empty">Aucun utilisateur trouvé.</p>}

        {data.incoming.length > 0 && (
          <>
            <h3 className="section-title">Demandes reçues</h3>
            {data.incoming.map((u) => (
              <div key={u.id} className="row">
                <Avatar user={u} />
                <div className="row-main">
                  <strong>{u.displayName}</strong>
                  <span className="muted">@{u.username} veut vous ajouter</span>
                </div>
                <button className="btn small primary" onClick={() => accept(u)}>Accepter</button>
              </div>
            ))}
          </>
        )}
        {data.outgoing.length > 0 && (
          <>
            <h3 className="section-title">Demandes envoyées</h3>
            {data.outgoing.map((u) => (
              <div key={u.id} className="row">
                <Avatar user={u} />
                <div className="row-main">
                  <strong>{u.displayName}</strong>
                  <span className="muted">En attente</span>
                </div>
              </div>
            ))}
          </>
        )}

        <h3 className="section-title">Mes amis ({data.friends.length})</h3>
        {!data.friends.length && <p className="empty">Recherchez un nom d'utilisateur ci-dessus pour ajouter des amis.</p>}
        {data.friends.map((u) => (
          <div key={u.id} className="row">
            <Avatar user={u} />
            <div className="row-main">
              <strong>{u.displayName}</strong>
              <span className="muted">@{u.username}</span>
            </div>
            <div className="row-actions">
              <button className="btn small ghost" onClick={() => remove(u)}>Retirer</button>
              <button className="btn small ghost" onClick={() => block(u)} aria-label={`Bloquer ${u.displayName}`}>🚫</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
