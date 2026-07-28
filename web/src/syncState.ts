import type { LinkStatus } from './authApi';

export type SyncDisplayState = 'checking' | 'synced' | 'offline' | 'logged_out';
export type ProfileSyncDisplayState =
  | 'checking'
  | 'syncing'
  | 'synced'
  | 'unsynced'
  | 'error';

export const HEARTBEAT_STALE_MS = 90_000;

const ACTIVE_SYNC_TOKENS = new Set(['active', 'synced', 'connected', 'online']);
const LOGGED_OUT_SYNC_TOKENS = new Set([
  'logged_out',
  'logged-out',
  'logout',
  'signed_out',
  'signed-out',
]);
const REMOTE_LOGIN_REASONS = new Set(['remote_login', 'other_device', 'session_conflict']);

function timestampMillis(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const candidate = value as {
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof candidate.toMillis === 'function') return candidate.toMillis();
    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
  }
  return undefined;
}

export function normalizedSyncToken(status: LinkStatus | null): string {
  return String(status?.syncState || status?.status || '').trim().toLowerCase();
}

export function hasActiveSyncSession(status: LinkStatus | null): boolean {
  return status?.sessionActive === true || ACTIVE_SYNC_TOKENS.has(normalizedSyncToken(status));
}

export function displaySyncState(
  linked: boolean | null,
  status: LinkStatus | null,
  browserOnline: boolean,
  statusPollError: string | null,
  now: number,
): SyncDisplayState {
  const token = normalizedSyncToken(status);
  if (LOGGED_OUT_SYNC_TOKENS.has(token)) return 'logged_out';

  const reason = String(status?.syncReason || '').trim().toLowerCase();
  // A remote login invalidates this device even if a delayed status payload
  // still contains sessionActive=true or an "active" sync token.
  if (REMOTE_LOGIN_REASONS.has(reason)) return 'offline';

  if (!browserOnline) return 'offline';
  if (linked !== true) return 'checking';

  const heartbeatAt = timestampMillis(status?.heartbeatAt);
  // Prefer an explicitly active session over a stale heartbeat — meta writes can lag
  // without the LOCO socket actually being down (which would falsely block sending).
  if (hasActiveSyncSession(status)) {
    if (heartbeatAt && now - heartbeatAt > HEARTBEAT_STALE_MS * 2) {
      /* soft stale — still treat as synced for composer */
    }
    return 'synced';
  }
  if (heartbeatAt && now - heartbeatAt > HEARTBEAT_STALE_MS) return 'offline';
  if (['starting', 'syncing', 'restoring', 'connecting'].includes(token)) return 'checking';
  if (
    status?.sessionActive === false
    || ['disconnected', 'error', 'stopped', 'offline', 'inactive', 'device_required'].includes(token)
  ) {
    return 'offline';
  }
  if (!status && statusPollError) return 'offline';
  return 'checking';
}

export function syncStateLabel(state: SyncDisplayState): string {
  switch (state) {
    case 'synced':
      return '동기화됨';
    case 'logged_out':
      return '동기화 중단됨(로그아웃됨)';
    case 'offline':
      return '동기화 중단됨(오프라인)';
    default:
      return '동기화 확인 중…';
  }
}

export function syncReasonLabel(reason: string | undefined, browserOnline: boolean): string {
  if (!browserOnline || reason === 'browser_offline') {
    return '인터넷 연결을 확인하면 상태를 다시 확인합니다.';
  }
  switch (String(reason || '').toLowerCase()) {
    case 'remote_login':
    case 'other_device':
    case 'session_conflict':
      return '다른 기기에서 로그인해 이 기기의 동기화가 중단되었습니다.';
    case 'logout':
    case 'user_logout':
    case 'logged_out':
      return '안전하게 로그아웃되어 AWS 동기화 세션이 종료되었습니다.';
    case 'heartbeat_stale':
      return 'AWS 브릿지의 최근 응답이 없어 오프라인으로 전환했습니다.';
    case 'network':
    case 'disconnected':
    case 'socket_closed':
    case 'remote_or_network':
      return 'AWS 브릿지와 카카오톡 연결이 끊어졌습니다.';
    case 'transport_error':
      return '카카오톡 연결에서 일시적인 오류가 있었습니다. 메시지는 계속 수신될 수 있습니다.';
    case 'bridge_session_inactive':
    case 'session_restore':
    case 'server_stop':
    case 'session_replaced':
    case 'start_failed':
      return 'AWS 브릿지 세션이 아직 준비되지 않았습니다. 동기화를 다시 시작해 보세요.';
    case 'device_required':
      return '카카오톡에서 이 기기 등록이 해제되었습니다. 인증번호로 다시 등록해 주세요.';
    case 'auto_resume_failed':
      return '동기화 자동 재개에 실패했습니다. 잠시 후 다시 시도합니다.';
    case 'command_failed':
      return '마지막 요청이 실패했습니다. 연결 상태를 확인한 뒤 다시 시도하세요.';
    default:
      return '최신 메시지는 보존됩니다. 필요하면 동기화를 다시 시작하세요.';
  }
}

export function displayProfileSyncState(value: string | null | undefined): ProfileSyncDisplayState {
  const token = String(value || '').trim().toLowerCase();
  if (['synced', 'active', 'complete', 'completed', 'success'].includes(token)) return 'synced';
  if (['pending', 'starting', 'syncing', 'restoring'].includes(token)) return 'syncing';
  if (['error', 'failed', 'failure'].includes(token)) return 'error';
  if (!token || token === 'idle' || token === 'checking') return 'checking';
  return 'unsynced';
}

export function profileSyncStateLabel(state: ProfileSyncDisplayState): string {
  switch (state) {
    case 'synced':
      return '동기화됨';
    case 'syncing':
      return '동기화 중';
    case 'error':
      return '동기화 실패';
    case 'unsynced':
      return '미동기화';
    default:
      return '확인 중';
  }
}
