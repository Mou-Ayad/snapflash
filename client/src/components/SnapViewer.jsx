import { useEffect, useState } from 'react';
import MediaStage from './MediaStage';
import Avatar from './Avatar';
import { api } from '../api';

export default function SnapViewer({ friend, snapIds, onClose }) {
  const [idx, setIdx] = useState(0);
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(null);
  const next = () => setIdx((i) => i + 1);

  useEffect(() => {
    if (idx >= snapIds.length) return onClose();
    let cancelled = false;
    setSnap(null);
    setError('');
    setRemaining(null);
    api(`/snaps/${snapIds[idx]}/open`, { method: 'POST' })
      .then((s) => !cancelled && setSnap(s))
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setTimeout(() => setIdx((i) => i + 1), 1500);
      });
    return () => {
      cancelled = true;
    };
  }, [idx]);

  useEffect(() => {
    if (!snap || snap.mediaType !== 'image' || !snap.duration) return;
    const end = Date.now() + snap.duration * 1000;
    setRemaining(snap.duration);
    const t = setInterval(() => {
      const r = (end - Date.now()) / 1000;
      if (r <= 0) {
        clearInterval(t);
        next();
      } else setRemaining(r);
    }, 100);
    return () => clearInterval(t);
  }, [snap]);

  const onVideoTime = (e) => {
    const v = e.currentTarget;
    if (v.duration && isFinite(v.duration)) setRemaining(Math.max(0, v.duration - v.currentTime));
  };

  const total = snap?.mediaType === 'image' ? snap.duration : null;

  return (
    <div className="screen viewer overlay-screen" onClick={next}>
      {snap ? (
        <MediaStage media={snap.media} mediaType={snap.mediaType} meta={snap.meta} overlay={snap.overlay} onEnded={next} onTimeUpdate={onVideoTime}>
          <div className="viewer-top">
            <Avatar user={friend} size={32} />
            <strong>{friend.displayName}</strong>
            <span className="viewer-count">{snapIds.length > 1 ? `${idx + 1}/${snapIds.length}` : ''}</span>
            {remaining !== null && (
              <span className="countdown" title="Temps restant">
                <svg viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" className="cd-bg" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    className="cd-fg"
                    style={{ strokeDashoffset: total ? 94.2 * (1 - remaining / total) : 0 }}
                  />
                </svg>
                <b>{Math.ceil(remaining)}</b>
              </span>
            )}
            {snap.mediaType === 'image' && !snap.duration && <span className="countdown inf">∞</span>}
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Fermer">✕</button>
          </div>
        </MediaStage>
      ) : (
        <div className="viewer-loading">{error || 'Ouverture du snap…'}</div>
      )}
    </div>
  );
}
