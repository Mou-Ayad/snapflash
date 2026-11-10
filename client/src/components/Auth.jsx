import { useState } from 'react';
import { api } from '../api';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const d = await api(mode === 'login' ? '/login' : '/register', {
        method: 'POST',
        body: { username, password, displayName },
      });
      onAuth(d.token, d.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app auth">
      <img src="/icon.svg" alt="" className="auth-logo" />
      <h1>SnapFlash</h1>
      <p className="muted">Partagez l'instant. Il disparaît ensuite.</p>
      <form onSubmit={submit} className="auth-form">
        <input placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" required />
        {mode === 'register' && (
          <input placeholder="Nom affiché (ex : Marie)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        )}
        <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={loading}>
          {loading ? '…' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
        </button>
      </form>
      <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Pas de compte ? Inscrivez-vous' : 'Déjà un compte ? Connectez-vous'}
      </button>
    </div>
  );
}
