import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { FILTERS, filterCss } from '../filters';

const MAX_VIDEO_MS = 10_000;
const HOLD_DELAY = 280;
const VIDEO_TYPES = ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export default function Camera({ user, pendingRequests, onProfile, onCapture, active }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const holdTimer = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterIdx, setFilterIdx] = useState(0);
  const [flash, setFlash] = useState(false);
  const filter = FILTERS[filterIdx];
  const mirror = facing === 'user';

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setReady(false);
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("La caméra n'est pas disponible sur ce navigateur (HTTPS requis). Importez une photo ou une vidéo.");
        return;
      }
      const video = { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video });
        } catch {
          if (!cancelled) setError("Impossible d'accéder à la caméra. Autorisez-la ou importez un média depuis la galerie.");
          return;
        }
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setError('');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    }
    start();
    return () => {
      cancelled = true;
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, active]);

  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (mirror) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    c.toBlob(
      (blob) => onCapture({ blob, url: URL.createObjectURL(blob), type: 'image', mirror: false, filter: filter.id }),
      'image/jpeg',
      0.9
    );
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    const mimeType = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const startedAt = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(rec.tick);
      setRecording(false);
      setProgress(0);
      const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      if (blob.size) onCapture({ blob, url: URL.createObjectURL(blob), type: 'video', mirror, filter: filter.id });
    };
    rec.tick = setInterval(() => {
      const p = (Date.now() - startedAt) / MAX_VIDEO_MS;
      setProgress(Math.min(1, p));
      if (p >= 1) rec.state === 'recording' && rec.stop();
    }, 50);
    rec.start(250);
    recorderRef.current = rec;
    setRecording(true);
  };

  const onShutterDown = (e) => {
    e.preventDefault();
    if (!ready) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      startRecording();
    }, HOLD_DELAY);
  };

  const onShutterUp = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      takePhoto();
    } else if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (!type) return;
    onCapture({ blob: file, url: URL.createObjectURL(file), type, mirror: false, filter: filter.id });
  };

  return (
    <div className="screen camera">
      <div className="stage">
        <video
          ref={videoRef}
          className="stage-media"
          style={{ filter: filterCss(filter.id), transform: mirror ? 'scaleX(-1)' : undefined }}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setReady(true)}
        />
        {error && (
          <div className="camera-error">
            <p>{error}</p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Importer depuis la galerie</button>
          </div>
        )}
        {flash && <div className="flash" />}

        <div className="camera-top">
          <button className="icon-btn avatar-btn" onClick={onProfile} aria-label="Profil et amis">
            <Avatar user={user} size={38} />
            {pendingRequests > 0 && <span className="badge">{pendingRequests}</span>}
          </button>
          <div className="camera-top-right">
            <button className="icon-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Changer de caméra">🔄</button>
          </div>
        </div>

        {filter.id !== 'normal' && <div className="filter-label">{filter.name}</div>}

        <div className="camera-bottom">
          <div className="filter-strip">
            {FILTERS.map((f, i) => (
              <button
                key={f.id}
                className={`filter-dot ${i === filterIdx ? 'active' : ''}`}
                onClick={() => setFilterIdx(i)}
                title={f.name}
                aria-label={`Filtre ${f.name}`}
              >
                <span style={{ filter: f.css }} />
              </button>
            ))}
          </div>
          <div className="shutter-row">
            <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Galerie">🖼️</button>
            <button
              className={`shutter ${recording ? 'recording' : ''}`}
              onPointerDown={onShutterDown}
              onPointerUp={onShutterUp}
              onPointerLeave={() => recording && onShutterUp()}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Prendre une photo (maintenir pour filmer)"
              disabled={!!error}
            >
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" className="shutter-ring" />
                {recording && <circle cx="50" cy="50" r="44" className="shutter-progress" style={{ strokeDashoffset: 276.5 * (1 - progress) }} />}
              </svg>
            </button>
            <span className="icon-btn placeholder" />
          </div>
          <p className="hint">{recording ? 'Enregistrement…' : 'Appuyez pour une photo, maintenez pour une vidéo'}</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onFile} />
    </div>
  );
}
