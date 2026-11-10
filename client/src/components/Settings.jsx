import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../api';

const COLORS = ['#FFFC00', '#FF4D6D', '#4DA3FF', '#7CFF6B', '#C77DFF', '#FF9F1C', '#2EC4B6'];
const PRIVACY_OPTIONS = [
  { id: 'friends', label: 'Mes amis' },
  { id: 'everyone', label: 'Tout le monde' },
];

function Segmented({ value, onChange, label }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {PRIVACY_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={value === o.id ? 'active' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings({ user, onClose, onUserChange, onDeleted, onBlocksChanged, notify }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [color, setColor] = useState(user.color);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [blocked, setBlocked] = useState([]);
  const [deletePw, setDeletePw] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api('/blocks').then((d) => setBlocked(d.users)).catch(() => {});
  }, []);

  const update = async (changes) => {
    const d = await api('/me', { method: 'PATCH', body: changes });
    onUserChange(d.user);
    return d.user;
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await update({ displayName, color });
      notify('Profil mis à jour');
    } catch (err) {
      notify(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const setPrivacy = async (key, value) => {
    try {
      await update({ [key]: value });
      notify('Confidentialité mise à jour');
    } catch (err) {
      notify(err.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pw.next !== pw.confirm) return setPwError('Les deux nouveaux mots de passe ne correspondent pas');
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      notify('Mot de passe modifié');
    } catch (err) {
      setPwError(err.message);
    }
  };

  const unblock = async (u) => {
    await api(`/blocks/${u.id}`, { method: 'DELETE' }).catch(() => {});
    setBlocked((prev) => prev.filter((b) => b.id !== u.id));
    onBlocksChanged();
    notify(`${u.displayName} est débloqué`);
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');
    try {
      await api('/me', { method: 'DELETE', body: { password: deletePw } });
      onDeleted();
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  const preview = { ...user, displayName: displayName || user.username, color };
  const profileChanged = displayName.trim() !== user.displayName || color !== user.color;

  return (
    <div className="screen panel overlay-screen settings">
      <header className="panel-header">
        <button className="icon-btn dark" onClick={onClose} aria-label="Retour">‹</button>
        <h2>Paramètres</h2>
        <span className="icon-btn placeholder" />
      </header>
      <div className="list">
        <h3 className="section-title">Mon profil</h3>
        <form className="settings-card" onSubmit={saveProfile}>
          <div className="settings-avatar">
            <Avatar user={preview} size={72} />
            <span className="muted">@{user.username}</span>
          </div>
          <label className="field">
            <span>Nom affiché</span>
            <input value={displayName} maxLength={30} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <div className="field">
            <span>Couleur de l'avatar</span>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot ${c === color ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
          <button className="btn primary" disabled={!profileChanged || !displayName.trim() || savingProfile}>
            {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <h3 className="section-title">Confidentialité</h3>
        <div className="settings-card">
          <Segmented
            label="Qui peut m'envoyer des snaps et des chats"
            value={user.contactPrivacy}
            onChange={(v) => setPrivacy('contactPrivacy', v)}
          />
          <Segmented label="Qui peut voir ma story" value={user.storyPrivacy} onChange={(v) => setPrivacy('storyPrivacy', v)} />
          <p className="muted small">
            « Tout le monde » : n'importe quel utilisateur de SnapFlash peut vous écrire, ou voir votre story dans « Découvrir ».
          </p>
        </div>

        <h3 className="section-title">Mot de passe</h3>
        <form className="settings-card" onSubmit={changePassword}>
          <input type="password" placeholder="Mot de passe actuel" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input type="password" placeholder="Nouveau mot de passe (6 caractères min.)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <input type="password" placeholder="Confirmer le nouveau mot de passe" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          {pwError && <div className="error">{pwError}</div>}
          <button className="btn primary" disabled={!pw.current || !pw.next || !pw.confirm}>Changer le mot de passe</button>
        </form>

        <h3 className="section-title">Utilisateurs bloqués ({blocked.length})</h3>
        {!blocked.length && <p className="empty">Personne n'est bloqué. Vous pouvez bloquer quelqu'un depuis votre liste d'amis ou une conversation.</p>}
        {blocked.map((u) => (
          <div key={u.id} className="row">
            <Avatar user={u} />
            <div className="row-main">
              <strong>{u.displayName}</strong>
              <span className="muted">@{u.username}</span>
            </div>
            <button className="btn small ghost" onClick={() => unblock(u)}>Débloquer</button>
          </div>
        ))}

        <h3 className="section-title">Compte</h3>
        <div className="settings-card">
          {!deleteOpen ? (
            <button className="btn danger" onClick={() => setDeleteOpen(true)}>Supprimer mon compte</button>
          ) : (
            <form onSubmit={deleteAccount} className="delete-form">
              <p className="small">
                Votre compte, vos amis, vos snaps, vos stories et vos messages seront supprimés définitivement. Entrez votre mot de passe pour confirmer.
              </p>
              <input type="password" placeholder="Mot de passe" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
              {deleteError && <div className="error">{deleteError}</div>}
              <div className="delete-actions">
                <button type="button" className="btn ghost" onClick={() => { setDeleteOpen(false); setDeletePw(''); }}>Annuler</button>
                <button className="btn danger" disabled={!deletePw}>Supprimer définitivement</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
