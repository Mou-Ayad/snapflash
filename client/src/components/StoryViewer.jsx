import { useEffect, useRef, useState } from 'react';
import MediaStage from './MediaStage';
import Avatar from './Avatar';
import { api } from '../api';
import { timeAgo } from '../filters';

const firstUnseen = (group) => Math.max(0, group.stories.findIndex((s) => !s.seen));

export default function StoryViewer({ groups, startIndex, onClose, onDeleted }) {
  const [g, setG] = useState(startIndex);
  const [i, setI] = useState(() => (groups[startIndex].mine ? 0 : firstUnseen(groups[startIndex])));
  const [story, setStory] = useState(null);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [deleted, setDeleted] = useState(() => new Set());
  const pausedRef = useRef(false);
  pausedRef.current = showViewers;
  const group = groups[g];
  const items = group?.stories.filter((s) => !deleted.has(s.id)) || [];

  const next = () => {
    if (i + 1 < items.length) setI(i + 1);
    else if (g + 1 < groups.length) {
      setG(g + 1);
      setI(groups[g + 1].mine ? 0 : firstUnseen(groups[g + 1]));
    } else onClose();
  };
  const prev = () => {
    if (i > 0) setI(i - 1);
    else if (g > 0) {
      setG(g - 1);
      setI(0);
    }
  };

  useEffect(() => {
    if (!items[i]) return onClose();
    let cancelled = false;
    setStory(null);
    setProgress(0);
    setShowViewers(false);
    api(`/stories/${items[i].id}`)
      .then((s) => !cancelled && setStory(s))
      .catch(() => !cancelled && next());
    return () => {
      cancelled = true;
    };
  }, [g, i, deleted]);

  useEffect(() => {
    if (!story || story.mediaType !== 'image') return;
    const total = (story.duration || 5) * 1000;
    let elapsed = 0;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      if (!pausedRef.current) elapsed += now - last;
      last = now;
      setProgress(Math.min(1, elapsed / total));
      if (elapsed >= total) {
        clearInterval(t);
        next();
      }
    }, 50);
    return () => clearInterval(t);
  }, [story]);

  const onTap = (e) => {
    if (showViewers) return setShowViewers(false);
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) prev();
    else next();
  };

  const remove = async (e) => {
    e.stopPropagation();
    if (!confirm('Supprimer ce snap de votre story ?')) return;
    await api(`/stories/${story.id}`, { method: 'DELETE' }).catch(() => {});
    onDeleted();
    const id = story.id;
    if (items.length <= 1) return onClose();
    if (i >= items.length - 1) setI(i - 1);
    setDeleted((prev) => new Set(prev).add(id));
  };

  return (
    <div className="screen viewer overlay-screen" onClick={onTap}>
      {story ? (
        <MediaStage
          media={story.media}
          mediaType={story.mediaType}
          meta={story.meta}
          overlay={story.overlay}
          onEnded={next}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration && isFinite(v.duration)) setProgress(v.currentTime / v.duration);
          }}
        >
          <div className="story-progress">
            {items.map((s, k) => (
              <span key={s.id}>
                <i style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <div className="viewer-top story">
            <Avatar user={group.user} size={32} />
            <strong>{group.mine ? 'Ma Story' : group.user.displayName}</strong>
            <span className="muted small">{timeAgo(story.createdAt)}</span>
            <span className="spacer" />
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Fermer">✕</button>
          </div>
          {group.mine && (
            <div className="story-owner-bar" onClick={(e) => e.stopPropagation()}>
              <button className="chip" onClick={() => setShowViewers(!showViewers)}>👁 {story.viewers.length}</button>
              <button className="chip" onClick={remove}>🗑️ Supprimer</button>
            </div>
          )}
          {showViewers && (
            <div className="viewers-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>Vu par</h3>
              {!story.viewers.length && <p className="muted">Personne pour l'instant</p>}
              {story.viewers.map((v) => (
                <div key={v.id} className="row compact">
                  <Avatar user={v} size={32} />
                  <span>{v.displayName}</span>
                </div>
              ))}
            </div>
          )}
        </MediaStage>
      ) : (
        <div className="viewer-loading">Chargement…</div>
      )}
    </div>
  );
}
