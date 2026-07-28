/** Auth API client for KakaoTalk link / login via API Gateway → EC2 bridge. */

const DEFAULT_API = import.meta.env.VITE_AUTH_API_URL || '';

export type LinkStatus = {
  linked: boolean;
  sessionActive?: boolean;
  kakaoUserId?: number;
  status?: string;
  syncState?: string;
  syncReason?: string;
  heartbeatAt?: number;
  profileSyncState?: string;
  /** Present when Kakao requires device re-registration during resume. */
  passcode?: string;
  remainingSeconds?: number;
  email?: string;
};

export type DeviceChallenge = {
  status: 'device_required';
  passcode?: string;
  remainingSeconds?: number;
};

export type LinkOk = {
  status: 'active';
  kakaoUserId: number;
};

export type LoginOk = {
  status: 'ok';
  customToken: string;
  uid: string;
};

function apiBase(): string {
  const base = DEFAULT_API.replace(/\/$/, '');
  if (!base) {
    throw new Error('VITE_AUTH_API_URL이 설정되지 않았습니다.');
  }
  return base;
}

function timedSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function parse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: 'invalid_response' };
  }
  if (!res.ok && !body.error) body.error = 'request_failed';
  return body;
}

export async function fetchLinkStatus(idToken: string): Promise<LinkStatus> {
  const res = await fetch(`${apiBase()}/v1/kakao/status`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(String(body.error || 'status_failed'));
  return body as unknown as LinkStatus;
}

export async function linkKakao(
  idToken: string,
  email: string,
  password: string,
): Promise<LinkOk | DeviceChallenge> {
  const res = await fetch(`${apiBase()}/v1/kakao/link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    signal: timedSignal(60_000),
  });
  const body = await parse(res);
  if (body.status === 'device_required') return body as unknown as DeviceChallenge;
  if (body.status === 'active') return body as unknown as LinkOk;
  throw new Error(humanError(String(body.error || 'link_failed')));
}

export async function completeLinkDevice(
  idToken: string,
  email: string,
): Promise<LinkOk | DeviceChallenge> {
  const res = await fetch(`${apiBase()}/v1/kakao/link/device`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
    signal: timedSignal(60_000),
  });
  const body = await parse(res);
  if (body.status === 'device_required') return body as unknown as DeviceChallenge;
  if (body.status === 'active') return body as unknown as LinkOk;
  throw new Error(humanError(String(body.error || 'device_failed')));
}

export async function loginKakao(
  email: string,
  password: string,
): Promise<LoginOk | DeviceChallenge> {
  const res = await fetch(`${apiBase()}/v1/kakao/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: timedSignal(60_000),
  });
  const body = await parse(res);
  if (body.status === 'device_required') return body as unknown as DeviceChallenge;
  if (body.status === 'ok' && typeof body.customToken === 'string') {
    return body as unknown as LoginOk;
  }
  throw new Error(humanError(String(body.error || 'login_failed')));
}

export async function completeLoginDevice(
  email: string,
  password: string,
): Promise<LoginOk | DeviceChallenge> {
  const res = await fetch(`${apiBase()}/v1/kakao/login/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: timedSignal(60_000),
  });
  const body = await parse(res);
  if (body.status === 'device_required') return body as unknown as DeviceChallenge;
  if (body.status === 'ok' && typeof body.customToken === 'string') {
    return body as unknown as LoginOk;
  }
  throw new Error(humanError(String(body.error || 'device_failed')));
}

export type FriendRow = {
  userId: number;
  nick: string;
  statusMessage?: string;
  profileUrl?: string;
  backgroundUrl?: string;
  musicTitle?: string;
  musicArtist?: string;
  musicAlbumUrl?: string;
  musicContentUrl?: string;
  isFriend?: boolean;
  blocked?: boolean;
  muted?: boolean;
  hidden?: boolean;
  favorite?: boolean;
  plus?: boolean;
  friendType?: string;
  category?: string;
  directChatId?: number;
  source?: string;
  stale?: boolean;
};

export type FriendStatus = FriendRow & {
  status?: number;
  addible?: boolean;
};

export type PatchOps = Partial<Record<'friend' | 'block' | 'mute' | 'favorite', '+' | '-'>>;

export async function listFriends(idToken: string): Promise<FriendRow[]> {
  const res = await fetch(`${apiBase()}/v1/friends`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'friends_failed')));
  return (body.friends as FriendRow[]) || [];
}

export async function fetchFriendStatus(idToken: string, userId: number): Promise<FriendStatus> {
  const res = await fetch(`${apiBase()}/v1/friends/${userId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'friends_failed')));
  return body as unknown as FriendStatus;
}

