import { memo, useEffect, useRef, type MouseEvent } from 'react';

const cache = new Map<string, string>();

function hashColor(name: string): string {
  const colors = ['#fee500', '#3ba55d', '#5865f2', '#eb459e', '#ed4245', '#faa61a'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function paintAvatar(name: string, size: number): string {
  const key = `${name}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = hashColor(name);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `700 ${Math.floor(size * 0.38)}px "Pretendard", "Apple SD Gothic Neo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(name), size / 2, size / 2 + 1);
  const url = canvas.toDataURL('image/png');
  if (cache.size > 256) cache.clear();
  cache.set(key, url);
  return url;
}

type AvatarBadgeProps = {
  name: string;
  photoUrl?: string;
  size?: number;
  className?: string;
  title?: string;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
};

/** Canvas-baked initials avatar — avoids per-row DOM gradient/layout cost. */
export const AvatarBadge = memo(function AvatarBadge({
  name,
  photoUrl,
  size = 40,
  className,
  title,
  onClick,
  onContextMenu,
}: AvatarBadgeProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (photoUrl || !imgRef.current) return;
    imgRef.current.src = paintAvatar(name || '?', size * 2);
  }, [name, photoUrl, size]);

  if (photoUrl) {
    return (
      <button
        type="button"
        className={className || 'avatar-button'}
        title={title}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <img
          className="avatar"
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className || 'avatar-button'}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <img
        ref={imgRef}
        className="avatar canvas-avatar"
        alt=""
        width={size}
        height={size}
        decoding="async"
        style={{ width: size, height: size, borderRadius: '50%' }}
      />
    </button>
  );
});
