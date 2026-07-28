import { describe, expect, it } from 'vitest';
import type { LinkStatus } from './authApi';
import {
  HEARTBEAT_STALE_MS,
  displayProfileSyncState,
  displaySyncState,
  hasActiveSyncSession,
  profileSyncStateLabel,
  syncReasonLabel,
  syncStateLabel,
} from './syncState';

describe('displaySyncState', () => {
  const now = 1_000_000;

  it.each(['remote_login', 'other_device', 'session_conflict'])(
    'forces %s offline even when a stale payload still claims an active session',
    (syncReason) => {
      const status: LinkStatus = {
        linked: true,
        sessionActive: true,
        syncState: 'active',
        syncReason,
        heartbeatAt: now,
      };

      expect(displaySyncState(true, status, true, null, now)).toBe('offline');
    },
  );

  it('keeps an explicit logout distinct from an offline disconnect', () => {
    expect(displaySyncState(
      true,
      { linked: true, sessionActive: false, syncState: 'logged_out' },
      false,
      null,
      now,
    )).toBe('logged_out');
  });

  it('uses browser connectivity, heartbeat freshness, and active status', () => {
    const active: LinkStatus = {
      linked: true,
      sessionActive: true,
      syncState: 'active',
      heartbeatAt: now,
    };
    expect(displaySyncState(true, active, true, null, now)).toBe('synced');
    expect(displaySyncState(true, active, false, null, now)).toBe('offline');
    // Active LOCO session should not be blocked by a lagging heartbeat write.
    expect(displaySyncState(
      true,
      { ...active, heartbeatAt: now - HEARTBEAT_STALE_MS - 1 },
      true,
      null,
      now,
    )).toBe('synced');
    expect(displaySyncState(
      true,
      {
        linked: true,
        sessionActive: false,
        syncState: 'offline',
        heartbeatAt: now - HEARTBEAT_STALE_MS - 1,
      },
      true,
      null,
      now,
    )).toBe('offline');
  });

  it('exposes the exact user-visible labels', () => {
    expect(syncStateLabel('synced')).toBe('동기화됨');
    expect(syncStateLabel('offline')).toBe('동기화 중단됨(오프라인)');
    expect(syncStateLabel('logged_out')).toBe('동기화 중단됨(로그아웃됨)');
  });
});

describe('syncReasonLabel', () => {
  it('explains transport and bridge-inactive reasons instead of the generic fallback', () => {
    expect(syncReasonLabel('transport_error', true)).toContain('일시적인 오류');
    expect(syncReasonLabel('remote_or_network', true)).toContain('연결이 끊어졌');
    expect(syncReasonLabel('bridge_session_inactive', true)).toContain('브릿지 세션');
  });
});

describe('profile synchronization state', () => {
  it.each([
    ['idle', 'checking', '확인 중'],
    ['', 'checking', '확인 중'],
    ['unknown', 'unsynced', '미동기화'],
    ['not_synced', 'unsynced', '미동기화'],
    ['syncing', 'syncing', '동기화 중'],
    ['synced', 'synced', '동기화됨'],
    ['active', 'synced', '동기화됨'],
    ['failed', 'error', '동기화 실패'],
  ] as const)('maps %j to %s without a false synced state', (raw, expected, label) => {
    const state = displayProfileSyncState(raw);
    expect(state).toBe(expected);
    expect(profileSyncStateLabel(state)).toBe(label);
  });

  it('recognizes an active session when either the flag or sync token is current', () => {
    expect(hasActiveSyncSession({ linked: true, sessionActive: true })).toBe(true);
    expect(hasActiveSyncSession({ linked: true, syncState: 'connected' })).toBe(true);
    expect(hasActiveSyncSession({ linked: true, syncState: 'offline' })).toBe(false);
  });
});
