import { useEffect, useRef, useState } from 'react';
import { FILTERS, PEN_COLORS, STICKERS, filterCss } from '../filters';

const STICKER_SIZE = 14;
const TEXT_BAR = 9;
const TEXT_SIZE = 4.6;
const PEN_WIDTH = 0.012;
const clamp = (v) => Math.max(0, Math.min(1, v));
let uid = 0;

function drawStrokes(ctx, strokes, W, H) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * W;
    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(s.points[0][0] * W, s.points[0][1] * H, (s.width * W) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
    ctx.stroke();
  }
}

export default function Editor({ capture, onCancel, onNext }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const currentStroke = useRef(null);
  const swipe = useRef(null);
  const flashTimer = useRef(null);
  const strokesRef = useRef([]);
  const [u, setU] = useState(4);
  const [filterIdx, setFilterIdx] = useState(Math.max(0, FILTERS.findIndex((f) => f.id === capture.filter)));
  const [filterFlash, setFilterFlash] = useState(null);
  const [mode, setMode] = useState(null);
  const [texts, setTexts] = useState([]);
  const [editingText, setEditingText] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [penColor, setPenColor] = useState('#FFFC00');
  const [duration, setDuration] = useState(capture.type === 'video' ? 0 : 5);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const filter = FILTERS[filterIdx];
  strokesRef.current = strokes;

  const redraw = (extra) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, extra ? [...strokesRef.current, extra] : strokesRef.current, c.width, c.height);
  };

  useEffect(() => {
    const stage = stageRef.current;
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      if (!c) return;
      const r = stage.getBoundingClientRect();
      setU(r.width / 100);
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      redraw();
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => redraw(), [strokes]);

  const relPos = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  };

  const changeFilter = (delta) => {
    const i = (filterIdx + delta + FILTERS.length) % FILTERS.length;
    setFilterIdx(i);
    setFilterFlash(FILTERS[i].name);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFilterFlash(null), 900);
  };

  const addText = (y = 0.5) => {
    const t = { id: ++uid, text: '', y: Math.min(0.85, Math.max(0.1, y)) };
    setTexts((prev) => [...prev, t]);
    setEditingText(t.id);
    setMode(null);
  };

  const finishText = () => {
    setTexts((prev) => prev.filter((t) => t.text.trim()));
    setEditingText(null);
  };

  const onStageDown = (e) => {
    if (mode === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId);
      currentStroke.current = { color: penColor, width: PEN_WIDTH, points: [relPos(e)] };
      redraw(currentStroke.current);
      return;
    }
    if (mode) return setMode(null);
    if (editingText) return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onStageMove = (e) => {
    if (mode === 'draw' && currentStroke.current) {
      currentStroke.current.points.push(relPos(e));
      redraw(currentStroke.current);
    }
  };
  const onStageUp = (e) => {
    if (mode === 'draw' && currentStroke.current) {
      const s = currentStroke.current;
      currentStroke.current = null;
      setStrokes((prev) => [...prev, s]);
      return;
    }
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) changeFilter(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) addText(relPos(e)[1]);
  };

  const startDrag = (e, kind, id) => {
    e.stopPropagation();
    if (mode === 'draw' || editingText) return;
    const start = { x: e.clientX, y: e.clientY, moved: false, trash: false };
    const move = (ev) => {
      if (!start.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      start.moved = true;
      setDragging(true);
      const [x, y] = relPos(ev);
      start.trash = y > 0.86 && Math.abs(x - 0.5) < 0.14;
      setOverTrash(start.trash);
      if (kind === 'text') setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, y } : t)));
      else setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      setOverTrash(false);
      if (!start.moved) {
        if (kind === 'text') setEditingText(id);
        else setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, scale: s.scale >= 2 ? 0.6 : s.scale + 0.45 } : s)));
      } else if (start.trash) {
        if (kind === 'text') setTexts((prev) => prev.filter((t) => t.id !== id));
        else setStickers((prev) => prev.filter((s) => s.id !== id));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const composeOverlay = () => {
    const visibleTexts = texts.filter((t) => t.text.trim());
    if (!visibleTexts.length && !stickers.length && !strokes.length) return Promise.resolve(null);
    const W = 1080;
    const H = 1920;
    const U = W / 100;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    drawStrokes(ctx, strokes, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of visibleTexts) {
      const bh = TEXT_BAR * U;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, t.y * H - bh / 2, W, bh);
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${TEXT_SIZE * U}px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(t.text, W / 2, t.y * H, W - 6 * U);
    }
    for (const s of stickers) {
      ctx.font = `${STICKER_SIZE * U * s.scale}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(s.emoji, s.x * W, s.y * H);
    }
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  };

  const next = async () => {
    setEditingText(null);
    const overlay = await composeOverlay();
    onNext({
      media: capture.blob,
      overlay,
      mediaType: capture.type,
      duration,
      meta: { filter: filter.id, mirror: capture.mirror },
    });
  };

  const stop = (e) => e.stopPropagation();
  const mediaStyle = { filter: filterCss(filter.id), transform: capture.mirror ? 'scaleX(-1)' : undefined };

  return (
    <div className="screen editor overlay-screen">
      <div
        className="stage"
        ref={stageRef}
        style={{ '--u': `${u}px` }}
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
      >
        {capture.type === 'video' ? (
          <video src={capture.url} className="stage-media" style={mediaStyle} autoPlay loop playsInline />
        ) : (
          <img src={capture.url} className="stage-media" style={mediaStyle} alt="" draggable={false} />
        )}
        <canvas ref={canvasRef} className="draw-layer" />

        {texts.map((t) =>
          editingText === t.id ? (
            <div key={t.id} className="text-bar editing" style={{ top: `${t.y * 100}%` }} onPointerDown={stop}>
              <input
                autoFocus
                value={t.text}
                maxLength={80}
                placeholder="Votre texte…"
                onChange={(e) => setTexts((prev) => prev.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))}
                onBlur={finishText}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </div>
          ) : (
            <div key={t.id} className="text-bar" style={{ top: `${t.y * 100}%` }} onPointerDown={(e) => startDrag(e, 'text', t.id)}>
              {t.text}
            </div>
          )
        )}
        {stickers.map((s) => (
          <div
            key={s.id}
            className="sticker"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: `calc(var(--u) * ${STICKER_SIZE * s.scale})` }}
            onPointerDown={(e) => startDrag(e, 'sticker', s.id)}
          >
            {s.emoji}
          </div>
        ))}

        {filterFlash && <div className="filter-label big">{filterFlash}</div>}
        {dragging && <div className={`trash ${overTrash ? 'over' : ''}`}>🗑️</div>}

        {!dragging && (
          <>
            <button className="icon-btn editor-close" onPointerDown={stop} onClick={onCancel} aria-label="Annuler">✕</button>
            <div className="editor-tools" onPointerDown={stop}>
              <button className="icon-btn" onClick={() => addText()} aria-label="Texte">T</button>
              <button className={`icon-btn ${mode === 'draw' ? 'on' : ''}`} onClick={() => setMode(mode === 'draw' ? null : 'draw')} aria-label="Dessiner">✏️</button>
              <button className={`icon-btn ${mode === 'stickers' ? 'on' : ''}`} onClick={() => setMode(mode === 'stickers' ? null : 'stickers')} aria-label="Autocollants">😀</button>
              {capture.type === 'image' && (
                <button className={`icon-btn ${mode === 'timer' ? 'on' : ''}`} onClick={() => setMode(mode === 'timer' ? null : 'timer')} aria-label="Minuteur">
                  ⏱<small>{duration ? `${duration}s` : '∞'}</small>
                </button>
              )}
              {mode === 'draw' && strokes.length > 0 && (
                <button className="icon-btn" onClick={() => setStrokes((p) => p.slice(0, -1))} aria-label="Annuler le trait">↩️</button>
              )}
            </div>

            {mode === 'draw' && (
              <div className="pen-colors" onPointerDown={stop}>
                {PEN_COLORS.map((c) => (
                  <button key={c} className={c === penColor ? 'active' : ''} style={{ background: c }} onClick={() => setPenColor(c)} aria-label={`Couleur ${c}`} />
                ))}
              </div>
            )}
            {mode === 'stickers' && (
              <div className="sticker-picker" onPointerDown={stop}>
                {STICKERS.map((em) => (
                  <button
                    key={em}
                    onClick={() => {
                      setStickers((prev) => [...prev, { id: ++uid, emoji: em, x: 0.5, y: 0.45, scale: 1 }]);
                      setMode(null);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
            {mode === 'timer' && (
              <div className="timer-picker" onPointerDown={stop}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0].map((d) => (
                  <button key={d} className={d === duration ? 'active' : ''} onClick={() => { setDuration(d); setMode(null); }}>
                    {d ? `${d}s` : '∞'}
                  </button>
                ))}
              </div>
            )}

            <div className="editor-bottom" onPointerDown={stop}>
              <div className="filter-switch">
                <button onClick={() => changeFilter(-1)} aria-label="Filtre précédent">‹</button>
                <span>{filter.name}</span>
                <button onClick={() => changeFilter(1)} aria-label="Filtre suivant">›</button>
              </div>
              <button className="btn primary send-btn" onClick={next}>Envoyer à ▶</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
