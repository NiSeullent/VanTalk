import { describe, expect, it } from 'vitest';
import {
  DEVICE_CHALLENGE_KEY,
  loadDeviceChallenge,
  saveDeviceChallenge,
  type StoredDeviceChallenge,
} from './deviceChallenge';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('device challenge persistence', () => {
  const challenge: StoredDeviceChallenge = {
    email: 'user@example.com',
    passcode: '1234',
    remain: 120,
    mode: 'login',
    savedAt: 10_000,
  };

  it('serializes only allowlisted non-credential fields', () => {
    const storage = new MemoryStorage();
    saveDeviceChallenge(
      { ...challenge, password: 'must-not-persist' } as StoredDeviceChallenge,
      storage,
    );

    const raw = storage.getItem(DEVICE_CHALLENGE_KEY);
    expect(raw).not.toContain('must-not-persist');
    expect(JSON.parse(raw || '{}')).not.toHaveProperty('password');
  });

  it('ignores and immediately scrubs a legacy plaintext password', () => {
    const storage = new MemoryStorage();
    storage.setItem(DEVICE_CHALLENGE_KEY, JSON.stringify({
      ...challenge,
      password: 'legacy-secret',
    }));

    const loaded = loadDeviceChallenge(storage, challenge.savedAt + 1);

    expect(loaded).toEqual(challenge);
    const sanitized = JSON.parse(storage.getItem(DEVICE_CHALLENGE_KEY) || '{}');
    expect(sanitized).not.toHaveProperty('password');
    expect(JSON.stringify(sanitized)).not.toContain('legacy-secret');
  });

  it('removes malformed entries instead of leaving possible credentials behind', () => {
    const storage = new MemoryStorage();
    storage.setItem(DEVICE_CHALLENGE_KEY, '{"password":"secret",');

    expect(loadDeviceChallenge(storage, challenge.savedAt)).toBeNull();
    expect(storage.getItem(DEVICE_CHALLENGE_KEY)).toBeNull();
  });
});
