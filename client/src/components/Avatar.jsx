export default function Avatar({ user, size = 44, ring }) {
  return (
    <div
      className={`avatar ${ring ? `ring-${ring}` : ''}`}
      style={{ width: size, height: size, background: user?.color || '#FFFC00', fontSize: size * 0.42 }}
    >
      {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
    </div>
  );
}
