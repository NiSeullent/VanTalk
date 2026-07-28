export const DEVICE_CHALLENGE_KEY = 'vantalk.deviceChallenge';

export type StoredDeviceChallenge = {
  email: string;
  passcode: string | null;
  remain: number | null;
  mode: 'link' | 'login' | 'resume';
  savedAt: number;
};

type ChallengeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserSessionStorage(): ChallengeStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function safeChallenge(data: StoredDeviceChallenge): StoredDeviceChallenge {
  // Allowlist fields so a legacy/cast caller cannot accidentally serialize a password.
  return {
    email: data.email,
    passcode: data.passcode,
    remain: data.remain,
    mode: data.mode,
    savedAt: data.savedAt,
  };
}

export function saveDeviceChallenge(
  data: StoredDeviceChallenge,
  storage: ChallengeStorage | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DEVICE_CHALLENGE_KEY, JSON.stringify(safeChallenge(data)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadDeviceChallenge(
  storage: ChallengeStorage | null = browserSessionStorage(),
  now = Date.now(),
): StoredDeviceChallenge | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEVICE_CHALLENGE_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = Number(legacy.savedAt || 0);
    const mode = legacy.mode;
    if (
      typeof legacy.email !== 'string'
      || (mode !== 'link' && mode !== 'login' && mode !== 'resume')
      || !Number.isFinite(savedAt)
      || now - savedAt > 15 * 60 * 1000
    ) {
      storage.removeItem(DEVICE_CHALLENGE_KEY);
      return null;
    }

    const sanitized: StoredDeviceChallenge = {
      email: legacy.email,
      passcode: typeof legacy.passcode === 'string' ? legacy.passcode : null,
      remain:
        typeof legacy.remain === 'number' && Number.isFinite(legacy.remain)
          ? legacy.remain
          : null,
      mode,
      savedAt,
    };

    if (Object.prototype.hasOwnProperty.call(legacy, 'password')) {
      // Immediately rewrite legacy entries without the credential. If rewriting
      // is unavailable, remove the challenge rather than leave a password behind.
      try {
        storage.setItem(DEVICE_CHALLENGE_KEY, JSON.stringify(sanitized));
      } catch {
        storage.removeItem(DEVICE_CHALLENGE_KEY);
        return null;
      }
    }
    return sanitized;
  } catch {
    try {
      storage.removeItem(DEVICE_CHALLENGE_KEY);
    } catch {
      /* ignore inaccessible storage */
    }
    return null;
  }
}

export function clearDeviceChallenge(
  storage: ChallengeStorage | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(DEVICE_CHALLENGE_KEY);
  } catch {
    /* ignore inaccessible storage */
  }
}
