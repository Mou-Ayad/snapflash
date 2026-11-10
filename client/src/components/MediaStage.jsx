import { useEffect, useRef } from 'react';
import { filterCss } from '../filters';

export default function MediaStage({ media, mediaType, meta, overlay, onEnded, onTimeUpdate, loop, children }) {
  const videoRef = useRef(null);
  const style = { filter: filterCss(meta?.filter), transform: meta?.mirror ? 'scaleX(-1)' : undefined };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [media]);

  return (
    <div className="stage">
      {mediaType === 'video' ? (
        <video
          ref={videoRef}
          key={media}
          src={media}
          className="stage-media"
          style={style}
          playsInline
          autoPlay
          loop={loop}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
        />
      ) : (
        <img src={media} className="stage-media" style={style} alt="" />
      )}
      {overlay && <img src={overlay} className="stage-overlay" alt="" />}
      {children}
    </div>
  );
}
