export const FILTERS = [
  { id: 'normal', name: 'Normal', css: 'none' },
  { id: 'noir', name: 'Noir & Blanc', css: 'grayscale(1) contrast(1.15)' },
  { id: 'sepia', name: 'Sépia', css: 'sepia(0.85) contrast(1.05)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.4) contrast(1.1) brightness(1.05) saturate(1.3) hue-rotate(-10deg)' },
  { id: 'chaud', name: 'Chaud', css: 'saturate(1.4) sepia(0.2) hue-rotate(-12deg) brightness(1.05)' },
  { id: 'froid', name: 'Froid', css: 'saturate(1.1) hue-rotate(25deg) brightness(1.05) contrast(1.05)' },
  { id: 'neon', name: 'Néon', css: 'saturate(2.6) contrast(1.3) hue-rotate(290deg)' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.6) brightness(0.9) saturate(0.75)' },
  { id: 'reve', name: 'Rêve', css: 'blur(1px) brightness(1.15) saturate(1.4) contrast(0.9)' },
  { id: 'inverse', name: 'Négatif', css: 'invert(1) hue-rotate(180deg)' },
];

export const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css || 'none';

export const STICKERS = ['😂', '😍', '🔥', '😎', '🥳', '😱', '💯', '❤️', '👻', '🌈', '⭐', '🍕', '🎉', '👀', '🙈', '💀', '🤩', '😜', '🐶', '🌸'];

export const PEN_COLORS = ['#FFFFFF', '#000000', '#FFFC00', '#FF3B30', '#34C759', '#0A84FF', '#AF52DE', '#FF9500'];

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}
