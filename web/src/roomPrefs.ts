/** Per-room client preferences (synced under users/{uid}/roomPrefs/{chatId}). */

export type RoomPrefs = {
  muted: boolean;
  /** Browser Notification when tab is in background. Ignored while muted. */
  notifyDesktop: boolean;
  pinned: boolean;
};

export const DEFAULT_ROOM_PREFS: RoomPrefs = {
  muted: false,
  notifyDesktop: true,
  pinned: false,
};

const storageKey = (uid: string) => `vantalk.roomPrefs.${uid}`;

export function loadLocalRoomPrefs(uid: string): Record<string, RoomPrefs> {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<RoomPrefs>>;
    const out: Record<string, RoomPrefs> = {};
    for (const [id, value] of Object.entries(parsed || {})) {
      out[id] = normalizePrefs(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalRoomPrefs(uid: string, map: Record<string, RoomPrefs>) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

export function normalizePrefs(value?: Partial<RoomPrefs> | null): RoomPrefs {
  return {
    muted: value?.muted === true,
    notifyDesktop: value?.notifyDesktop !== false,
    pinned: value?.pinned === true,
  };
}

export function mergeRoomPrefs(
  previous: RoomPrefs,
  patch: Partial<RoomPrefs>,
): RoomPrefs {
  const next = { ...previous, ...patch };
  if (next.muted) next.notifyDesktop = false;
  return normalizePrefs(next);
}

export function prefsFromFirestore(data: Record<string, unknown> | undefined): RoomPrefs {
  if (!data) return { ...DEFAULT_ROOM_PREFS };
  return normalizePrefs({
    muted: data.muted === true,
    notifyDesktop: data.notifyDesktop !== false && data.muted !== true,
    pinned: data.pinned === true,
  });
}
