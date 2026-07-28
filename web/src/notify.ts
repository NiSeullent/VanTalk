/** Lightweight browser notifications for background chat activity. */

let permissionAsked = false;

export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  if (permissionAsked) return false;
  permissionAsked = true;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

export function canNotify(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
    && document.visibilityState === 'hidden';
}

export function showChatNotification(input: {
  title: string;
  body: string;
  tag: string;
  onClick?: () => void;
}): void {
  if (!canNotify()) return;
  try {
    const n = new Notification(input.title, {
      body: input.body.slice(0, 160),
      tag: input.tag,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      input.onClick?.();
      n.close();
    };
  } catch {
    /* Safari private / unsupported options */
  }
}