/** Kakao friend patch: friend/block/mute/favorite with "+" or "-". */
export async function patchFriend(
  idToken: string,
  userId: number,
  ops: PatchOps,
  plus = false,
): Promise<{ snapshot?: FriendStatus; applied?: Record<string, { ok?: boolean }> }> {
  const res = await fetch(`${apiBase()}/v1/friends/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...ops, plus }),
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'friends_failed')));
  const payload = body as {
    snapshot?: FriendStatus;
    applied?: Record<string, { ok?: boolean; error?: string; status?: number }>;
  };
  const failedField = Object.keys(ops).find(
    (field) => payload.applied?.[field]?.ok !== true,
  );
  if (failedField) {
    const result = payload.applied?.[failedField];
    const detail = result?.error || (result?.status !== undefined ? `상태 ${result.status}` : '결과 없음');
    throw new Error(`친구 설정(${failedField})을 반영하지 못했습니다: ${detail}`);
  }
  return payload;
}

export async function patchChatMute(
  idToken: string,
  chatId: string | number,
  muted: boolean,
): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/chats/${chatId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mute: muted ? '+' : '-' }),
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'chat_patch_failed')));
}

export type KakaoMyProfile = {
  userId: number;
  kakaoUserId?: number;
  nick: string;
  statusMessage?: string;
  profileUrl?: string;
  backgroundUrl?: string;
  musicTitle?: string;
  musicArtist?: string;
  musicAlbumUrl?: string;
  musicContentUrl?: string;
  email?: string;
  status?: number;
};

export async function fetchMyKakaoProfile(idToken: string): Promise<KakaoMyProfile> {
  const res = await fetch(`${apiBase()}/v1/profile/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'profile_failed')));
  return parseKakaoMyProfile(body);
}

/** Refresh Kakao's own profile and persist the linked VanTalk profile on the bridge. */
export async function syncMyKakaoProfile(idToken: string): Promise<KakaoMyProfile> {
  const res = await fetch(`${apiBase()}/v1/profile/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: timedSignal(30_000),
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || 'profile_sync_failed')));
  return parseKakaoMyProfile(body);
}

/** Resume the AWS LOCO session. May return status=device_required with a passcode. */
export async function resumeKakao(idToken: string): Promise<LinkStatus> {
  const res = await fetch(`${apiBase()}/v1/kakao/resume`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: timedSignal(60_000),
  });
  const body = await parse(res);
  if (body.status === 'device_required') {
    return body as unknown as LinkStatus;
  }
  if (!res.ok) throw new Error(humanError(String(body.error || 'resume_failed')));
  return body as unknown as LinkStatus;
}

/** Stop the AWS LOCO session before signing out of Firebase. */
export async function logoutKakao(idToken: string): Promise<LinkStatus> {
  return postLinkStatus('/v1/kakao/logout', idToken, 'logout_failed');
}

async function postLinkStatus(
  path: string,
  idToken: string,
  fallbackError: string,
): Promise<LinkStatus> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = await parse(res);
  if (!res.ok) throw new Error(humanError(String(body.error || fallbackError)));
  return body as unknown as LinkStatus;
}

function parseKakaoMyProfile(body: Record<string, unknown>): KakaoMyProfile {
  return {
    userId: Number(body.userId || body.kakaoUserId || 0),
    kakaoUserId: Number(body.kakaoUserId || body.userId || 0),
    nick: String(body.nick || ''),
    statusMessage: String(body.statusMessage || ''),
    profileUrl: body.profileUrl ? String(body.profileUrl) : '',
    backgroundUrl: body.backgroundUrl ? String(body.backgroundUrl) : undefined,
    musicTitle: body.musicTitle ? String(body.musicTitle) : undefined,
    musicArtist: body.musicArtist ? String(body.musicArtist) : undefined,
    musicAlbumUrl: body.musicAlbumUrl ? String(body.musicAlbumUrl) : undefined,
    musicContentUrl: body.musicContentUrl ? String(body.musicContentUrl) : undefined,
    email: body.email ? String(body.email) : undefined,
    status: typeof body.status === 'number' ? body.status : undefined,
  };
}

export function humanError(code: string): string {
  switch (code) {
    case 'not_linked':
      return '먼저 Google로 로그인한 뒤 카카오톡 계정을 연결하세요.';
    case 'kakao_already_linked':
      return '이 카카오톡 계정은 다른 Van톡 사용자에 이미 연결되어 있습니다.';
    case 'google_required':
      return '카카오톡 연결은 Google 로그인 후에만 가능합니다.';
    case 'invalid_credentials':
      return '이메일 또는 비밀번호 형식이 올바르지 않습니다.';
    case 'login_failed':
      return '카카오톡 로그인에 실패했습니다. 계정 정보를 확인하세요.';
    case 'device_register_failed':
      return '기기 등록에 실패했습니다. 잠시 후 다시 시도하세요.';
    case 'device_required':
      return '휴대폰에서 새 기기 인증이 필요합니다. 인증번호로 기기를 다시 등록하세요.';
    case 'write_failed':
    case 'WRITE failed':
      return '메시지를 전송하지 못했습니다. 잠시 후 다시 시도하세요.';
    case 'invalid_chat_id':
      return '채팅방 식별자가 올바르지 않습니다.';
    case 'auto_resume_failed':
      return '동기화 자동 재개에 실패했습니다. 잠시 후 다시 시도합니다.';
    case 'no_pending_device':
      return '기기 등록 세션이 만료되었습니다. 다시 연결을 시도하세요.';
    case 'stored_credentials_invalid':
      return '저장된 로그인 정보로 동기화를 재개할 수 없습니다. 카카오톡 계정으로 다시 로그인하세요.';
    case 'session_inactive':
      return '카카오톡 세션이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.';
    case 'friends_failed':
      return '친구 작업을 처리하지 못했습니다.';
    case 'chat_patch_failed':
      return '채팅 설정을 변경하지 못했습니다.';
    case 'profile_failed':
      return '카카오톡 프로필을 불러오지 못했습니다.';
    case 'profile_sync_failed':
      return '카카오톡 프로필을 동기화하지 못했습니다. 잠시 후 다시 시도하세요.';
    case 'kakao_profile_unavailable':
      return '카카오톡 프로필을 불러오지 못했습니다. 메시지 동기화는 계속됩니다.';
    case 'empty_kakao_profile':
      return '카카오톡 프로필 응답이 비어 있어 기존 프로필을 유지했습니다.';
    case 'resume_failed':
      return '카카오톡 동기화를 다시 시작하지 못했습니다.';
    case 'logout_failed':
      return '동기화를 안전하게 중단하지 못해 로그아웃하지 않았습니다.';
    case 'handshake_failed':
    case 'loco_proxy_failed':
    case 'session_expired':
      return '암호화된 채팅 채널을 준비하지 못했습니다. 잠시 후 다시 시도하세요.';
    case 'email_mismatch':
      return '이미 연결된 카카오톡 이메일과 다릅니다.';
    case 'link_failed':
      return '계정 연결 중 서버 오류가 발생했습니다.';
    case 'rate_limited':
      return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
    case 'unauthorized':
      return '인증 서버에 연결할 수 없습니다.';
    case 'bad_request':
      return '요청을 처리할 수 없습니다. 입력값을 확인하세요.';
    default:
      if (code.startsWith('device_register_failed_')) {
        return `기기 등록 실패 (코드 ${code.slice('device_register_failed_'.length)})`;
      }
      if (code.startsWith('login_failed_')) {
        return `카카오톡 로그인 실패 (코드 ${code.slice('login_failed_'.length)})`;
      }
      return code || '요청 처리 중 오류가 발생했습니다.';
  }
}
