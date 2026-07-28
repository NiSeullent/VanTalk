import {
  FormEvent,
  MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  VANTALK_DOCS_URL,
  VANTALK_GITHUB_URL,
  VANTALK_VERSION_LABEL,
} from './version';
import { LegalDocument } from './legal/LegalDocument';
import {
  collectMessagesForBackup,
  createSendGate,
  filterMessagesSince,
  loadChatVisibility,
  saveSnapshotSince,
  uploadEncryptedChatBackup,
  uploadAvatar,
  type ChatBackupMeta,
} from './chatBackup';
import {
  insertCommunityMessage,
  setTyping as setSupabaseTyping,
  subscribeCalls as subscribeSupabaseCalls,
  subscribeFeed as subscribeSupabaseFeed,
  subscribeMessages as subscribeSupabaseMessages,
  subscribeNotifications as subscribeSupabaseNotifications,
  subscribeProfile as subscribeSupabaseProfile,
  subscribeReactions as subscribeSupabaseReactions,
  subscribeRoomPrefs as subscribeSupabaseRoomPrefs,
  subscribeRooms as subscribeSupabaseRooms,
  subscribeSyncStatus,
  subscribeTyping as subscribeSupabaseTyping,
  supabaseConfigured,
  syncStatusToLegacy,
  upsertReaction,
  upsertRoomPrefs,
  upsertVanProfile,
  type CallRow,
  type FeedRow,
  type MessageRow,
  type NotificationRow,
  type ProfileRow,
  type RoomPrefRow,
  type RoomRow,
} from './supabaseData';
import { requireSupabase } from './supabase';
import { AmbientBackdrop } from './perf/AmbientBackdrop';
import { AvatarBadge } from './perf/AvatarBadge';
import { VirtualList } from './perf/VirtualList';
import { ensureNotifyPermission, showChatNotification } from './notify';
import {
  loadLocalRoomPrefs,
  mergeRoomPrefs,
  normalizePrefs,
  prefsFromFirestore,
  saveLocalRoomPrefs,
  type RoomPrefs,
} from './roomPrefs';
import { clampMenuPosition, createLongPressMenu } from './touchMenu';
import {
  clearDeviceChallenge,
  loadDeviceChallenge,
  saveDeviceChallenge,
} from './deviceChallenge';
import {
  completeLinkDevice,
  completeLoginDevice,
  fetchFriendStatus,
  fetchLinkStatus,
  humanError,
  linkKakao,
  listFriends,
  loginKakao,
  patchChatMute,
  patchFriend,
  fetchMyKakaoProfile,
  logoutKakao,
  resumeKakao,
  syncMyKakaoProfile,
  type FriendRow,
  type KakaoMyProfile,
  type LinkStatus,
  type PatchOps,
} from './authApi';
import { locoWrite, resetLocoProxy } from './locoProxy';
import {
  HEARTBEAT_STALE_MS,
  displayProfileSyncState,
  displaySyncState,
  hasActiveSyncSession,
  normalizedSyncToken,
  profileSyncStateLabel,
  syncReasonLabel,
  syncStateLabel,
} from './syncState';
import {
  type UrlIntent,
  type UrlIntentKind,
  intentTitle,
  normalizeExternalUrl,
  splitTextWithUrls,
  urlHostname,
} from './urlIntent';

type Room = {
  id: string;
  name: string;
  type?: string;
  profileUrl?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
  channel?: 'talk' | 'van_channel' | 'community' | 'community_plus';
  muted?: boolean;
  notifyDesktop?: boolean;
  pinned?: boolean;
};

type Yt = {
  videoId: string;
  embedUrl?: string;
  watchUrl?: string;
};

type Feed = {
  type: number;
  title: string;
  description: string;
};

type CallInfo = {
  callId?: string;
  callKind?: string;
  callAction?: string;
  callPreview?: string;
  csIP?: string;
  csPort?: number;
  durationSec?: number;
  status?: string;
  sendAtMs?: number;
  updatedAt?: number;
};

type Msg = {
  id: string;
  authorId: number;
  nick: string;
  text: string;
  sendAtMs: number;
  youtube?: Yt;
  authorProfileUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbUrl?: string;
  fileName?: string;
  feed?: Feed;
  call?: CallInfo;
};

type PersonalProfile = {
  userId: number;
  directChatId?: number;
  nick: string;
  profileUrl?: string;
  statusMessage?: string;
  backgroundUrl?: string;
  musicTitle?: string;
  musicArtist?: string;
  musicAlbumUrl?: string;
  musicContentUrl?: string;
  isFriend?: boolean;
  blocked?: boolean;
  muted?: boolean;
  favorite?: boolean;
  addible?: boolean;
};

type SocialFlags = {
  isFriend?: boolean;
  blocked?: boolean;
  muted?: boolean;
  favorite?: boolean;
  addible?: boolean;
};

/** Show only actions that match current Kakao social state. */
function socialActionDefs(st: SocialFlags): Array<{
  key: string;
  label: string;
  ops: PatchOps;
  danger?: boolean;
}> {
  const out: Array<{ key: string; label: string; ops: PatchOps; danger?: boolean }> = [];
  if (st.blocked) {
    out.push({ key: 'unblock', label: '차단 해제', ops: { block: '-' } });
    return out;
  }
  out.push({ key: 'block', label: '차단', ops: { block: '+' }, danger: true });
  if (st.isFriend) {
    out.push({ key: 'unfriend', label: '친구 삭제', ops: { friend: '-' }, danger: true });
  } else if (st.addible !== false) {
    out.push({ key: 'friend', label: '친구 추가', ops: { friend: '+' } });
  }
  if (st.muted) {
    out.push({ key: 'unmute', label: '숨김 해제', ops: { mute: '-' } });
  } else {
    out.push({ key: 'mute', label: '숨김/뮤트', ops: { mute: '+' } });
  }
  if (st.isFriend) {
    if (st.favorite) {
      out.push({ key: 'unfav', label: '즐겨찾기 해제', ops: { favorite: '-' } });
    } else {
      out.push({ key: 'fav', label: '즐겨찾기', ops: { favorite: '+' } });
    }
  }
  return out;
}

function socialStatusLabel(st: SocialFlags): string {
  const parts: string[] = [];
  if (st.blocked) parts.push('차단');
  else if (st.isFriend) parts.push('친구');
  else parts.push('비친구');
  if (!st.blocked && st.muted) parts.push('숨김');
  if (!st.blocked && st.favorite) parts.push('즐겨찾기');
  return parts.join(' · ');
}

type MyProfile = {
  displayName: string;
  photoURL: string;
  statusMessage: string;
  bio: string;
  linkKakaoProfile: boolean;
};

type Sideview =
  | { kind: 'profile'; profile: PersonalProfile }
  | { kind: 'me'; profile: MyProfile }
  | { kind: 'friends'; friends: FriendRow[] }
  | { kind: 'room'; room: Room };

type TypingUser = {
  uid: string;
  nick: string;
  profileUrl?: string;
  updatedAt: number;
};

type ReactionMap = Record<string, string[]>;

type AuthView = 'choose' | 'kakao-login' | 'link-kakao' | 'device';
type SyncAction = 'resume' | 'logout' | null;
type WorkspaceView = 'chats' | 'friends' | 'feed' | 'notifications';

type SocialFeedItem = {
  id: string;
  authorUid?: string;
  authorName: string;
  authorProfileUrl?: string;
  content: string;
  mediaUrl?: string;
  createdAt: number;
  visibility?: string;
  reactionCount: number;
};

type NotificationEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  roomId?: string;
  actorName?: string;
  actorProfileUrl?: string;
};

type AppIconName =
  | 'chats'
  | 'friends'
  | 'feed'
  | 'notifications'
  | 'profile'
  | 'logout'
  | 'search'
  | 'compose'
  | 'refresh'
  | 'sparkle';

function millis(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
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

function linkStatusFromSync(data: Record<string, unknown>): {
  patch: Partial<LinkStatus>;
  inferLinked: boolean;
  explicitLinked?: boolean;
} {
  const patch: Partial<LinkStatus> = {};
  const status = typeof data.status === 'string' ? data.status : undefined;
  const syncState = typeof data.syncState === 'string' ? data.syncState : undefined;
  const token = String(syncState || status || '').toLowerCase();
  if (status) patch.status = status;
  if (syncState || status) patch.syncState = syncState || status;
  if (typeof data.syncReason === 'string') patch.syncReason = data.syncReason;
  if (typeof data.profileSyncState === 'string') {
    patch.profileSyncState = data.profileSyncState;
  }
  const heartbeatAt = millis(data.heartbeatAt);
  if (heartbeatAt) patch.heartbeatAt = heartbeatAt;
  if (typeof data.sessionActive === 'boolean') {
    patch.sessionActive = data.sessionActive;
  } else if (['active', 'synced', 'connected', 'online'].includes(token)) {
    patch.sessionActive = true;
  } else if (
    ['disconnected', 'error', 'stopped', 'offline', 'inactive', 'logged_out'].includes(token)
  ) {
    patch.sessionActive = false;
  }
  const kakaoUserId = Number(data.kakaoUserId || 0);
  if (kakaoUserId > 0) patch.kakaoUserId = kakaoUserId;
  return {
    patch,
    inferLinked: kakaoUserId > 0 || (!!token && token !== 'unlinked'),
    explicitLinked: typeof data.linked === 'boolean' ? data.linked : undefined,
  };
}

const REACT_DEFS: { id: string; emoji: string; label: string }[] = [
  { id: 'thumbsup', emoji: '👍', label: '좋아요' },
  { id: 'heart', emoji: '❤️', label: '하트' },
  { id: 'laugh', emoji: '😂', label: '웃음' },
  { id: 'wow', emoji: '😮', label: '놀람' },
  { id: 'sad', emoji: '😢', label: '슬픔' },
  { id: 'fire', emoji: '🔥', label: '불꽃' },
  { id: 'clap', emoji: '👏', label: '박수' },
  { id: 'party', emoji: '🎉', label: '축하' },
];

function reactionLabel(key: string): string {
  const hit = REACT_DEFS.find((d) => d.emoji === key || d.id === key);
  return hit?.label || key;
}

function reactionDisplay(key: string): string {
  const hit = REACT_DEFS.find((d) => d.emoji === key || d.id === key);
  // Prefer Korean label so Linux without emoji fonts still reads correctly
  return hit ? hit.label : key;
}

const EMOJI_PICKER = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤗', '🤔', '😎', '🥳',
  '😢', '😭', '😡', '🤯', '😴', '😷', '🫡', '🫶', '👍', '👎', '👏', '🙌',
  '🙏', '💪', '🔥', '✨', '💯', '🎉', '❤️', '🧡', '💛', '💚', '💙', '💜',
  '🖤', '🤍', '💔', '⭐', '🌟', '⚡', '🌈', '☀️', '🌙', '🌸', '🍀', '🍕',
  '☕', '🍺', '🎮', '🎵', '📷', '💬', '📌', '✅', '❌', '⚠️', '🆘', '🇰🇷',
];

const ROOM_SECTIONS = [
  { channel: 'talk', label: '채팅' },
  { channel: 'van_channel', label: 'Van채널' },
  { channel: 'community', label: 'VanCommunity' },
  { channel: 'community_plus', label: 'VanCommunity+' },
] as const;

function avatarColor(name: string) {
  const colors = ['#fee500', '#3ba55d', '#5865f2', '#eb459e', '#ed4245', '#faa61a'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string) {
  const t = (name || '?').trim();
  return t.slice(0, 1).toUpperCase();
}

function formatTime(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '방금';
  const elapsed = Math.max(0, Date.now() - ms);
  if (elapsed < 60_000) return '방금';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function AppIcon({ name }: { name: AppIconName }) {
  const paths: Record<AppIconName, ReactNode> = {
    chats: <path d="M5 5.75h14v9.5H11l-4.5 3v-3H5z" />,
    friends: (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="16.5" cy="8.5" r="2.4" />
        <path d="M3.75 19c.45-3.05 2.2-4.55 5.25-4.55S13.8 15.95 14.25 19M14 14.3c3.7-.55 5.65.95 6 3.7" />
      </>
    ),
    feed: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8 9h8M8 12.5h8M8 16h5" />
      </>
    ),
    notifications: (
      <>
        <path d="M6.5 17h11l-1.2-1.8V11a4.3 4.3 0 0 0-8.6 0v4.2z" />
        <path d="M10 19a2.3 2.3 0 0 0 4 0" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 19c.45-3.65 2.6-5.45 6.5-5.45s6.05 1.8 6.5 5.45" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4 4" />
      </>
    ),
    compose: (
      <>
        <path d="M5 19h4l10-10-4-4L5 15zM13.5 6.5l4 4" />
      </>
    ),
    refresh: (
      <>
        <path d="M18.5 8A7 7 0 1 0 19 14" />
        <path d="M18.5 4v4h-4" />
      </>
    ),
    sparkle: (
      <>
        <path d="M12 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z" />
        <path d="M18.5 15.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5z" />
      </>
    ),
  };
  return (
    <svg className="app-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function parseKakaoFeed(raw: string): Feed | undefined {
  if (!raw || raw[0] !== '{') return undefined;
  try {
    const value = JSON.parse(raw) as {
      feedType?: number;
      byLink?: boolean;
      hidden?: boolean;
      logId?: number | string;
      inviter?: { nickName?: string };
      members?: Array<{ nickName?: string }>;
    };
    if (
      value.feedType === 25
      || (value.hidden === true && value.logId != null && value.feedType != null)
    ) {
      return { type: 25, title: '삭제된 메시지', description: '삭제된 메시지' };
    }
    if (value.feedType !== 1) return undefined;
    const members = (value.members || []).map((member) => member.nickName?.trim()).filter(Boolean) as string[];
    if (!members.length) return undefined;
    const joined = members.join(', ');
    const inviter = value.inviter?.nickName?.trim();
    const description = value.byLink
      ? `${joined}님이 초대 링크로 참여했어요`
      : inviter
        ? `${inviter}님이 ${joined}님을 초대했어요`
        : `${joined}님이 참여했어요`;
    return { type: 1, title: '새 멤버', description };
  } catch {
    return undefined;
  }
}

function isDeletedFeedMessage(raw: string | undefined, mediaType?: string): boolean {
  if (mediaType === 'deleted') return true;
  if (!raw || raw[0] !== '{') return false;
  const feed = parseKakaoFeed(raw);
  return feed?.type === 25;
}

function isGoogleUser(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'google.com');
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function bridgeJson(
  idToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const base = String(import.meta.env.VITE_AUTH_API_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('bridge_api_unconfigured');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    body = { error: 'invalid_response' };
  }
  if (!response.ok) {
    const requestError = new Error(
      String(body.error || `request_failed_${response.status}`),
    ) as Error & { httpStatus?: number };
    requestError.httpStatus = response.status;
    throw requestError;
  }
  return body;
}

function bridgeUnavailable(error: unknown): boolean {
  const candidate = error as (Error & { httpStatus?: number }) | undefined;
  const message = candidate?.message?.toLowerCase() || '';
  return (
    candidate?.httpStatus === 404
    || candidate?.httpStatus === 501
    || message === 'bridge_api_unconfigured'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null);
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [statusPollError, setStatusPollError] = useState<string | null>(null);
  const [syncClock, setSyncClock] = useState(() => Date.now());
  const [syncAction, setSyncAction] = useState<SyncAction>(null);
  const [profileSyncState, setProfileSyncState] = useState<string>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<AuthView>('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [deviceRemain, setDeviceRemain] = useState<number | null>(null);
  const [deviceMode, setDeviceMode] = useState<'link' | 'login' | 'resume'>('link');
  const [deviceReauth, setDeviceReauth] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomPrefs, setRoomPrefs] = useState<Record<string, RoomPrefs>>({});
  const [roomSettingsBusy, setRoomSettingsBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('chats');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionMap>>({});
  const [visibleMessageIds, setVisibleMessageIds] = useState<string[]>([]);
  const reactionRaf = useRef(0);
  const reactionPending = useRef<Record<string, ReactionMap>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sideview, setSideview] = useState<Sideview | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: Array<{ label: string; action: () => void; danger?: boolean }> } | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [hubFriends, setHubFriends] = useState<FriendRow[]>([]);
  const [hubFriendsLoading, setHubFriendsLoading] = useState(false);
  const [hubFriendsError, setHubFriendsError] = useState<string | null>(null);
  const [hubSearch, setHubSearch] = useState('');
  const [feedItems, setFeedItems] = useState<SocialFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedDraft, setFeedDraft] = useState('');
  const [feedPosting, setFeedPosting] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationBusy, setNotificationBusy] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<MyProfile>({
    displayName: '',
    photoURL: '',
    statusMessage: '',
    bio: '',
    linkKakaoProfile: true,
  });
  const [profileDraft, setProfileDraft] = useState<MyProfile>({
    displayName: '',
    photoURL: '',
    statusMessage: '',
    bio: '',
    linkKakaoProfile: true,
  });
  const [kakaoProfile, setKakaoProfile] = useState<KakaoMyProfile | null>(null);
  const [kakaoProfileLoading, setKakaoProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [ringingCall, setRingingCall] = useState<CallInfo | null>(null);
  const [urlIntent, setUrlIntent] = useState<UrlIntent | null>(null);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | 'version' | 'patch' | 'disclaimer' | null>(null);
  const [snapshotSinceMs, setSnapshotSinceMs] = useState<number | null>(null);
  const [backupMeta, setBackupMeta] = useState<ChatBackupMeta | null>(null);
  const [snapshotPromptOpen, setSnapshotPromptOpen] = useState(false);
  const [snapshotDraft, setSnapshotDraft] = useState('');
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupHint, setBackupHint] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  const autoResumeRef = useRef({ attempts: 0, nextAt: 0, inFlight: false });
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const scrollingProgrammatically = useRef(false);
  const notifiedMessageIds = useRef(new Set<string>());
  const snapshotSinceMsRef = useRef<number | null>(null);
  snapshotSinceMsRef.current = snapshotSinceMs;
  const sendGateRef = useRef(createSendGate());
  const roomPrefsRef = useRef(roomPrefs);
  roomPrefsRef.current = roomPrefs;
  const activeRoomMetaRef = useRef<{ name?: string; muted?: boolean; notifyDesktop?: boolean }>({});
  const isMobileUi = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches,
    [],
  );
  const [narrowUi, setNarrowUi] = useState(isMobileUi);

  const syncDisplay = displaySyncState(
    linked,
    linkStatus,
    browserOnline,
    statusPollError,
    syncClock,
  );
  const heartbeatAt = millis(linkStatus?.heartbeatAt);
  const syncReason =
    !browserOnline
      ? 'browser_offline'
      : heartbeatAt && syncClock - heartbeatAt > HEARTBEAT_STALE_MS
        ? 'heartbeat_stale'
        : linkStatus?.syncReason;
  const locoSynced = syncDisplay === 'synced';
  const profileSyncDisplay = displayProfileSyncState(profileSyncState);
  const profileSyncing = profileSyncDisplay === 'syncing';
  const profileSyncFailed = profileSyncDisplay === 'error';
  const unreadNotificationCount = notifications.filter((entry) => !entry.read).length;
  const filteredHubFriends = useMemo(() => {
    const needle = hubSearch.trim().toLocaleLowerCase('ko-KR');
    const rows = needle
      ? hubFriends.filter((friend) =>
          `${friend.nick} ${friend.statusMessage || ''}`.toLocaleLowerCase('ko-KR').includes(needle))
      : hubFriends;
    return [...rows].sort((a, b) => {
      const aRank = a.blocked ? 3 : a.favorite ? 0 : (a.muted || a.hidden) ? 2 : 1;
      const bRank = b.blocked ? 3 : b.favorite ? 0 : (b.muted || b.hidden) ? 2 : 1;
      return aRank - bRank || a.nick.localeCompare(b.nick, 'ko-KR');
    });
  }, [hubFriends, hubSearch]);

  const isBusinessFriend = (friend: FriendRow) =>
    !!friend.plus
    || friend.friendType === 'plus'
    || friend.friendType === 'channel'
    || friend.category === 'plus';

  const personalHubFriends = useMemo(
    () => filteredHubFriends.filter((friend) => !isBusinessFriend(friend)),
    [filteredHubFriends],
  );
  const businessHubFriends = useMemo(
    () => filteredHubFriends.filter((friend) => isBusinessFriend(friend)),
    [filteredHubFriends],
  );

  function applyLinkStatus(next: LinkStatus) {
    setLinked(next.linked);
    setLinkStatus((previous) => ({
      ...previous,
      ...(next.status && !next.syncState ? { syncState: next.status } : {}),
      ...next,
    }));
    if (next.profileSyncState) setProfileSyncState(next.profileSyncState);
    setStatusPollError(null);
    setSyncClock(Date.now());
  }

  function mergeObservedStatus(next: Partial<LinkStatus>, inferLinked = false) {
    if (inferLinked) setLinked((previous) => previous ?? true);
    setLinkStatus((previous) => ({
      ...previous,
      ...next,
      linked: next.linked ?? (inferLinked ? true : (previous?.linked ?? false)),
    }));
    if (next.profileSyncState) setProfileSyncState(next.profileSyncState);
    setSyncClock(Date.now());
  }

  useEffect(() => {
    setSideview(null);
    setEmojiOpen(false);
    setRoomsOpen(false);
    setUrlIntent(null);
    stickToBottom.current = true;
  }, [activeId]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    const sync = () => setNarrowUi(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyViewport = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      const keyboard = Math.max(0, window.innerHeight - height - offsetTop);
      root.style.setProperty('--app-height', `${Math.round(height)}px`);
      root.style.setProperty('--keyboard-inset', `${Math.round(keyboard)}px`);
      root.classList.toggle('keyboard-open', keyboard > 80);
    };
    applyViewport();
    window.visualViewport?.addEventListener('resize', applyViewport);
    window.visualViewport?.addEventListener('scroll', applyViewport);
    window.addEventListener('resize', applyViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', applyViewport);
      window.visualViewport?.removeEventListener('scroll', applyViewport);
      window.removeEventListener('resize', applyViewport);
    };
  }, []);

  useEffect(() => {
    const updateNetworkState = () => {
      setBrowserOnline(navigator.onLine);
      setSyncClock(Date.now());
    };
    const clock = window.setInterval(() => setSyncClock(Date.now()), 15_000);
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
    };
  }, []);

  useEffect(() => {
    if (!user || !browserOnline || busy) return;
    let disposed = false;
    let inFlight = false;

    const poll = async () => {
      if (disposed || inFlight || !navigator.onLine) return;
      inFlight = true;
      try {
        const token = await withTimeout(user.getIdToken(), 15_000, 'id_token');
        const next = await withTimeout(fetchLinkStatus(token), 20_000, 'link_status');
        if (!disposed) {
          applyLinkStatus(next);
          if (
            (next.status === 'device_required' || next.syncReason === 'device_required')
            && next.passcode
          ) {
            openDeviceReauth(next);
          }
        }
      } catch (e) {
        if (!disposed) {
          setStatusPollError(e instanceof Error ? e.message : String(e));
          setSyncClock(Date.now());
        }
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, browserOnline, busy]);

  function openUrlIntent(rawUrl: string, kind: UrlIntentKind = 'link', title?: string) {
    const url = normalizeExternalUrl(rawUrl);
    if (!url) return;
    setUrlIntent({
      url,
      kind,
      title: title || intentTitle(kind),
      subtitle: urlHostname(url),
    });
  }

  function confirmUrlIntent() {
    if (!urlIntent) return;
    window.open(urlIntent.url, '_blank', 'noopener,noreferrer');
    setUrlIntent(null);
  }

  function normalizeKakaoProfile(profile: KakaoMyProfile): KakaoMyProfile {
    const next = { ...profile };
    if (next.profileUrl?.startsWith('http://')) {
      next.profileUrl = 'https://' + next.profileUrl.slice(7);
    }
    return next;
  }

  function applyKakaoProfileToUi(profile: KakaoMyProfile) {
    const next = normalizeKakaoProfile(profile);
    setKakaoProfile(next);
    setMyProfile((current) => (
      current.linkKakaoProfile === false
        ? current
        : {
            ...current,
            displayName: next.nick || current.displayName,
            photoURL: next.profileUrl || current.photoURL,
            statusMessage: next.statusMessage ?? current.statusMessage,
            linkKakaoProfile: true,
          }
    ));
    setProfileDraft((current) => (
      current.linkKakaoProfile === false
        ? current
        : {
            ...current,
            displayName: next.nick || current.displayName,
            photoURL: next.profileUrl || current.photoURL,
            statusMessage: next.statusMessage ?? current.statusMessage,
            linkKakaoProfile: true,
          }
    ));
  }

  async function syncProfileForUser(
    targetUser: User,
    suppliedToken?: string,
  ): Promise<KakaoMyProfile | null> {
    setKakaoProfileLoading(true);
    setProfileSyncState('syncing');
    try {
      const token = suppliedToken || (await targetUser.getIdToken());
      const profile = normalizeKakaoProfile(await syncMyKakaoProfile(token));
      applyKakaoProfileToUi(profile);
      setProfileSyncState('synced');
      setLinkStatus((current) => (
        current ? { ...current, profileSyncState: 'synced' } : current
      ));
      void updateProfile(targetUser, {
        displayName: profile.nick || targetUser.displayName,
        photoURL: profile.profileUrl || targetUser.photoURL,
      }).catch(() => undefined);
      return profile;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setProfileSyncState('error');
      setLinkStatus((current) => (
        current ? { ...current, profileSyncState: 'error' } : current
      ));
      // Profile sync must not hijack the main login/session error surface.
      if (!message.includes('kakao_profile_unavailable')) {
        setError(message);
      }
      return null;
    } finally {
      setKakaoProfileLoading(false);
    }
  }

  async function loadKakaoProfile(persist = false): Promise<KakaoMyProfile | null> {
    if (!user) return null;
    if (persist) return syncProfileForUser(user);
    setKakaoProfileLoading(true);
    try {
      const token = await user.getIdToken();
      const kp = normalizeKakaoProfile(await fetchMyKakaoProfile(token));
      setKakaoProfile(kp);
      return kp;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setKakaoProfileLoading(false);
    }
  }

  async function openMyProfile() {
    const base: MyProfile = {
      displayName: myProfile.displayName || user?.displayName || user?.email?.split('@')[0] || '나',
      photoURL: myProfile.photoURL || user?.photoURL || '',
      statusMessage: myProfile.statusMessage || '',
      bio: myProfile.bio || '',
      linkKakaoProfile: myProfile.linkKakaoProfile !== false,
    };
    setProfileDraft(base);
    setSideview({ kind: 'me', profile: base });
    if (!locoSynced) return;
    const kp = await loadKakaoProfile();
    if (kp && base.linkKakaoProfile) {
      const linked: MyProfile = {
        ...base,
        displayName: kp.nick || base.displayName,
        photoURL: kp.profileUrl || base.photoURL,
        statusMessage: kp.statusMessage ?? base.statusMessage,
        linkKakaoProfile: true,
      };
      setProfileDraft(linked);
      setSideview({ kind: 'me', profile: linked });
    }
  }

  async function saveMyProfile() {
    if (!user) return;
    const link = profileDraft.linkKakaoProfile !== false;
    if (link && !locoSynced) {
      setError('카카오톡 프로필 연동은 메시지 동기화를 재개한 뒤 저장할 수 있습니다.');
      return;
    }
    let displayName = profileDraft.displayName.trim().slice(0, 40) || '나';
    let statusMessage = profileDraft.statusMessage.trim().slice(0, 120);
    let photoURL = profileDraft.photoURL.trim();
    const bio = profileDraft.bio.trim().slice(0, 400);

    if (link) {
      const kp = kakaoProfile || (await loadKakaoProfile(true));
      if (kp) {
        displayName = (kp.nick || displayName).slice(0, 40);
        statusMessage = (kp.statusMessage || '').slice(0, 120);
        photoURL = (kp.profileUrl || photoURL).trim();
      }
    }

    setProfileSaving(true);
    setError(null);
    try {
      await updateProfile(user, {
        displayName,
        photoURL: photoURL || null,
      });
      const payload = {
        displayName,
        photoURL: photoURL || null,
        profileUrl: photoURL || null,
        statusMessage,
        bio,
        linkKakaoProfile: link,
        updatedAt: Date.now(),
      };
      requireSupabase();
      await upsertVanProfile(user.uid, {
        displayName,
        photoURL,
        statusMessage,
        bio,
        linkKakaoProfile: link,
      });
      const next: MyProfile = { displayName, photoURL, statusMessage, bio, linkKakaoProfile: link };
      setMyProfile(next);
      setProfileDraft(next);
      setSideview({ kind: 'me', profile: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaving(false);
    }
  }

  async function onPhotoSelected(file: File | null) {
    if (!user || !file) return;
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('프로필 사진은 5MB 이하여야 합니다.');
      return;
    }
    setPhotoUploading(true);
    setError(null);
    try {
      const url = await uploadAvatar(user, file);
      setProfileDraft((d) => ({ ...d, photoURL: url }));
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} (사진 URL을 직접 붙여넣어도 됩니다)`
          : String(e),
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!user || !linked || !activeId) {
      setTypingUsers([]);
      return;
    }
    requireSupabase();
    const unsub = subscribeSupabaseTyping(activeId, (rows) => {
      const now = Date.now();
      const list: TypingUser[] = [];
      for (const row of rows) {
        if (row.uid === user.uid) continue;
        const updatedAt = row.updated_at ? Date.parse(row.updated_at) : 0;
        if (now - updatedAt > 5000) continue;
        list.push({
          uid: row.uid,
          nick: String(row.nick || '상대'),
          profileUrl: row.profile_url,
          updatedAt,
        });
      }
      setTypingUsers(list);
    });
    const tick = window.setInterval(() => {
      setTypingUsers((prev) => prev.filter((t) => Date.now() - t.updatedAt <= 5000));
    }, 1000);
    return () => {
      unsub();
      window.clearInterval(tick);
    };
  }, [user, linked, activeId]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
      if (user && activeId && typingActive.current) {
        requireSupabase();
        void setSupabaseTyping(activeId, user.uid, null).catch(() => undefined);
      }
    };
  }, [user, activeId]);

  useEffect(() => {
    if (!user || !linked) return;
    requireSupabase();
    void requireSupabase().from('vanced_clients').upsert({
      uid: user.uid,
      client_id: 'vantalk',
      client_tier: 'vanced',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'uid' }).then(() => undefined);
  }, [user, linked]);

  useEffect(() => {
    // Restore 2FA screen after refresh (passcode UI is otherwise wiped → blank/login reset).
    const saved = loadDeviceChallenge();
    if (saved) {
      setEmail(saved.email);
      setPasscode(saved.passcode);
      setDeviceRemain(saved.remain);
      setDeviceMode(saved.mode);
      if (saved.mode === 'resume') {
        setDeviceReauth(true);
      } else {
        setView('device');
        setError('기기 인증을 이어가려면 카카오톡 비밀번호를 다시 입력하세요.');
      }
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      async (u) => {
        setUser(u);
        setAuthReady(true);
        setLinked(null);
        setLinkStatus(null);
        setStatusPollError(null);
        setProfileSyncState('idle');
        setSyncAction(null);
        setError(null);
        resetLocoProxy();
        if (!u) {
          // Keep restored device challenge view for kakao-login 2FA (no Firebase user yet).
          if (!loadDeviceChallenge()) setView('choose');
          return;
        }
        try {
          const token = await withTimeout(u.getIdToken(), 15000, 'id_token');
          const st = await withTimeout(fetchLinkStatus(token), 20000, 'link_status');
          applyLinkStatus(st);
          if (st.linked) {
            clearDeviceChallenge();
            if (
              hasActiveSyncSession(st)
              && displayProfileSyncState(st.profileSyncState) !== 'synced'
            ) {
              void syncProfileForUser(u, token);
            }
            return;
          }
          const pending = loadDeviceChallenge();
          if (pending) {
            setEmail(pending.email);
            setPasscode(pending.passcode);
            setDeviceRemain(pending.remain);
            setDeviceMode(pending.mode);
            setView('device');
            setError('기기 인증을 이어가려면 카카오톡 비밀번호를 다시 입력하세요.');
            return;
          }
          if (isGoogleUser(u)) setView('link-kakao');
          else setError('카카오톡 계정이 연결되지 않았습니다. Google로 로그인해 연결하세요.');
        } catch (e) {
          // API reachability is not account linkage. Preserve "unknown" until a
          // status response or the owner's Firestore metadata proves linkage.
          const pending = loadDeviceChallenge();
          if (pending) {
            setEmail(pending.email);
            setPasscode(pending.passcode);
            setDeviceRemain(pending.remain);
            setDeviceMode(pending.mode);
            setView('device');
            setError('기기 인증을 이어가려면 카카오톡 비밀번호를 다시 입력하세요.');
          } else if (isGoogleUser(u)) {
            setView('link-kakao');
          }
          const msg = e instanceof Error ? e.message : String(e);
          setStatusPollError(msg);
          setError(
            msg.includes('timeout')
              ? '인증 서버 응답이 없습니다. 네트워크/VPN을 확인한 뒤 다시 시도하세요.'
              : msg,
          );
        }
      },
      (authError) => {
        setAuthReady(true);
        setUser(null);
        setError(`Firebase 인증을 초기화하지 못했습니다: ${authError.message}`);
      },
    );
  }, []);

  useEffect(() => {
    if (!user || !linked) return;
    setRoomPrefs(loadLocalRoomPrefs(user.uid));

    const mapRoom = (id: string, data: Record<string, unknown>): Room => {
      const type = String(data.type || '');
      const isOpen = type === 'OM' || type === 'OD';
      const isChannel = type === 'PlusChat';
      const channel: Room['channel'] =
        data.channel === 'community_plus'
          ? 'community_plus'
          : isOpen || data.channel === 'community'
            ? 'community'
            : isChannel || data.channel === 'van_channel'
              ? 'van_channel'
              : 'talk';
      let profileUrl = data.profileUrl as string | undefined;
      if (profileUrl?.startsWith('http://')) profileUrl = 'https://' + profileUrl.slice(7);
      return {
        id,
        name: (data.name as string) || (isOpen ? '오픈채팅' : isChannel ? '채널' : '채팅'),
        type,
        profileUrl,
        lastMessagePreview: data.lastMessagePreview as string | undefined,
        lastMessageAt: millis(data.lastMessageAt) || 0,
        channel,
        muted: data.muted === true,
      };
    };

    requireSupabase();

      return subscribeSupabaseRooms(user.uid, (rows: RoomRow[]) => {
        const list = rows.map((row) =>
          mapRoom(row.chat_id, {
            name: row.name,
            type: row.type,
            channel: row.channel,
            profileUrl: row.profile_url,
            lastMessagePreview: row.last_message_preview,
            lastMessageAt: row.last_message_at,
            muted: row.muted,
          }),
        );
        list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
        setRooms(list);
        if (!activeId && list.length) setActiveId(list[0].id);
      });
    
  }, [user, linked, activeId]);

  useEffect(() => {
    if (!user || !linked) {
      setRoomPrefs({});
      return;
    }
    requireSupabase();

      return subscribeSupabaseRoomPrefs(user.uid, (rows: RoomPrefRow[]) => {
        const next: Record<string, RoomPrefs> = { ...loadLocalRoomPrefs(user.uid) };
        rows.forEach((row) => {
          next[row.chat_id] = prefsFromFirestore({
            muted: row.muted,
            notifyDesktop: row.notify_desktop,
            pinned: row.pinned,
          });
        });
        setRoomPrefs(next);
        saveLocalRoomPrefs(user.uid, next);
      });
    
  }, [user, linked]);

  useEffect(() => {
    if (!user || !linked) {
      setFeedItems([]);
      setFeedLoading(false);
      return;
    }
    setFeedLoading(true);
    const mapFeed = (id: string, data: Record<string, unknown>): SocialFeedItem => {
      const ownerUid = String(data.ownerUid || data.authorUid || '') || undefined;
      const reactions = data.reactions;
      const reactionCount =
        typeof data.reactionCount === 'number'
          ? data.reactionCount
          : Array.isArray(reactions)
            ? reactions.length
            : reactions && typeof reactions === 'object'
              ? Object.keys(reactions as Record<string, unknown>).length
              : 0;
      return {
        id,
        authorUid: ownerUid,
        authorName:
          ownerUid === user.uid
            ? myProfile.displayName || user.displayName || '나'
            : String(
                data.authorName
                || data.authorNick
                || data.displayName
                || data.nick
                || 'Van톡 사용자',
              ),
        authorProfileUrl:
          ownerUid === user.uid
            ? myProfile.photoURL || user.photoURL || undefined
            : String(data.authorProfileUrl || data.profileUrl || data.photoURL || '') || undefined,
        content: String(data.text || data.content || data.body || ''),
        mediaUrl: String(data.mediaUrl || data.imageUrl || data.photoUrl || '') || undefined,
        createdAt:
          millis(data.createdAt)
          || millis(data.publishedAt)
          || Number(data.createdAtMs || data.updatedAt || 0),
        visibility: typeof data.visibility === 'string' ? data.visibility : undefined,
        reactionCount,
      };
    };
    requireSupabase();

      return subscribeSupabaseFeed(user.uid, 80, (rows: FeedRow[]) => {
        const next = rows.map((row) => mapFeed(row.id, {
          ownerUid: row.owner_uid,
          authorUid: row.author_uid,
          authorName: row.author_name,
          authorProfileUrl: row.author_profile_url,
          text: row.text,
          mediaUrl: row.media_url,
          createdAt: row.created_at,
          createdAtMs: row.created_at_ms,
          visibility: row.visibility,
        }));
        next.sort((a, b) => b.createdAt - a.createdAt);
        setFeedItems(next);
        setFeedError(null);
        setFeedLoading(false);
      });
    
  }, [user, linked, myProfile.displayName, myProfile.photoURL]);

  useEffect(() => {
    if (!user || !linked) {
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }
    setNotificationsLoading(true);
    const mapNotif = (id: string, data: Record<string, unknown>): NotificationEntry => {
      const metadata =
        data.metadata && typeof data.metadata === 'object'
          ? data.metadata as Record<string, unknown>
          : {};
      return {
        id,
        type: String(data.type || data.kind || metadata.type || 'activity'),
        title: String(
          data.title || metadata.title || data.actorName || metadata.actorName || data.nick || '새 소식',
        ),
        body: String(data.body || metadata.body || data.message || metadata.message || data.text || ''),
        createdAt:
          millis(data.createdAt)
          || millis(data.sentAt)
          || Number(data.createdAtMs || data.updatedAt || 0),
        read: data.read === true || Boolean(data.readAt),
        roomId: String(
          data.roomId || data.chatId || data.targetRoomId || metadata.roomId || metadata.chatId || '',
        ) || undefined,
        actorName: String(data.actorName || metadata.actorName || data.nick || '') || undefined,
        actorProfileUrl: String(
          data.actorProfileUrl
          || metadata.actorProfileUrl
          || data.profileUrl
          || data.photoURL
          || '',
        ) || undefined,
      };
    };
    requireSupabase();

      return subscribeSupabaseNotifications(user.uid, 100, (rows: NotificationRow[]) => {
        const next = rows.map((row) => mapNotif(row.id, {
          type: row.type,
          title: row.title,
          body: row.body,
          chatId: row.chat_id,
          createdAt: row.created_at,
          read: row.read,
          readAt: row.read_at,
          metadata: row.metadata,
          actorId: row.actor_id,
        }));
        next.sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(next);
        setNotificationsError(null);
        setNotificationsLoading(false);
      });
    
  }, [user, linked]);

  useEffect(() => {
    if (workspaceView !== 'friends' || !user || !linked) return;
    let disposed = false;
    setHubFriendsLoading(true);
    setHubFriendsError(null);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const friends = await listFriends(token);
        if (!disposed) setHubFriends(friends);
      } catch (hubError) {
        if (!disposed) {
          setHubFriendsError(hubError instanceof Error ? hubError.message : String(hubError));
        }
      } finally {
        if (!disposed) setHubFriendsLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [workspaceView, user, linked, locoSynced]);

  useEffect(() => {
    if (!user || !linked) {
      setRingingCall(null);
      return;
    }
    const RING_TTL_MS = 90_000;
    const applyCall = (callId: string, data: Record<string, unknown>) => {
      const sendAtMs = millis(data.sendAtMs) || Number(data.sendAtMs || 0) || 0;
      const updatedAt = millis(data.updatedAt) || Number(data.updatedAt || 0) || 0;
      const ageAnchor = sendAtMs || updatedAt;
      if (!ageAnchor || Date.now() - ageAnchor > RING_TTL_MS) {
        setRingingCall(null);
        return;
      }
      if (String(data.callAction || '') !== 'INVITE') {
        setRingingCall(null);
        return;
      }
      setRingingCall({
        callId: String(data.callId || callId),
        callKind: data.callKind as string | undefined,
        callAction: data.callAction as string | undefined,
        callPreview: data.callPreview as string | undefined,
        csIP: data.csIP as string | undefined,
        csPort: Number(data.csPort || 0) || undefined,
        durationSec: Number(data.durationSec || 0) || undefined,
        status: data.status as string | undefined,
        sendAtMs: ageAnchor,
        updatedAt,
      });
    };
    requireSupabase();

      return subscribeSupabaseCalls(user.uid, (rows: CallRow[]) => {
        if (!rows.length) {
          setRingingCall(null);
          return;
        }
        const row = rows[0];
        const raw = (row.raw || {}) as Record<string, unknown>;
        applyCall(row.call_id, {
          ...raw,
          callId: row.call_id,
          status: row.status,
          callKind: row.call_kind || raw.callKind,
          callAction: row.call_action || raw.callAction,
          sendAtMs: row.send_at_ms || raw.sendAtMs,
          updatedAt: row.updated_at || raw.updatedAt,
          callPreview: raw.callPreview,
          csIP: raw.csIP,
          csPort: raw.csPort,
          durationSec: raw.durationSec,
        });
      });
    
  }, [user, linked]);

  useEffect(() => {
    if (!ringingCall?.sendAtMs) return;
    const remain = ringingCall.sendAtMs + 90_000 - Date.now();
    if (remain <= 0) {
      setRingingCall(null);
      return;
    }
    const timer = window.setTimeout(() => setRingingCall(null), remain + 50);
    return () => window.clearTimeout(timer);
  }, [ringingCall?.callId, ringingCall?.sendAtMs]);

  // Chat backup meta + snapshot cutoff (Google-linked users get auto backup).
  useEffect(() => {
    if (!user || !linked) {
      setSnapshotSinceMs(null);
      setBackupMeta(null);
      setSnapshotPromptOpen(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const vis = await loadChatVisibility(user);
        if (cancelled) return;
        setSnapshotSinceMs(vis.snapshotSinceMs);
        setBackupMeta(vis.backup);
        const needsSnapshot =
          !vis.backup?.hasBackup
          && !(vis.snapshotSinceMs && vis.snapshotSinceMs > 0);
        setSnapshotPromptOpen(needsSnapshot);
        if (!vis.snapshotSinceMs) {
          setSnapshotDraft(new Date().toISOString().slice(0, 10));
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[chat-backup] visibility load failed', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, linked]);

  useEffect(() => {
    if (!user || !linked || !isGoogleUser(user) || rooms.length === 0) return;
    let cancelled = false;
    const busyRef = { current: false };
    const runBackup = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      setBackupBusy(true);
      try {
        const msgs = await collectMessagesForBackup(
          user.uid,
          rooms.map((r) => r.id),
        );
        if (cancelled) return;
        const meta = await uploadEncryptedChatBackup(user, msgs);
        if (cancelled) return;
        setBackupMeta(meta);
        setBackupHint(`암호화 백업 완료 · ${meta.messageCount}건`);
        setSnapshotPromptOpen(false);
      } catch (e) {
        if (!cancelled) {
          console.warn('[chat-backup] upload failed', e);
          setBackupHint('백업을 잠시 미룹니다. 다음 주기에 다시 시도합니다.');
        }
      } finally {
        busyRef.current = false;
        if (!cancelled) setBackupBusy(false);
      }
    };
    const first = window.setTimeout(() => void runBackup(), 12_000);
    const interval = window.setInterval(() => void runBackup(), 10 * 60_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void runBackup();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [user, linked, rooms.map((r) => r.id).join('|')]);

  const decoratedRooms = useMemo(() => {
    return rooms.map((room) => {
      const prefs = roomPrefs[room.id];
      const muted = prefs?.muted ?? room.muted ?? false;
      return {
        ...room,
        muted,
        notifyDesktop: muted ? false : (prefs?.notifyDesktop ?? true),
        pinned: prefs?.pinned ?? false,
      };
    }).sort((a, b) => {
      const pin = Number(!!b.pinned) - Number(!!a.pinned);
      if (pin) return pin;
      return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
    });
  }, [rooms, roomPrefs]);

  const activeRoom = useMemo(
    () => decoratedRooms.find((r) => r.id === activeId) || null,
    [decoratedRooms, activeId],
  );
  activeRoomMetaRef.current = {
    name: activeRoom?.name,
    muted: activeRoom?.muted,
    notifyDesktop: activeRoom?.notifyDesktop,
  };
  const isPlusRoom =
    activeRoom?.channel === 'community_plus' || !!activeId?.startsWith('vcplus-');
  const composerEnabled = isPlusRoom || locoSynced;
  const messageWindow = narrowUi ? 100 : 160;


  useEffect(() => {
    notifiedMessageIds.current.clear();
  }, [activeId]);

  useEffect(() => {
    if (!user || !linked || !activeId) {
      setMessages([]);
      setSideview(null);
      return;
    }
    let primed = false;

    const materialize = (id: string, data: Record<string, unknown>) => {
      const rawText = String(data.text || '');
      const deleted = isDeletedFeedMessage(rawText, data.mediaType as string | undefined)
        || data.hidden === true
        || Number(data.feedType || 0) === 25
        || (data.feed && typeof data.feed === 'object'
          && Number((data.feed as { type?: number }).type || 0) === 25);
      const parsedFeed = deleted
        ? undefined
        : ((data.feed as Feed | undefined) || parseKakaoFeed(rawText));
      return {
        id,
        authorId: Number(data.authorId || 0),
        nick: (data.nick as string) || (data.authorUid === user.uid ? '나' : '상대'),
        text: deleted ? '삭제된 메시지' : rawText,
        sendAtMs: millis(data.sendAtMs) || Number(data.sendAtMs || 0) || 0,
        youtube: deleted ? undefined : data.youtube as Yt | undefined,
        authorProfileUrl: (() => {
          let u = data.authorProfileUrl as string | undefined;
          if (u?.startsWith('http://')) u = 'https://' + u.slice(7);
          return u;
        })(),
        mediaUrl: deleted ? undefined : data.mediaUrl as string | undefined,
        mediaType: deleted ? 'deleted' : data.mediaType as string | undefined,
        thumbUrl: deleted ? undefined : data.thumbUrl as string | undefined,
        fileName: deleted ? undefined : data.fileName as string | undefined,
        feed: parsedFeed?.type === 25 ? undefined : parsedFeed,
        call: deleted ? undefined : (data.call as CallInfo | undefined) || undefined,
      };
    };

    const applyMessages = (nextMessages: ReturnType<typeof materialize>[]) => {
      const filtered = filterMessagesSince(nextMessages, snapshotSinceMsRef.current);
      setMessages(filtered);
      if (!primed) {
        primed = true;
        for (const message of filtered) notifiedMessageIds.current.add(message.id);
        return;
      }
      const prefs = normalizePrefs(
        roomPrefsRef.current[activeId] || {
          muted: activeRoomMetaRef.current.muted,
          notifyDesktop: activeRoomMetaRef.current.notifyDesktop,
        },
      );
      if (!prefs.muted && prefs.notifyDesktop && document.visibilityState === 'hidden') {
        const newest = filtered[filtered.length - 1];
        if (
          newest
          && newest.nick !== '나'
          && !newest.feed
          && newest.mediaType !== 'deleted'
          && !notifiedMessageIds.current.has(newest.id)
        ) {
          notifiedMessageIds.current.add(newest.id);
          if (notifiedMessageIds.current.size > 200) {
            notifiedMessageIds.current = new Set([...notifiedMessageIds.current].slice(-100));
          }
          showChatNotification({
            title: activeRoomMetaRef.current.name || 'Van톡',
            body: newest.text || newest.fileName || '새 메시지',
            tag: `room-${activeId}`,
            onClick: () => {
              setActiveId(activeId);
              setWorkspaceView('chats');
            },
          });
        }
      }
    };

    if (isPlusRoom) {
      // Community+ still uses Supabase community_messages realtime via poll insert path.
      setMessages([]);
      return;
    }
    requireSupabase();
    return subscribeSupabaseMessages(user.uid, activeId, messageWindow, (rows: MessageRow[]) => {
      const nextMessages = rows
        .map((row) =>
          materialize(row.log_id, {
            text: row.text,
            authorId: row.author_id,
            nick: row.nick,
            sendAtMs: row.send_at_ms,
            youtube: row.youtube,
            authorProfileUrl: row.author_profile_url,
            mediaUrl: row.media_url,
            mediaType: row.media_type,
            thumbUrl: row.thumb_url,
            fileName: row.file_name,
            feed: row.feed,
            call: row.call,
            hidden: row.hidden,
            feedType: row.feed_type,
          }),
        )
        .sort((a, b) => (a.sendAtMs || 0) - (b.sendAtMs || 0));
      applyMessages(nextMessages);
    });
  }, [user, linked, activeId, isPlusRoom, messageWindow, snapshotSinceMs]);

  useEffect(() => {
    if (!user || !linked || !activeId) return;
    const ids = visibleMessageIds.slice(narrowUi ? -24 : -36);
    if (!ids.length) return;
    const unsubs: Array<() => void> = [];
    const flush = () => {
      reactionRaf.current = 0;
      const batch = reactionPending.current;
      reactionPending.current = {};
      if (!Object.keys(batch).length) return;
      setReactions((prev) => ({ ...prev, ...batch }));
    };
    for (const id of ids) {
      requireSupabase();
      unsubs.push(
        subscribeSupabaseReactions(user.uid, activeId, id, (map) => {
          reactionPending.current[id] = map;
          if (!reactionRaf.current) {
            reactionRaf.current = requestAnimationFrame(flush);
          }
        }),
      );
    }
    return () => {
      unsubs.forEach((u) => u());
      if (reactionRaf.current) cancelAnimationFrame(reactionRaf.current);
      reactionRaf.current = 0;
    };
  }, [user, linked, activeId, visibleMessageIds.join('|'), narrowUi]);

  const onVisibleMessages = useCallback((start: number, end: number) => {
    setVisibleMessageIds((previous) => {
      const next = messages.slice(start, end).map((m) => m.id);
      if (
        previous.length === next.length
        && previous.every((id, index) => id === next[index])
      ) {
        return previous;
      }
      return next;
    });
  }, [messages]);

  function scrollMessagesToBottom() {
    const el = messagesRef.current;
    if (!el) return;
    scrollingProgrammatically.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      scrollingProgrammatically.current = false;
    });
  }

  useEffect(() => {
    if (!stickToBottom.current) return;
    scrollMessagesToBottom();
  }, [messages, activeId]);

  const [clientTier, setClientTier] = useState<'vanced' | 'supervanced'>('vanced');

  useEffect(() => {
    if (!user) return;
    requireSupabase();

      return subscribeSupabaseProfile(user.uid, (row: ProfileRow | null) => {
        if (!row) return;
        const data = {
          displayName: row.display_name,
          photoURL: row.photo_url || row.profile_url,
          profileUrl: row.profile_url || row.photo_url,
          statusMessage: row.status_message,
          bio: row.bio,
          linkKakaoProfile: row.link_kakao_profile,
          clientTier: row.client_tier,
        };
        const observed = linkStatusFromSync(syncStatusToLegacy(null));
        void observed;
        const tier = data.clientTier;
        setClientTier(tier === 'supervanced' || tier === 'plus' ? 'supervanced' : 'vanced');
        const next: MyProfile = {
          displayName: String(data.displayName || user.displayName || user.email?.split('@')[0] || '나'),
          photoURL: String(data.photoURL || user.photoURL || ''),
          statusMessage: String(data.statusMessage || ''),
          bio: String(data.bio || ''),
          linkKakaoProfile: data.linkKakaoProfile !== false,
        };
        setMyProfile(next);
      });
    
  }, [user]);

  useEffect(() => {
    if (!user) return;
    requireSupabase();

      return subscribeSyncStatus(user.uid, (row) => {
        const observed = linkStatusFromSync(syncStatusToLegacy(row));
        if (observed.explicitLinked !== undefined) {
          setLinked(observed.explicitLinked);
          observed.patch.linked = observed.explicitLinked;
        }
        mergeObservedStatus(observed.patch, observed.inferLinked);
      });
    
  }, [user]);

  async function loginGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onKakaoLogin(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await loginKakao(email.trim(), password);
      if (result.status === 'device_required') {
        const pc = result.passcode || null;
        const remain = result.remainingSeconds ?? null;
        setPasscode(pc);
        setDeviceRemain(remain);
        setDeviceMode('login');
        setView('device');
        saveDeviceChallenge({
          email: email.trim(),
          passcode: pc,
          remain,
          mode: 'login',
          savedAt: Date.now(),
        });
        return;
      }
      clearDeviceChallenge();
      const credential = await signInWithCustomToken(auth, result.customToken);
      applyLinkStatus({
        linked: true,
        sessionActive: true,
        status: 'active',
        syncState: 'active',
        profileSyncState: 'syncing',
      });
      void syncProfileForUser(credential.user, await credential.user.getIdToken());
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : humanError(String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function onLinkKakao(ev: FormEvent) {
    ev.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const result = await linkKakao(token, email.trim(), password);
      if (result.status === 'device_required') {
        const pc = result.passcode || null;
        const remain = result.remainingSeconds ?? null;
        setPasscode(pc);
        setDeviceRemain(remain);
        setDeviceMode('link');
        setView('device');
        saveDeviceChallenge({
          email: email.trim(),
          passcode: pc,
          remain,
          mode: 'link',
          savedAt: Date.now(),
        });
        return;
      }
      clearDeviceChallenge();
      applyLinkStatus({
        linked: true,
        sessionActive: true,
        status: result.status,
        syncState: 'active',
        kakaoUserId: result.kakaoUserId,
        profileSyncState: 'syncing',
      });
      void syncProfileForUser(user, token);
      setPassword('');
      setView('choose');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDevice() {
    setError(null);
    setBusy(true);
    try {
      if (deviceMode === 'resume' || (deviceMode === 'link' && deviceReauth)) {
        if (!user) throw new Error('not_signed_in');
        const token = await user.getIdToken();
        const result = await completeLinkDevice(token, email.trim());
        if (result.status === 'device_required') {
          const pc = result.passcode || passcode;
          const remain = result.remainingSeconds ?? null;
          setPasscode(pc);
          setDeviceRemain(remain);
          openDeviceReauth({ email: email.trim(), passcode: pc, remainingSeconds: remain });
          return;
        }
        clearDeviceChallenge();
        setDeviceReauth(false);
        resetLocoProxy();
        applyLinkStatus({
          linked: true,
          sessionActive: true,
          status: result.status,
          syncState: 'active',
          kakaoUserId: result.kakaoUserId,
          profileSyncState: 'syncing',
        });
        autoResumeRef.current.attempts = 0;
        void syncProfileForUser(user, token);
        setPasscode(null);
        return;
      }
      if (deviceMode === 'link') {
        if (!user) throw new Error('not_signed_in');
        const token = await user.getIdToken();
        const result = await completeLinkDevice(token, email.trim());
        if (result.status === 'device_required') {
          const pc = result.passcode || passcode;
          const remain = result.remainingSeconds ?? null;
          setPasscode(pc);
          setDeviceRemain(remain);
          saveDeviceChallenge({
            email: email.trim(),
            passcode: pc,
            remain,
            mode: 'link',
            savedAt: Date.now(),
          });
          return;
        }
        clearDeviceChallenge();
        applyLinkStatus({
          linked: true,
          sessionActive: true,
          status: result.status,
          syncState: 'active',
          kakaoUserId: result.kakaoUserId,
          profileSyncState: 'syncing',
        });
        void syncProfileForUser(user, token);
        setPassword('');
        setView('choose');
        setPasscode(null);
      } else {
        const result = await completeLoginDevice(email.trim(), password);
        if (result.status === 'device_required') {
          const pc = result.passcode || passcode;
          const remain = result.remainingSeconds ?? null;
          setPasscode(pc);
          setDeviceRemain(remain);
          saveDeviceChallenge({
            email: email.trim(),
            passcode: pc,
            remain,
            mode: 'login',
            savedAt: Date.now(),
          });
          return;
        }
        clearDeviceChallenge();
        const credential = await signInWithCustomToken(auth, result.customToken);
        applyLinkStatus({
          linked: true,
          sessionActive: true,
          status: 'active',
          syncState: 'active',
          profileSyncState: 'syncing',
        });
        void syncProfileForUser(credential.user, await credential.user.getIdToken());
        setPassword('');
        setPasscode(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openDeviceReauth(challenge: {
    email?: string;
    passcode?: string | null;
    remainingSeconds?: number | null;
  }) {
    const nextEmail = (challenge.email || email || '').trim();
    if (nextEmail) setEmail(nextEmail);
    const pc = challenge.passcode || null;
    const remain = challenge.remainingSeconds ?? null;
    setPasscode(pc);
    setDeviceRemain(remain);
    setDeviceMode('resume');
    setDeviceReauth(true);
    if (nextEmail) {
      saveDeviceChallenge({
        email: nextEmail,
        passcode: pc,
        remain,
        mode: 'resume',
        savedAt: Date.now(),
      });
    }
  }

  function applyResumeResult(next: LinkStatus) {
    applyLinkStatus(next);
    if (next.status === 'device_required' || next.syncReason === 'device_required') {
      openDeviceReauth(next);
      return false;
    }
    if (next.sessionActive === true
      || ['active', 'synced', 'connected', 'online'].includes(normalizedSyncToken(next))) {
      autoResumeRef.current.attempts = 0;
      setDeviceReauth(false);
      clearDeviceChallenge();
      return true;
    }
    return false;
  }

  async function resumeSync(options?: { silent?: boolean }) {
    if (!user || !browserOnline || syncAction) return;
    if (deviceReauth && options?.silent) return;
    setSyncAction('resume');
    if (!options?.silent) setError(null);
    try {
      const token = await user.getIdToken();
      const next = await resumeKakao(token);
      resetLocoProxy();
      const resumed = applyResumeResult(next);
      if (next.linked && resumed) void syncProfileForUser(user, token);
      else if (!options?.silent && next.status !== 'device_required') {
        setError(syncReasonLabel(next.syncReason, true));
      }
    } catch (e) {
      if (!options?.silent) {
        setError(e instanceof Error ? e.message : humanError(String(e)));
      }
    } finally {
      setSyncAction(null);
    }
  }

  useEffect(() => {
    if (!user || linked !== true || !browserOnline || deviceReauth) return;
    if (syncDisplay !== 'offline') {
      autoResumeRef.current.attempts = 0;
      return;
    }
    const reason = String(syncReason || '').toLowerCase();
    if (
      reason === 'remote_login'
      || reason === 'other_device'
      || reason === 'session_conflict'
      || reason === 'logout'
      || reason === 'user_logout'
      || reason === 'device_required'
      || reason === 'browser_offline'
    ) {
      return;
    }
    const now = Date.now();
    const state = autoResumeRef.current;
    if (state.inFlight || now < state.nextAt || syncAction) return;
    if (state.attempts >= 8) return;
    const delay = Math.min(60_000, 2_000 * (2 ** Math.min(state.attempts, 4)));
    const timer = window.setTimeout(() => {
      if (autoResumeRef.current.inFlight) return;
      autoResumeRef.current.inFlight = true;
      autoResumeRef.current.attempts += 1;
      autoResumeRef.current.nextAt = Date.now() + delay;
      void resumeSync({ silent: true }).finally(() => {
        autoResumeRef.current.inFlight = false;
      });
    }, Math.max(800, state.nextAt - now));
    return () => window.clearTimeout(timer);
  }, [user, linked, browserOnline, syncDisplay, syncReason, deviceReauth, syncAction]);

  async function refreshSyncStatus() {
    if (!user || !browserOnline || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      applyLinkStatus(await fetchLinkStatus(token));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatusPollError(message);
      setError(
        message.includes('timeout')
          ? '인증 서버 응답이 없습니다. 네트워크/VPN을 확인한 뒤 다시 시도하세요.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function logoutSafely() {
    if (!user || syncAction) return;
    const confirmed = window.confirm(
      '로그아웃하면 AWS의 카카오톡 동기화 세션도 안전하게 중단됩니다. 계속할까요?',
    );
    if (!confirmed) return;
    setSyncAction('logout');
    setError(null);
    try {
      const token = await user.getIdToken();
      const next = await logoutKakao(token);
      applyLinkStatus(next);
      resetLocoProxy();
      await signOut(auth);
    } catch (e) {
      setError(e instanceof Error ? e.message : humanError(String(e)));
    } finally {
      setSyncAction(null);
    }
  }

  async function clearTyping() {
    if (!user || !activeId || !typingActive.current) return;
    typingActive.current = false;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
    try {
      requireSupabase();
      await setSupabaseTyping(activeId, user.uid, null);
    } catch {
      /* ignore */
    }
  }

  function publishTyping() {
    if (!user || !activeId) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const nick = myProfile.displayName || user.displayName || user.email?.split('@')[0] || '나';
          const profileUrl = myProfile.photoURL || user.photoURL || null;
          requireSupabase();
          await setSupabaseTyping(activeId, user.uid, {
            nick,
            profileUrl: profileUrl || undefined,
          });
          typingActive.current = true;
        } catch {
          /* ignore */
        }
      })();
    }, 250);
    if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
    typingClearTimer.current = setTimeout(() => {
      void clearTyping();
    }, 3500);
  }

  async function send() {
    if (!user || !activeId || !draft.trim() || sending) return;
    if (!sendGateRef.current.allow(activeId)) {
      setError('메시지 전송이 너무 빠릅니다. 잠시 후 다시 시도해 주세요. (도배 방지)');
      return;
    }
    const plus = activeRoom?.channel === 'community_plus' || activeId.startsWith('vcplus-');
    if (!plus && !locoSynced) {
      // Kick an auto-resume instead of leaving the user stuck.
      void resumeSync({ silent: true });
      setError(`${syncStateLabel(syncDisplay)} · 동기화를 다시 시작하는 중입니다…`);
      return;
    }
    setSending(true);
    try {
      await clearTyping();
      const text = draft.trim();
      if (plus) {
        await insertCommunityMessage(activeId, {
          author_uid: user.uid,
          author_id: '0',
          nick: myProfile.displayName || user.displayName || user.email || 'Van톡',
          author_profile_url: myProfile.photoURL || user.photoURL || null,
          text,
          send_at_ms: Date.now(),
          client_id: 'vantalk',
        });
        // Room preview update is bridge-owned (client writes to rooms/ are denied by rules).
      } else {
        const names = [...text.matchAll(/:([a-zA-Z0-9_]{1,32}):/g)].map((m) => m[1]);
        const extra =
          names.length === 0
            ? '{}'
            : JSON.stringify({
                vantalk: {
                  emojis: names.map((name) => ({ name, token: `:${name}:` })),
                },
              });
        const token = await user.getIdToken();
        const writeOnce = () => locoWrite(token, user.uid, activeId, text, extra);
        try {
          await writeOnce();
        } catch (first) {
          const message = first instanceof Error ? first.message : String(first);
          if (
            message === 'session_inactive'
            || message === 'session_expired'
            || message === 'loco_proxy_failed'
            || message === 'write_failed'
            || message === 'handshake_failed'
          ) {
            await resumeSync({ silent: true });
            resetLocoProxy();
            await writeOnce();
          } else {
            throw first;
          }
        }
      }
      setDraft('');
      stickToBottom.current = true;
      scrollMessagesToBottom();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message === 'session_inactive'
        || message === 'session_expired'
        || message === 'loco_proxy_failed'
      ) {
        mergeObservedStatus({
          sessionActive: false,
          status: 'disconnected',
          syncState: 'offline',
          syncReason: 'command_failed',
        });
      }
      setError(humanError(message));
    } finally {
      setSending(false);
    }
  }

  async function confirmSnapshotSince() {
    if (!user || !snapshotDraft || snapshotBusy) return;
    const parsed = Date.parse(`${snapshotDraft}T00:00:00`);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('스냅샷 날짜를 확인해 주세요.');
      return;
    }
    setSnapshotBusy(true);
    setError(null);
    try {
      await saveSnapshotSince(user, parsed);
      setSnapshotSinceMs(parsed);
      setSnapshotPromptOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '스냅샷 저장에 실패했습니다.');
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function openProfile(base: PersonalProfile) {
    setSideview({ kind: 'profile', profile: base });
    if (!user || !base.userId) return;
    try {
      const token = await user.getIdToken();
      const st = await fetchFriendStatus(token, base.userId);
      setSideview({
        kind: 'profile',
        profile: {
          userId: base.userId,
          directChatId: st.directChatId || base.directChatId,
          nick: st.nick || base.nick,
          profileUrl: st.profileUrl || base.profileUrl,
          statusMessage: st.statusMessage,
          backgroundUrl: st.backgroundUrl || base.backgroundUrl,
          musicTitle: st.musicTitle || base.musicTitle,
          musicArtist: st.musicArtist || base.musicArtist,
          musicAlbumUrl: st.musicAlbumUrl || base.musicAlbumUrl,
          musicContentUrl: st.musicContentUrl || base.musicContentUrl,
          isFriend: st.isFriend,
          blocked: st.blocked,
          muted: st.muted ?? st.hidden,
          favorite: st.favorite,
          addible: st.addible,
        },
      });
    } catch {
      /* keep base profile */
    }
  }

  async function applyFriendPatch(userId: number, ops: PatchOps) {
    if (!user || !userId) return;
    setFriendBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const plus = activeRoom?.type === 'PlusChat';
      const result = await patchFriend(token, userId, ops, !!plus);
      const snap = result.snapshot;
      if (snap) {
        setHubFriends((current) => current.map((friend) =>
          friend.userId === userId
            ? {
                ...friend,
                nick: snap.nick || friend.nick,
                profileUrl: snap.profileUrl || friend.profileUrl,
                statusMessage: snap.statusMessage ?? friend.statusMessage,
                isFriend: snap.isFriend,
                blocked: snap.blocked,
                muted: snap.muted ?? snap.hidden,
                hidden: snap.hidden ?? snap.muted,
                favorite: snap.favorite,
              }
            : friend));
        setSideview({
          kind: 'profile',
          profile: {
            userId,
            directChatId:
              snap.directChatId
              || hubFriends.find((friend) => friend.userId === userId)?.directChatId,
            nick: snap.nick || String(userId),
            profileUrl: snap.profileUrl,
            statusMessage: snap.statusMessage,
            isFriend: snap.isFriend,
            blocked: snap.blocked,
            muted: snap.muted ?? snap.hidden,
            favorite: snap.favorite,
            addible: snap.addible,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFriendBusy(false);
    }
  }

  async function openFriendsManager() {
    if (!user) return;
    setFriendBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const friends = await listFriends(token);
      setSideview({ kind: 'friends', friends });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFriendBusy(false);
    }
  }

  function openWorkspace(next: WorkspaceView) {
    setWorkspaceView(next);
    setRoomsOpen(false);
    setEmojiOpen(false);
    setSideview(null);
    if (next !== 'friends') setHubSearch('');
  }

  function openDirectChat(chatId: number) {
    if (chatId <= 0) return;
    const room = rooms.find((candidate) => candidate.id === String(chatId));
    if (!room) {
      setError('해당 1:1 대화가 아직 동기화되지 않았습니다.');
      return;
    }
    setActiveId(room.id);
    openWorkspace('chats');
  }

  async function refreshHubFriends() {
    if (!user || hubFriendsLoading) return;
    setHubFriendsLoading(true);
    setHubFriendsError(null);
    try {
      const friends = await listFriends(await user.getIdToken());
      setHubFriends(friends);
    } catch (hubError) {
      setHubFriendsError(hubError instanceof Error ? hubError.message : String(hubError));
    } finally {
      setHubFriendsLoading(false);
    }
  }

  async function publishFeedPost() {
    if (!user || feedPosting) return;
    const content = feedDraft.trim();
    if (!content) return;
    setFeedPosting(true);
    setFeedError(null);
    try {
      const token = await user.getIdToken();
      try {
        await bridgeJson(token, '/v1/feed', {
          method: 'POST',
          body: JSON.stringify({ text: content, kind: 'post' }),
        });
      } catch (bridgeError) {
        if (!bridgeUnavailable(bridgeError)) throw bridgeError;
        requireSupabase();
        const now = Date.now();
        const id = `feed_${now}`;
        await requireSupabase().from('feed_posts').upsert({
          owner_uid: user.uid,
          id,
          author_uid: user.uid,
          text: content,
          media_url: '',
          kind: 'post',
          visibility: 'owner',
          source: 'van_feed',
          created_at: now,
          created_at_ms: now,
        }, { onConflict: 'owner_uid,id' });
      }
      setFeedDraft('');
    } catch (postError) {
      setFeedError(postError instanceof Error ? postError.message : String(postError));
    } finally {
      setFeedPosting(false);
    }
  }

  async function deleteFeedPost(postId: string) {
    if (!user || !postId) return;
    const confirmed = window.confirm('이 피드 글을 삭제할까요?');
    if (!confirmed) return;
    setFeedError(null);
    try {
      const token = await user.getIdToken();
      try {
        await bridgeJson(token, `/v1/feed/${encodeURIComponent(postId)}/delete`, {
          method: 'POST',
          body: '{}',
        });
      } catch (bridgeError) {
        if (bridgeError instanceof Error && bridgeError.message === 'feed_post_not_found') return;
        if (!bridgeUnavailable(bridgeError)) throw bridgeError;
        requireSupabase();
        await requireSupabase().from('feed_posts').delete()
          .eq('owner_uid', user.uid).eq('id', postId);
      }
    } catch (deleteError) {
      setFeedError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  }

  async function markNotificationRead(entry: NotificationEntry) {
    if (!user || entry.read || notificationBusy) return;
    setNotificationBusy(entry.id);
    setNotificationsError(null);
    try {
      const token = await user.getIdToken();
      try {
        await bridgeJson(token, `/v1/notifications/${encodeURIComponent(entry.id)}/read`, {
          method: 'POST',
          body: '{}',
        });
      } catch (bridgeError) {
        if (bridgeError instanceof Error && bridgeError.message === 'notification_not_found') return;
        if (!bridgeUnavailable(bridgeError)) throw bridgeError;
        requireSupabase();
        await requireSupabase().from('notifications').update({
          read: true,
          read_at: Date.now(),
        }).eq('owner_uid', user.uid).eq('id', entry.id);
      }
    } catch (readError) {
      setNotificationsError(readError instanceof Error ? readError.message : String(readError));
    } finally {
      setNotificationBusy(null);
    }
  }

  async function markAllNotificationsRead() {
    if (!user || notificationBusy || unreadNotificationCount === 0) return;
    const ids = notifications.filter((entry) => !entry.read).map((entry) => entry.id);
    setNotificationBusy('all');
    setNotificationsError(null);
    try {
      const token = await user.getIdToken();
      try {
        await bridgeJson(token, '/v1/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
      } catch (bridgeError) {
        if (!bridgeUnavailable(bridgeError)) throw bridgeError;
        requireSupabase();
        const readAt = Date.now();
        await requireSupabase().from('notifications').update({
          read: true,
          read_at: readAt,
        }).eq('owner_uid', user.uid).in('id', ids);
      }
    } catch (readError) {
      setNotificationsError(readError instanceof Error ? readError.message : String(readError));
    } finally {
      setNotificationBusy(null);
    }
  }

  async function openNotification(entry: NotificationEntry) {
    await markNotificationRead(entry);
    if (!entry.roomId) return;
    const matchingRoom = rooms.find((room) => room.id === entry.roomId);
    if (!matchingRoom) return;
    setActiveId(matchingRoom.id);
    openWorkspace('chats');
  }

  async function persistRoomPrefs(roomId: string, patch: Partial<RoomPrefs>) {
    if (!user) return;
    const previous = normalizePrefs(roomPrefs[roomId] || {
      muted: rooms.find((r) => r.id === roomId)?.muted,
    });
    const next = mergeRoomPrefs(previous, patch);
    const map = { ...roomPrefs, [roomId]: next };
    setRoomPrefs(map);
    saveLocalRoomPrefs(user.uid, map);
    setSideview((current) => {
      if (!current || current.kind !== 'room' || current.room.id !== roomId) return current;
      return {
        kind: 'room',
        room: {
          ...current.room,
          muted: next.muted,
          notifyDesktop: next.notifyDesktop,
          pinned: next.pinned,
        },
      };
    });
    requireSupabase();
    await upsertRoomPrefs(user.uid, roomId, {
      muted: next.muted,
      notifyDesktop: next.notifyDesktop,
      pinned: next.pinned,
    });
  }

  async function applyRoomMute(room: Room, muted: boolean) {
    if (!user || roomSettingsBusy) return;
    setRoomSettingsBusy(true);
    try {
      await persistRoomPrefs(room.id, {
        muted,
        notifyDesktop: muted ? false : true,
      });
      if (room.channel !== 'community_plus' && !room.id.startsWith('vcplus-')) {
        await patchChatMute(await user.getIdToken(), room.id, muted);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoomSettingsBusy(false);
    }
  }

  async function applyRoomNotifyDesktop(room: Room, enabled: boolean) {
    if (!user || roomSettingsBusy) return;
    setRoomSettingsBusy(true);
    try {
      if (enabled) {
        const ok = await ensureNotifyPermission();
        if (!ok) {
          setError('브라우저 알림 권한이 필요합니다. 사이트 설정에서 허용해 주세요.');
          return;
        }
      }
      await persistRoomPrefs(room.id, {
        muted: enabled ? false : (roomPrefs[room.id]?.muted ?? room.muted ?? false),
        notifyDesktop: enabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoomSettingsBusy(false);
    }
  }

  async function applyRoomPinned(room: Room, pinned: boolean) {
    if (!user || roomSettingsBusy) return;
    setRoomSettingsBusy(true);
    try {
      await persistRoomPrefs(room.id, { pinned });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoomSettingsBusy(false);
    }
  }

  function openRoomSettings(room: Room) {
    const prefs = normalizePrefs(roomPrefs[room.id] || {
      muted: room.muted,
      notifyDesktop: room.notifyDesktop,
      pinned: room.pinned,
    });
    setSideview({
      kind: 'room',
      room: {
        ...room,
        muted: prefs.muted,
        notifyDesktop: prefs.notifyDesktop,
        pinned: prefs.pinned,
      },
    });
    setRoomsOpen(false);
  }

  function openRoomMenuAt(room: Room, x: number, y: number) {
    const point = clampMenuPosition(x, y);
    const muted = roomPrefs[room.id]?.muted ?? room.muted ?? false;
    setCtxMenu({
      x: point.x,
      y: point.y,
      items: [
        { label: '채팅방 설정', action: () => openRoomSettings(room) },
        {
          label: muted ? '알림 켜기' : '알림 끄기',
          action: () => void applyRoomMute(room, !muted),
        },
        {
          label: (roomPrefs[room.id]?.pinned ?? room.pinned) ? '고정 해제' : '상단 고정',
          action: () => void applyRoomPinned(room, !(roomPrefs[room.id]?.pinned ?? room.pinned)),
        },
      ],
    });
  }

  function openRoomMenu(e: MouseEvent, room: Room) {
    e.preventDefault();
    e.stopPropagation();
    openRoomMenuAt(room, e.clientX, e.clientY);
  }

  function openMessageMenu(e: MouseEvent, m: Msg) {
    e.preventDefault();
    e.stopPropagation();
    const point = clampMenuPosition(e.clientX, e.clientY);
    const x = point.x;
    const y = point.y;
    const baseItems = [
      {
        label: '프로필 보기',
        action: () => void openProfile({
          userId: m.authorId,
          nick: m.nick,
          profileUrl: m.authorProfileUrl,
        }),
      },
    ];
    setCtxMenu({ x, y, items: [...baseItems, { label: '상태 불러오는 중…', action: () => {} }] });
    void (async () => {
      let flags: SocialFlags = {};
      try {
        if (user && m.authorId) {
          const st = await fetchFriendStatus(await user.getIdToken(), m.authorId);
          flags = {
            isFriend: st.isFriend,
            blocked: st.blocked,
            muted: st.muted ?? st.hidden,
            favorite: st.favorite,
            addible: st.addible,
          };
        }
      } catch {
        /* show conservative defaults */
      }
      setCtxMenu({
        x,
        y,
        items: [
          ...baseItems,
          ...socialActionDefs(flags).map((a) => ({
            label: a.label,
            danger: a.danger,
            action: () => void applyFriendPatch(m.authorId, a.ops),
          })),
        ],
      });
    })();
  }

  async function toggleReaction(logId: string, emoji: string) {
    if (!user || !activeId) return;
    const current = reactions[logId]?.[emoji] || [];
    const mine = current.includes(user.uid);
    requireSupabase();
    const existing = Object.entries(reactions[logId] || {})
      .filter(([, reactors]) => reactors.includes(user.uid))
      .map(([e]) => e);
    let next: string[];
    if (mine) next = existing.filter((e) => e !== emoji);
    else next = [...new Set([...existing, emoji])];
    await upsertReaction(user.uid, activeId, logId, user.uid, next);
  }

  function onMessagesScroll() {
    if (scrollingProgrammatically.current) return;
    const el = messagesRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = dist < 80;
  }

  if (!authReady) {
    return (
      <div className="login">
        <div className="login-card">
          <img className="login-logo-img" src="/branding/vantalk-logo.png" alt="Van톡" width={72} height={72} />
          <p className="login-sub">불러오는 중…</p>
        </div>
      </div>
    );
  }

  // Signed in but Kakao not linked (Google user must link)
  if (
    user
    && (linked === false || (linked === null && view === 'device' && deviceMode === 'link'))
    && isGoogleUser(user)
    && (view === 'link-kakao' || view === 'device')
  ) {
    return (
      <div className="login">
        <div className="login-card login-card-wide">
          <img className="login-logo-img" src="/branding/vantalk-logo.png" alt="Van톡" width={72} height={72} />
          <h1>카카오톡 계정 연결</h1>
          <p className="login-sub">
            Google 계정 <strong>{user.email}</strong>에<br />
            카카오톡을 연결해야 채팅을 사용할 수 있습니다.
          </p>
          {error && <div className="error-banner">{error}</div>}
          {view === 'device' ? (
            <DevicePanel
              passcode={passcode}
              remain={deviceRemain}
              busy={busy}
              onConfirm={() => void onConfirmDevice()}
              onBack={() => {
                clearDeviceChallenge();
                setPasscode(null);
                setView('link-kakao');
              }}
            />
          ) : (
            <form className="login-form" onSubmit={(e) => void onLinkKakao(e)}>
              <label>
                카카오톡 이메일
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kakao@example.com"
                />
              </label>
              <label>
                비밀번호
                <div className="password-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button type="button" className="ghost" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? '숨김' : '표시'}
                  </button>
                </div>
              </label>
              <button className="btn-kakao" type="submit" disabled={busy}>
                {busy ? '연결 중…' : '카카오톡 계정 연결'}
              </button>
            </form>
          )}
          <button className="btn-text" type="button" onClick={() => void signOut(auth)}>
            다른 계정으로
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login">
        <div className="login-card login-card-wide">
          <img className="login-logo-img" src="/branding/vantalk-logo.png" alt="Van톡" width={72} height={72} />
          <h1>Van톡</h1>
          <p className="login-slogan">카카오톡을 더 YARU하게!</p>
          <p className="login-sub">
            비공식 웹 클라이언트입니다. Google로 시작한 뒤 카카오톡을 연결하세요.
          </p>
          {error && <div className="error-banner">{error}</div>}

          {view === 'device' ? (
            <DevicePanel
              passcode={passcode}
              remain={deviceRemain}
              busy={busy}
              onConfirm={() => void onConfirmDevice()}
              onBack={() => {
                clearDeviceChallenge();
                setPasscode(null);
                setView('kakao-login');
              }}
            />
          ) : view === 'kakao-login' ? (
            <form className="login-form" onSubmit={(e) => void onKakaoLogin(e)}>
              <label>
                카카오톡 이메일
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                비밀번호
                <div className="password-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="ghost" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? '숨김' : '표시'}
                  </button>
                </div>
              </label>
              <button className="btn-kakao" type="submit" disabled={busy}>
                {busy ? '로그인 중…' : '카카오톡으로 로그인'}
              </button>
              <button className="btn-text" type="button" onClick={() => setView('choose')}>
                ← 뒤로
              </button>
            </form>
          ) : (
            <div className="login-actions">
              <button className="btn-google" type="button" disabled={busy} onClick={() => void loginGoogle()}>
                <GoogleIcon />
                Google로 계속
              </button>
              <div className="login-divider"><span>또는</span></div>
              <button
                className="btn-kakao"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setView('kakao-login');
                }}
              >
                카카오톡 계정으로 로그인
              </button>
              <p className="login-hint">
                처음이신가요? Google로 로그인한 다음 카카오톡을 연결하세요.
              </p>
              <p className="login-legal">
                계속하면{' '}
                <button type="button" className="btn-text inline" onClick={() => setLegalDoc('terms')}>
                  이용약관
                </button>
                {' '}및{' '}
                <button type="button" className="btn-text inline" onClick={() => setLegalDoc('privacy')}>
                  개인정보처리방침
                </button>
                에 동의하게 됩니다. 모든 통신·개인정보는 암호화되며 AWS 보안 영역에 보관됩니다.
              </p>
            </div>
          )}
        </div>
        {legalDoc && (legalDoc === 'privacy' || legalDoc === 'terms') && (
          <div className="legal-overlay" role="dialog" aria-modal="true">
            <button type="button" className="legal-backdrop" aria-label="닫기" onClick={() => setLegalDoc(null)} />
            <div className="legal-sheet">
              <LegalDocument kind={legalDoc} />
              <button type="button" className="primary" onClick={() => setLegalDoc(null)}>확인</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (linked === null) {
    return (
      <div className="login">
        <div className="login-card">
          <img className="login-logo-img" src="/branding/vantalk-logo.png" alt="Van톡" width={72} height={72} />
          <h1>{statusPollError || !browserOnline ? '계정 상태 확인 지연' : '계정 상태 확인 중…'}</h1>
          <p className="login-sub">
            {statusPollError || !browserOnline
              ? '서버에 연결되지 않았지만 기존 계정 연동을 해제하지 않았습니다.'
              : '카카오톡 연동과 AWS 동기화 상태를 확인하고 있습니다.'}
          </p>
          {error && <div className="error-banner">{error}</div>}
          {(statusPollError || !browserOnline) && (
            <button
              className="btn-kakao"
              type="button"
              disabled={busy || !browserOnline}
              onClick={() => void refreshSyncStatus()}
            >
              {busy ? '확인 중…' : browserOnline ? '다시 확인' : '인터넷 연결 대기 중'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="login">
        <div className="login-card">
          <h1>연결 필요</h1>
          <p className="login-sub">카카오톡 계정이 연결되지 않았습니다.</p>
          {error && <div className="error-banner">{error}</div>}
          <button className="btn-google" onClick={() => void signOut(auth)}>로그아웃 후 Google로 연결</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell perf-lite view-${workspaceView} ${roomsOpen ? 'rooms-open' : ''} ${narrowUi ? 'is-narrow' : ''}`}>
      <AmbientBackdrop />
      <aside className="rail">
        <button
          type="button"
          className="rail-brand"
          title="내 프로필"
          onClick={() => void openMyProfile()}
        >
          {myProfile.photoURL ? (
            <img src={myProfile.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            <img src="/branding/vantalk-mark.svg" alt="Van톡" />
          )}
        </button>
        <nav className="rail-nav" aria-label="주요 메뉴">
          {([
            ['chats', 'chats', '채팅'],
            ['friends', 'friends', '친구'],
            ['feed', 'feed', '피드'],
            ['notifications', 'notifications', '알림'],
          ] as const).map(([destination, icon, label]) => (
            <button
              key={destination}
              type="button"
              className={`rail-nav-item ${workspaceView === destination ? 'active' : ''}`}
              aria-label={label}
              aria-pressed={workspaceView === destination}
              title={label}
              onClick={() => openWorkspace(destination)}
            >
              <AppIcon name={icon} />
              <span>{label}</span>
              {destination === 'notifications' && unreadNotificationCount > 0 && (
                <b className="nav-badge" aria-label={`읽지 않은 알림 ${unreadNotificationCount}개`}>
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <div
            className={`rail-sync-state ${syncDisplay}`}
            role="status"
            aria-live="polite"
            title={syncReasonLabel(syncReason, browserOnline)}
          >
            <i aria-hidden />
            <span>{syncStateLabel(syncDisplay)}</span>
          </div>
          <button
            type="button"
            className="rail-nav-item"
            title="내 프로필"
            aria-label="내 프로필"
            onClick={() => void openMyProfile()}
          >
            <AppIcon name="profile" />
            <span>프로필</span>
          </button>
          <button
            type="button"
            className="rail-nav-item"
            title={syncAction === 'logout' ? '로그아웃 중' : '안전하게 로그아웃'}
            aria-label="안전하게 로그아웃"
            disabled={syncAction !== null}
            onClick={() => void logoutSafely()}
          >
            <AppIcon name="logout" />
            <span>로그아웃</span>
          </button>
          <div className="rail-legal">
            <button type="button" onClick={() => setLegalDoc('privacy')}>개인정보</button>
            <button type="button" onClick={() => setLegalDoc('terms')}>약관</button>
            <button type="button" onClick={() => setLegalDoc('version')}>{VANTALK_VERSION_LABEL}</button>
          </div>
          {backupHint && <p className="rail-backup-hint" title={backupHint}>{backupHint}</p>}
        </div>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-head">
          <button type="button" className="sidebar-me" onClick={() => void openMyProfile()}>
            {myProfile.photoURL ? (
              <img src={myProfile.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="avatar-fallback" style={{ margin: 0, background: avatarColor(myProfile.displayName || '나') }}>
                {initials(myProfile.displayName || '나')}
              </div>
            )}
            <div>
              <h1>{myProfile.displayName || 'Van톡'}</h1>
              <p>{myProfile.statusMessage || user.email || user.uid.slice(0, 8)}</p>
            </div>
          </button>
          <div
            className={`sync-status-badge ${syncDisplay}`}
            role="status"
            aria-live="polite"
            title={syncReasonLabel(syncReason, browserOnline)}
          >
            <i aria-hidden />
            <span>{syncStateLabel(syncDisplay)}</span>
          </div>
          {profileSyncing && (
            <div className="profile-sync-mini">프로필 동기화 중…</div>
          )}
        </div>
        <div className="room-list">
          {ROOM_SECTIONS.map(({ channel, label }) => {
            const list = decoratedRooms.filter((r) => (r.channel || 'talk') === channel);
            if (!list.length) return null;
            return (
              <section key={channel} className="room-section">
                <h2>{label}</h2>
                {list.map((r) => {
                  const press = createLongPressMenu((point) => openRoomMenuAt(r, point.x, point.y));
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`room-item ${r.id === activeId ? 'active' : ''} ${r.muted ? 'muted' : ''} ${r.pinned ? 'pinned' : ''}`}
                      onClick={() => {
                        setActiveId(r.id);
                        setWorkspaceView('chats');
                        setRoomsOpen(false);
                      }}
                      {...press}
                    >
                      {r.profileUrl ? (
                        <img
                          className="room-avatar"
                          src={r.profileUrl}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="avatar-fallback room-avatar" style={{ margin: 0, background: avatarColor(r.name) }}>
                          {initials(r.name)}
                        </div>
                      )}
                      <div className="room-item-copy">
                        <div className="name">
                          {r.pinned ? <span className="room-pin-mark" title="고정">📌</span> : null}
                          <span>{r.name}</span>
                          {r.muted ? <span className="room-mute-mark" title="알림 꺼짐">🔕</span> : null}
                        </div>
                        <div className="preview">{r.lastMessagePreview || '새 메시지 보내기'}</div>
                      </div>
                      <span
                        className="room-item-gear"
                        role="button"
                        tabIndex={0}
                        aria-label={`${r.name} 설정`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openRoomSettings(r);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            openRoomSettings(r);
                          }
                        }}
                      >
                        ⋯
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </aside>

      <main className="chat">
        <div className="mobile-top">
          {workspaceView === 'chats' ? (
            <button type="button" onClick={() => setRoomsOpen((v) => !v)}>
              {roomsOpen ? '닫기' : '목록'}
            </button>
          ) : (
            <span className="mobile-brand-mark" aria-hidden>V</span>
          )}
          <h1>
            {workspaceView === 'chats'
              ? activeRoom?.name || 'Van톡'
              : workspaceView === 'friends'
                ? '친구'
                : workspaceView === 'feed'
                  ? '피드'
                  : '알림'}
            {workspaceView === 'chats' && activeRoom?.muted ? (
              <span className="mobile-mute-hint" title="알림 꺼짐">🔕</span>
            ) : null}
          </h1>
          <div
            className={`sync-status-mobile ${syncDisplay}`}
            role="status"
            title={syncReasonLabel(syncReason, browserOnline)}
          >
            <i aria-hidden />
            <span>{syncDisplay === 'synced' ? '온라인' : syncStateLabel(syncDisplay)}</span>
          </div>
          {workspaceView === 'chats' && activeRoom ? (
            <button
              type="button"
              className="mobile-room-settings"
              aria-label="채팅방 설정"
              onClick={() => openRoomSettings(activeRoom)}
            >
              설정
            </button>
          ) : null}
          <button type="button" className="mobile-profile-button" onClick={() => void openMyProfile()}>
            {myProfile.photoURL ? (
              <img src={myProfile.photoURL} alt="내 프로필" referrerPolicy="no-referrer" />
            ) : (
              <AppIcon name="profile" />
            )}
          </button>
        </div>
        {roomsOpen && (
          <button
            type="button"
            className="rooms-backdrop"
            aria-label="채팅 목록 닫기"
            onClick={() => setRoomsOpen(false)}
          />
        )}
        {(syncDisplay !== 'synced' || profileSyncFailed) && workspaceView === 'chats' && (
          <div className={`sync-status-banner ${syncDisplay}`} role="status" aria-live="polite">
            <div>
              <strong>
                {profileSyncFailed && syncDisplay === 'synced'
                  ? '프로필 동기화가 중단됨'
                  : syncStateLabel(syncDisplay)}
              </strong>
              <span>
                {profileSyncFailed && syncDisplay === 'synced'
                  ? '카카오톡 프로필을 반영하지 못했습니다. 메시지 동기화는 계속됩니다.'
                  : syncReasonLabel(syncReason, browserOnline)}
              </span>
            </div>
            {linked && browserOnline && (syncDisplay === 'offline' || syncDisplay === 'logged_out') && (
              <button
                type="button"
                disabled={syncAction !== null}
                onClick={() => void resumeSync()}
              >
                {syncAction === 'resume' ? '재개 중…' : '동기화 재개'}
              </button>
            )}
            {profileSyncFailed && locoSynced && (
              <button
                type="button"
                disabled={kakaoProfileLoading}
                onClick={() => void loadKakaoProfile(true)}
              >
                {kakaoProfileLoading ? '동기화 중…' : '프로필 다시 동기화'}
              </button>
            )}
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
        {workspaceView === 'friends' ? (
          <section className="social-hub friends-hub" aria-labelledby="friends-title">
            <header className="hub-hero">
              <div>
                <span className="hub-eyebrow"><AppIcon name="sparkle" /> People</span>
                <h2 id="friends-title">함께 있는 사람들</h2>
                <p>즐겨찾기부터 숨김·차단 상태까지 카카오톡 친구를 한눈에 관리하세요.</p>
              </div>
              <button
                type="button"
                className="hub-action glass-button"
                disabled={hubFriendsLoading}
                onClick={() => void refreshHubFriends()}
              >
                <AppIcon name="refresh" />
                {hubFriendsLoading ? '동기화 중' : '새로고침'}
              </button>
            </header>

            <div className="hub-toolbar glass-panel">
              <label className="hub-search">
                <AppIcon name="search" />
                <span className="sr-only">친구 검색</span>
                <input
                  type="search"
                  value={hubSearch}
                  onChange={(event) => setHubSearch(event.target.value)}
                  placeholder="이름 또는 상태 메시지 검색"
                />
              </label>
              <div className="hub-stats" aria-label="친구 현황">
                <div><strong>{hubFriends.length}</strong><span>전체</span></div>
                <div><strong>{hubFriends.filter((friend) => !isBusinessFriend(friend)).length}</strong><span>개인</span></div>
                <div><strong>{hubFriends.filter((friend) => isBusinessFriend(friend)).length}</strong><span>비즈니스</span></div>
              </div>
            </div>

            {hubFriendsError && (
              <div className="hub-notice error" role="status">
                <strong>친구 목록을 불러오지 못했습니다.</strong>
                <span>{locoSynced ? hubFriendsError : '동기화를 재개하면 다시 확인합니다.'}</span>
              </div>
            )}
            {!hubFriendsError && hubFriends.some((friend) => friend.stale) && (
              <div className="hub-notice" role="status">
                <strong>동기화 중단됨 — 저장된 친구 목록</strong>
                <span>오프라인 캐시를 표시 중입니다. 변경 작업은 동기화 재개 후 사용할 수 있습니다.</span>
              </div>
            )}

            <div className="hub-scroll">
              {hubFriendsLoading && !hubFriends.length ? (
                <div className="hub-skeleton-grid" aria-label="친구 목록 불러오는 중">
                  {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
                </div>
              ) : filteredHubFriends.length ? (
                <>
                  {filteredHubFriends.some((friend) => friend.favorite) && (
                    <section className="friend-group">
                      <div className="hub-section-title">
                        <div><span>Favorites</span><h3>즐겨찾기</h3></div>
                        <b>{filteredHubFriends.filter((friend) => friend.favorite).length}</b>
                      </div>
                      <div className="favorite-strip">
                        {filteredHubFriends.filter((friend) => friend.favorite).map((friend) => (
                          <button
                            key={`favorite-${friend.userId}`}
                            type="button"
                            className="favorite-card glass-panel"
                            onClick={() => void openProfile({
                              userId: friend.userId,
                              directChatId: friend.directChatId,
                              nick: friend.nick,
                              profileUrl: friend.profileUrl,
                              statusMessage: friend.statusMessage,
                              isFriend: friend.isFriend ?? true,
                              blocked: friend.blocked,
                              muted: friend.muted ?? friend.hidden,
                              favorite: friend.favorite,
                            })}
                          >
                            {friend.profileUrl ? (
                              <img src={friend.profileUrl} alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="hub-avatar-fallback" style={{ background: avatarColor(friend.nick) }}>
                                {initials(friend.nick)}
                              </span>
                            )}
                            <strong>{friend.nick}</strong>
                            <span>{friend.statusMessage || '즐겨찾기 친구'}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="friend-group">
                    <div className="hub-section-title">
                      <div><span>Personal</span><h3>개인</h3></div>
                      <b>{personalHubFriends.length}</b>
                    </div>
                    <div className="friend-card-grid">
                      {personalHubFriends.map((friend) => (
                        <button
                          key={`personal-${friend.userId}`}
                          type="button"
                          className="friend-hub-card glass-panel"
                          onClick={() => void openProfile({
                            userId: friend.userId,
                            directChatId: friend.directChatId,
                            nick: friend.nick,
                            profileUrl: friend.profileUrl,
                            statusMessage: friend.statusMessage,
                            backgroundUrl: friend.backgroundUrl,
                            musicTitle: friend.musicTitle,
                            musicArtist: friend.musicArtist,
                            musicAlbumUrl: friend.musicAlbumUrl,
                            musicContentUrl: friend.musicContentUrl,
                            isFriend: friend.isFriend ?? true,
                            blocked: friend.blocked,
                            muted: friend.muted ?? friend.hidden,
                            favorite: friend.favorite,
                          })}
                        >
                          {friend.profileUrl ? (
                            <img src={friend.profileUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="hub-avatar-fallback" style={{ background: avatarColor(friend.nick) }}>
                              {initials(friend.nick)}
                            </span>
                          )}
                          <span className="friend-hub-copy">
                            <strong>{friend.nick}</strong>
                            <small>{friend.statusMessage || '상태 메시지가 없습니다.'}</small>
                            <span className="friend-tags">
                              {friend.favorite && <i>즐겨찾기</i>}
                              {(friend.muted || friend.hidden) && <i>숨김</i>}
                              {friend.blocked && <i className="danger">차단</i>}
                              {friend.stale && <i>오프라인 캐시</i>}
                            </span>
                          </span>
                          <span className="card-chevron" aria-hidden>›</span>
                        </button>
                      ))}
                      {!personalHubFriends.length && (
                        <p className="friend-group-empty">표시할 개인 친구가 없습니다.</p>
                      )}
                    </div>
                  </section>
                  <section className="friend-group">
                    <div className="hub-section-title">
                      <div><span>Business</span><h3>비즈니스</h3></div>
                      <b>{businessHubFriends.length}</b>
                    </div>
                    <div className="friend-card-grid">
                      {businessHubFriends.map((friend) => (
                        <button
                          key={`business-${friend.userId}`}
                          type="button"
                          className="friend-hub-card glass-panel"
                          onClick={() => void openProfile({
                            userId: friend.userId,
                            directChatId: friend.directChatId,
                            nick: friend.nick,
                            profileUrl: friend.profileUrl,
                            statusMessage: friend.statusMessage,
                            backgroundUrl: friend.backgroundUrl,
                            musicTitle: friend.musicTitle,
                            musicArtist: friend.musicArtist,
                            musicAlbumUrl: friend.musicAlbumUrl,
                            musicContentUrl: friend.musicContentUrl,
                            isFriend: friend.isFriend ?? true,
                            blocked: friend.blocked,
                            muted: friend.muted ?? friend.hidden,
                            favorite: friend.favorite,
                          })}
                        >
                          {friend.profileUrl ? (
                            <img src={friend.profileUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="hub-avatar-fallback" style={{ background: avatarColor(friend.nick) }}>
                              {initials(friend.nick)}
                            </span>
                          )}
                          <span className="friend-hub-copy">
                            <strong>{friend.nick}</strong>
                            <small>{friend.statusMessage || '카카오톡 채널'}</small>
                            <span className="friend-tags">
                              <i>채널</i>
                              {friend.favorite && <i>즐겨찾기</i>}
                              {(friend.muted || friend.hidden) && <i>숨김</i>}
                              {friend.blocked && <i className="danger">차단</i>}
                              {friend.stale && <i>오프라인 캐시</i>}
                            </span>
                          </span>
                          <span className="card-chevron" aria-hidden>›</span>
                        </button>
                      ))}
                      {!businessHubFriends.length && (
                        <p className="friend-group-empty">표시할 비즈니스 채널이 없습니다.</p>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <div className="hub-empty glass-panel">
                  <span><AppIcon name="friends" /></span>
                  <h3>{hubSearch ? '검색 결과가 없습니다' : '아직 표시할 친구가 없습니다'}</h3>
                  <p>{hubSearch ? '다른 이름이나 상태 메시지로 찾아보세요.' : '카카오톡 친구가 동기화되면 여기에 안전하게 표시됩니다.'}</p>
                </div>
              )}
            </div>
          </section>
        ) : workspaceView === 'feed' ? (
          <section className="social-hub feed-hub" aria-labelledby="feed-title">
            <header className="hub-hero">
              <div>
                <span className="hub-eyebrow"><AppIcon name="sparkle" /> Moments</span>
                <h2 id="feed-title">내 VanFeed</h2>
                <p>짧은 근황과 순간을 먼저 나만의 피드에 안전하게 기록하세요.</p>
              </div>
              <span className="hero-count"><strong>{feedItems.length}</strong>개의 순간</span>
            </header>

            <div className="feed-layout hub-scroll">
              <aside className="feed-profile-card glass-panel">
                {myProfile.photoURL ? (
                  <img src={myProfile.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="hub-avatar-fallback" style={{ background: avatarColor(myProfile.displayName || '나') }}>
                    {initials(myProfile.displayName || '나')}
                  </span>
                )}
                <strong>{myProfile.displayName || '나'}</strong>
                <p>{myProfile.statusMessage || '오늘의 이야기를 들려주세요.'}</p>
                <div><span>게시물</span><b>{feedItems.filter((item) => item.authorUid === user.uid).length}</b></div>
              </aside>

              <div className="feed-stream">
                <form
                  className="feed-composer glass-panel"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void publishFeedPost();
                  }}
                >
                  <div className="feed-composer-head">
                    {myProfile.photoURL ? (
                      <img src={myProfile.photoURL} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="hub-avatar-fallback" style={{ background: avatarColor(myProfile.displayName || '나') }}>
                        {initials(myProfile.displayName || '나')}
                      </span>
                    )}
                    <div><strong>새로운 순간</strong><span>나만 보기</span></div>
                  </div>
                  <label>
                    <span className="sr-only">피드 내용</span>
                    <textarea
                      value={feedDraft}
                      onChange={(event) => setFeedDraft(event.target.value.slice(0, 1000))}
                      placeholder="무슨 생각을 하고 있나요?"
                      rows={3}
                    />
                  </label>
                  <div className="feed-composer-foot">
                    <span><i /> 나만 보기 · {feedDraft.length}/1000</span>
                    <button type="submit" disabled={feedPosting || !feedDraft.trim()}>
                      <AppIcon name="compose" />
                      {feedPosting ? '게시 중…' : '게시'}
                    </button>
                  </div>
                </form>

                {feedError && (
                  <div className="hub-notice error" role="status">
                    <strong>피드를 업데이트하지 못했습니다.</strong><span>{feedError}</span>
                  </div>
                )}

                {feedLoading ? (
                  <div className="feed-skeleton glass-panel" aria-label="피드 불러오는 중"><i /><i /><i /></div>
                ) : feedItems.length ? (
                  feedItems.map((item) => (
                    <article key={item.id} className="feed-post glass-panel">
                      <header>
                        {item.authorProfileUrl ? (
                          <img src={item.authorProfileUrl} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="hub-avatar-fallback" style={{ background: avatarColor(item.authorName) }}>
                            {initials(item.authorName)}
                          </span>
                        )}
                        <div>
                          <strong>{item.authorName}</strong>
                          <span>
                            {formatRelativeTime(item.createdAt)} · {
                              item.visibility === 'public'
                                ? '전체 공개'
                                : item.visibility === 'owner'
                                  ? '나만 보기'
                                  : item.visibility === 'friends'
                                    ? '친구 공개'
                                    : '공개 범위 미지정'
                            }
                          </span>
                        </div>
                        {item.authorUid === user.uid && (
                          <button
                            type="button"
                            className="post-delete"
                            aria-label="게시물 삭제"
                            onClick={() => void deleteFeedPost(item.id)}
                          >
                            ×
                          </button>
                        )}
                      </header>
                      {item.content && <p>{item.content}</p>}
                      {item.mediaUrl && (
                        <button
                          type="button"
                          className="feed-media"
                          onClick={() => openUrlIntent(item.mediaUrl!, 'photo', '피드 사진 보기')}
                        >
                          <img src={item.mediaUrl} alt="피드 첨부 이미지" referrerPolicy="no-referrer" />
                        </button>
                      )}
                      <footer>
                        <span><AppIcon name="sparkle" /> 공감 {item.reactionCount}</span>
                        <time>{item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '방금'}</time>
                      </footer>
                    </article>
                  ))
                ) : (
                  <div className="hub-empty glass-panel">
                    <span><AppIcon name="feed" /></span>
                    <h3>피드의 첫 순간을 남겨보세요</h3>
                    <p>위 입력창에 근황을 적으면 내 피드에 안전하게 동기화됩니다.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : workspaceView === 'notifications' ? (
          <section className="social-hub notifications-hub" aria-labelledby="notifications-title">
            <header className="hub-hero">
              <div>
                <span className="hub-eyebrow"><AppIcon name="sparkle" /> Activity</span>
                <h2 id="notifications-title">알림 센터</h2>
                <p>메시지·친구·피드 활동을 놓치지 않도록 한곳에 모았습니다.</p>
              </div>
              <button
                type="button"
                className="hub-action glass-button"
                disabled={notificationBusy !== null || unreadNotificationCount === 0}
                onClick={() => void markAllNotificationsRead()}
              >
                {notificationBusy === 'all' ? '처리 중…' : '모두 읽음'}
              </button>
            </header>

            <div className="notification-summary glass-panel">
              <div className="notification-orb"><AppIcon name="notifications" /></div>
              <div><strong>{unreadNotificationCount}</strong><span>확인하지 않은 알림</span></div>
              <p>{unreadNotificationCount ? '새로운 활동이 기다리고 있어요.' : '모든 소식을 확인했습니다.'}</p>
            </div>

            {notificationsError && (
              <div className="hub-notice error" role="status">
                <strong>알림을 업데이트하지 못했습니다.</strong><span>{notificationsError}</span>
              </div>
            )}

            <div className="notification-list hub-scroll">
              {notificationsLoading ? (
                <div className="feed-skeleton glass-panel" aria-label="알림 불러오는 중"><i /><i /><i /></div>
              ) : notifications.length ? (
                notifications.map((entry) => (
                  <article key={entry.id} className={`notification-card glass-panel ${entry.read ? 'read' : 'unread'}`}>
                    <button type="button" className="notification-main" onClick={() => void openNotification(entry)}>
                      {entry.actorProfileUrl ? (
                        <img src={entry.actorProfileUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className={`notification-kind type-${entry.type}`}>
                          <AppIcon name={entry.type.includes('friend') ? 'friends' : entry.type.includes('feed') ? 'feed' : 'notifications'} />
                        </span>
                      )}
                      <span className="notification-copy">
                        <strong>{entry.title}</strong>
                        <span>{entry.body || (entry.roomId ? '관련 대화를 열어 확인하세요.' : '새로운 활동이 도착했습니다.')}</span>
                        <time>{formatRelativeTime(entry.createdAt)}</time>
                      </span>
                      {entry.roomId && <span className="card-chevron" aria-hidden>›</span>}
                    </button>
                    {!entry.read && (
                      <button
                        type="button"
                        className="notification-read"
                        disabled={notificationBusy !== null}
                        onClick={() => void markNotificationRead(entry)}
                      >
                        읽음
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="hub-empty glass-panel">
                  <span><AppIcon name="notifications" /></span>
                  <h3>새 알림이 없습니다</h3>
                  <p>친구와 피드, 채팅 활동이 생기면 이곳에 표시됩니다.</p>
                </div>
              )}
            </div>
          </section>
        ) : !activeRoom ? (
          <div className="empty">왼쪽에서 대화를 선택하세요. 브릿지가 방을 동기화하면 나타납니다.</div>
        ) : (
          <>
            <div className="chat-head">
              <span className="hash">#</span>
              <h2>
                {activeRoom.name}
                {activeRoom.muted ? <span className="room-mute-mark" title="알림 꺼짐">🔕</span> : null}
              </h2>
              <button
                type="button"
                className="chat-head-settings"
                onClick={() => openRoomSettings(activeRoom)}
              >
                설정
              </button>
            </div>
            {ringingCall && (
              <div className="call-ring-banner">
                <div>
                  <strong>{ringingCall.callPreview || '수신 전화'}</strong>
                  <span>수신 알림만 표시됩니다. 통화 수락/미디어는 아직 지원되지 않습니다.</span>
                </div>
                <button type="button" className="call-ring-dismiss" onClick={() => setRingingCall(null)}>
                  닫기
                </button>
              </div>
            )}
            <VirtualList
              className="messages"
              scrollRef={messagesRef}
              stickToBottomRef={stickToBottom}
              items={messages}
              estimateSize={narrowUi ? 84 : 96}
              overscan={narrowUi ? 6 : 10}
              onScroll={onMessagesScroll}
              onVisibleRange={onVisibleMessages}
              keyOf={(m) => m.id}
              renderItem={(m, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped =
                  !!prev &&
                  !m.feed &&
                  !prev.feed &&
                  prev.authorId === m.authorId &&
                  Math.abs((m.sendAtMs || 0) - (prev.sendAtMs || 0)) <= 7 * 60 * 1000;
                const rmap = reactions[m.id] || {};
                const messagePress = createLongPressMenu((point) => {
                  const synthetic = {
                    preventDefault() {},
                    stopPropagation() {},
                    clientX: point.x,
                    clientY: point.y,
                  } as MouseEvent;
                  openMessageMenu(synthetic, m);
                });
                if (m.feed) {
                  return (
                    <div className="feed-row">
                      <div className="feed-card">
                        <div className="feed-icon">✦</div>
                        <div className="feed-copy">
                          <span>{m.feed.title}</span>
                          <strong>{m.feed.description}</strong>
                        </div>
                        <time>{formatTime(m.sendAtMs)}</time>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    className={`msg ${grouped ? '' : 'group-start'}`}
                    {...messagePress}
                  >
                    <div>
                      {grouped ? (
                        <div className="gutter-time">{formatTime(m.sendAtMs)}</div>
                      ) : (
                        <AvatarBadge
                          name={m.nick}
                          photoUrl={m.authorProfileUrl}
                          size={40}
                          title={`${m.nick} 프로필 보기`}
                          onClick={() => {
                            if (m.nick === '나') {
                              void openMyProfile();
                              return;
                            }
                            void openProfile({
                              userId: m.authorId,
                              nick: m.nick,
                              profileUrl: m.authorProfileUrl,
                            });
                          }}
                          onContextMenu={(e) => openMessageMenu(e, m)}
                        />
                      )}
                    </div>
                    <div className="body">
                      {!grouped && (
                        <div className="meta">
                          <span className={`nick ${m.nick === '나' ? 'me' : ''}`}>{m.nick}</span>
                          <span className="time">{formatTime(m.sendAtMs)}</span>
                        </div>
                      )}
                      {m.mediaType === 'deleted' ? (
                        <div className="text deleted">삭제된 메시지</div>
                      ) : m.text && m.mediaType !== 'sticker' && m.mediaType !== 'image' && m.mediaType !== 'call' ? (
                        <div className="text">{renderText(m.text, openUrlIntent)}</div>
                      ) : null}
                      {m.mediaType === 'call' && (
                        <div className={`call-card ${(m.call?.callKind || '').toLowerCase()}`}>
                          <div className="call-card-icon" aria-hidden>
                            {m.call?.callKind === 'VIDEO' ? '📹' : m.call?.callKind === 'LIVE' ? '📡' : '📞'}
                          </div>
                          <div className="call-card-body">
                            <strong>{m.call?.callPreview || m.text || '통화'}</strong>
                            {m.call?.callId ? (
                              <span className="call-card-meta">ID {m.call.callId}</span>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {m.mediaType === 'image' && (m.mediaUrl || m.thumbUrl) && (
                        <button
                          type="button"
                          className="msg-file"
                          onClick={() => openUrlIntent(m.mediaUrl || m.thumbUrl || '', 'photo', '사진 보기')}
                        >
                          사진 보기
                        </button>
                      )}
                      {m.mediaType === 'video' && m.mediaUrl && (
                        <div className="msg-media">
                          <video src={m.mediaUrl} controls poster={m.thumbUrl} preload="none" />
                          <button
                            type="button"
                            className="msg-file"
                            onClick={() => openUrlIntent(m.mediaUrl!, 'video', '원본 동영상 열기')}
                          >
                            원본 열기
                          </button>
                        </div>
                      )}
                      {m.mediaType === 'audio' && m.mediaUrl && (
                        <div className="msg-media">
                          <audio src={m.mediaUrl} controls preload="none" />
                          <button
                            type="button"
                            className="msg-file"
                            onClick={() => openUrlIntent(m.mediaUrl!, 'file', '음성 파일 열기')}
                          >
                            원본 열기
                          </button>
                        </div>
                      )}
                      {m.mediaType === 'sticker' && (m.mediaUrl || m.thumbUrl) && (
                        <img
                          className="msg-sticker"
                          src={m.mediaUrl || m.thumbUrl}
                          alt="이모티콘"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {(m.mediaType === 'file' || m.mediaType === 'other') && m.mediaUrl && (
                        <button
                          type="button"
                          className="msg-file"
                          onClick={() => openUrlIntent(m.mediaUrl!, 'file', m.fileName || '파일 열기')}
                        >
                          📎 {m.fileName || '파일 열기'}
                        </button>
                      )}
                      {m.youtube?.videoId && (
                        <div className="yt-card">
                          <button
                            type="button"
                            className="yt-intent"
                            onClick={() =>
                              openUrlIntent(
                                m.youtube!.watchUrl || `https://www.youtube.com/watch?v=${m.youtube!.videoId}`,
                                'youtube',
                                'YouTube에서 열기',
                              )
                            }
                          >
                            <img
                              src={`https://img.youtube.com/vi/${m.youtube.videoId}/hqdefault.jpg`}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                            />
                            <div className="cap">
                              <strong>YouTube</strong>
                              <span>외부에서 열기 · {m.youtube.videoId}</span>
                            </div>
                          </button>
                        </div>
                      )}
                      <div className="reactions">
                        {Object.entries(rmap).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            type="button"
                            className={`reaction-chip ${users.includes(user.uid) ? 'mine' : ''}`}
                            title={reactionLabel(emoji)}
                            onClick={() => void toggleReaction(m.id, emoji)}
                          >
                            <span className="reaction-glyph" aria-hidden>
                              {REACT_DEFS.find((d) => d.emoji === emoji || d.id === emoji)?.emoji || ''}
                            </span>
                            <span className="reaction-label">{reactionDisplay(emoji)}</span>
                            <span className="reaction-count">{users.length}</span>
                          </button>
                        ))}
                      </div>
                      <div className="actions">
                        {REACT_DEFS.slice(0, 4).map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            title={d.label}
                            aria-label={d.label}
                            onClick={() => void toggleReaction(m.id, d.emoji)}
                          >
                            <span className="reaction-glyph" aria-hidden>{d.emoji}</span>
                            <span className="reaction-label-sm">{d.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <div className="composer">
              {typingUsers.length > 0 && (
                <div className="typing-bar" aria-live="polite">
                  <div className="typing-avatars">
                    {typingUsers.slice(0, 3).map((t) =>
                      t.profileUrl ? (
                        <img key={t.uid} src={t.profileUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div
                          key={t.uid}
                          className="typing-fallback"
                          style={{ background: avatarColor(t.nick) }}
                        >
                          {initials(t.nick)}
                        </div>
                      ),
                    )}
                  </div>
                  <span>
                    {typingUsers.length === 1
                      ? `${typingUsers[0].nick}님이 입력 중`
                      : typingUsers.length === 2
                        ? `${typingUsers[0].nick}님, ${typingUsers[1].nick}님이 입력 중`
                        : `${typingUsers[0].nick}님 외 ${typingUsers.length - 1}명이 입력 중`}
                  </span>
                  <i className="typing-dots" aria-hidden>
                    <b /><b /><b />
                  </i>
                </div>
              )}
              {emojiOpen && composerEnabled && (
                <div className="emoji-picker" role="listbox" aria-label="이모지">
                  {EMOJI_PICKER.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setDraft((d) => d + e);
                        setEmojiOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className={`composer-box ${composerEnabled ? '' : 'disabled'}`}>
                <button
                  className={`emoji-btn ${emojiOpen ? 'active' : ''}`}
                  type="button"
                  title={composerEnabled ? '이모지' : syncStateLabel(syncDisplay)}
                  disabled={!composerEnabled}
                  onClick={() => setEmojiOpen((v) => !v)}
                >
                  ☺
                </button>
                <textarea
                  rows={1}
                  disabled={!composerEnabled}
                  placeholder={
                    composerEnabled
                      ? `#${activeRoom.name}에 메시지 보내기`
                      : '동기화가 중단되어 메시지를 보낼 수 없습니다'
                  }
                  value={draft}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft(value);
                    if (value.trim()) publishTyping();
                    else void clearTyping();
                  }}
                  onBlur={() => void clearTyping()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  className="send"
                  disabled={!composerEnabled || sending || !draft.trim()}
                  onClick={() => void send()}
                >
                  {sending ? '…' : '전송'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
      <nav className="mobile-dock glass-panel" aria-label="주요 메뉴">
        {([
          ['chats', 'chats', '채팅'],
          ['friends', 'friends', '친구'],
          ['feed', 'feed', '피드'],
          ['notifications', 'notifications', '알림'],
        ] as const).map(([destination, icon, label]) => (
          <button
            key={destination}
            type="button"
            className={workspaceView === destination ? 'active' : ''}
            aria-label={label}
            aria-pressed={workspaceView === destination}
            onClick={() => openWorkspace(destination)}
          >
            <span>
              <AppIcon name={icon} />
              {destination === 'notifications' && unreadNotificationCount > 0 && (
                <b>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</b>
              )}
            </span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      {sideview && (
        <>
          <button
            type="button"
            className="profile-backdrop"
            aria-label="사이드뷰 닫기"
            onClick={() => setSideview(null)}
          />
          <aside className="profile-sideview" aria-label="사이드뷰">
            {sideview.kind !== 'friends' && sideview.kind !== 'room' && (
              <button
                type="button"
                className="profile-close"
                aria-label="닫기"
                onClick={() => setSideview(null)}
              >
                ×
              </button>
            )}
            {(sideview.kind === 'friends' || sideview.kind === 'room') && (
              <div className="profile-cover profile-cover-plain">
                <button
                  type="button"
                  className="profile-close"
                  aria-label="닫기"
                  onClick={() => setSideview(null)}
                >
                  ×
                </button>
              </div>
            )}
            {sideview.kind === 'me' && (
              <div className="profile-content profile-content-hero">
                <div
                  className="profile-hero"
                  style={
                    (kakaoProfile?.backgroundUrl || profileDraft.photoURL)
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(8,9,12,0.15) 0%, rgba(8,9,12,0.72) 58%, rgba(8,9,12,0.96) 100%), url(${
                            kakaoProfile?.backgroundUrl || profileDraft.photoURL
                          })`,
                        }
                      : undefined
                  }
                >
                  {(kakaoProfile?.statusMessage || profileDraft.statusMessage) && (
                    <p className="profile-hero-status">
                      {kakaoProfile?.statusMessage || profileDraft.statusMessage}
                    </p>
                  )}
                  {(kakaoProfile?.musicTitle || kakaoProfile?.musicArtist) && (
                    <div className="profile-music">
                      {kakaoProfile.musicAlbumUrl ? (
                        <img
                          src={kakaoProfile.musicAlbumUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="profile-music-note" aria-hidden>♪</span>
                      )}
                      <div>
                        <strong>{kakaoProfile.musicTitle || '프로필 뮤직'}</strong>
                        <small>{kakaoProfile.musicArtist || '카카오톡 뮤직'}</small>
                      </div>
                      {kakaoProfile.musicContentUrl ? (
                        <a
                          className="profile-music-open"
                          href={kakaoProfile.musicContentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          듣기
                        </a>
                      ) : (
                        <span className="profile-music-badge">MUSIC</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="profile-hero-identity">
                  {profileDraft.photoURL ? (
                    <img
                      className="profile-photo"
                      src={profileDraft.photoURL}
                      alt="내 프로필"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="profile-photo profile-photo-fallback"
                      style={{ background: avatarColor(profileDraft.displayName || '나') }}
                    >
                      {initials(profileDraft.displayName || '나')}
                    </div>
                  )}
                  <h2>{profileDraft.displayName || '내 프로필'}</h2>
                  <div className={`profile-presence ${profileSyncFailed ? 'sync-error' : ''}`}>
                    <i />
                    {profileDraft.linkKakaoProfile
                      ? `카카오톡 연동 · ${
                          profileSyncing
                            ? '동기화 중'
                            : profileSyncFailed
                              ? '동기화 실패'
                              : '동기화됨'
                        }`
                      : 'Van톡 프로필'}
                  </div>
                </div>

                <label className="profile-link-toggle">
                  <input
                    type="checkbox"
                    checked={profileDraft.linkKakaoProfile !== false}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (on && kakaoProfile) {
                        setProfileDraft((d) => ({
                          ...d,
                          linkKakaoProfile: true,
                          displayName: kakaoProfile.nick || d.displayName,
                          photoURL: kakaoProfile.profileUrl || d.photoURL,
                          statusMessage: kakaoProfile.statusMessage ?? d.statusMessage,
                        }));
                      } else {
                        setProfileDraft((d) => ({ ...d, linkKakaoProfile: on }));
                      }
                    }}
                  />
                  <span>카카오톡 프로필과 연동</span>
                </label>

                {profileDraft.linkKakaoProfile && (
                  <div className="profile-kakao-card">
                    <div className="profile-detail">
                      <span>카카오톡 닉네임</span>
                      <strong>{kakaoProfile?.nick || profileDraft.displayName || '—'}</strong>
                    </div>
                    <div className="profile-detail">
                      <span>상태 메시지</span>
                      <strong>{kakaoProfile?.statusMessage || profileDraft.statusMessage || '(없음)'}</strong>
                    </div>
                    {(kakaoProfile?.musicTitle || kakaoProfile?.musicArtist) && (
                      <div className="profile-detail">
                        <span>프로필 뮤직</span>
                        <strong>
                          {[kakaoProfile?.musicTitle, kakaoProfile?.musicArtist].filter(Boolean).join(' · ')}
                        </strong>
                      </div>
                    )}
                    <button
                      type="button"
                      className="profile-refresh"
                      disabled={kakaoProfileLoading || !locoSynced}
                      onClick={() => void (async () => {
                        const kp = await loadKakaoProfile(true);
                        if (!kp) return;
                        setProfileDraft((d) => ({
                          ...d,
                          displayName: kp.nick || d.displayName,
                          photoURL: kp.profileUrl || d.photoURL,
                          statusMessage: kp.statusMessage ?? d.statusMessage,
                          linkKakaoProfile: true,
                        }));
                      })()}
                    >
                      {kakaoProfileLoading
                        ? '불러오는 중…'
                        : !locoSynced
                          ? '동기화를 먼저 재개하세요'
                          : '카카오톡 프로필 새로고침'}
                    </button>
                  </div>
                )}

                <div className="profile-edit">
                  {!profileDraft.linkKakaoProfile && (
                    <>
                      <label>
                        프로필 사진
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => void onPhotoSelected(e.target.files?.[0] || null)}
                        />
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={photoUploading}
                        >
                          {photoUploading ? '업로드 중…' : '사진 업로드'}
                        </button>
                      </label>
                      <label>
                        사진 URL
                        <input
                          type="url"
                          placeholder="https://..."
                          value={profileDraft.photoURL}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, photoURL: e.target.value }))}
                        />
                      </label>
                      <label>
                        닉네임
                        <input
                          type="text"
                          maxLength={40}
                          value={profileDraft.displayName}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, displayName: e.target.value }))}
                        />
                      </label>
                      <label>
                        상태 메시지
                        <input
                          type="text"
                          maxLength={120}
                          placeholder="상태 메시지를 입력하세요"
                          value={profileDraft.statusMessage}
                          onChange={(e) => setProfileDraft((d) => ({ ...d, statusMessage: e.target.value }))}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Van톡 소개
                    <textarea
                      maxLength={400}
                      placeholder="나를 소개해 보세요 (Van톡 전용)"
                      value={profileDraft.bio}
                      onChange={(e) => setProfileDraft((d) => ({ ...d, bio: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="profile-actions">
                  <button type="button" disabled={profileSaving} onClick={() => void saveMyProfile()}>
                    {profileSaving ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileDraft(myProfile)}
                    disabled={profileSaving}
                  >
                    되돌리기
                  </button>
                </div>
              </div>
            )}
            {sideview.kind === 'profile' && (
              <div className="profile-content profile-content-hero">
                <div
                  className="profile-hero"
                  style={
                    (sideview.profile.backgroundUrl || sideview.profile.profileUrl)
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(8,9,12,0.12) 0%, rgba(8,9,12,0.7) 55%, rgba(8,9,12,0.96) 100%), url(${
                            sideview.profile.backgroundUrl || sideview.profile.profileUrl
                          })`,
                        }
                      : undefined
                  }
                >
                  {sideview.profile.statusMessage && (
                    <p className="profile-hero-status">{sideview.profile.statusMessage}</p>
                  )}
                  {(sideview.profile.musicTitle || sideview.profile.musicArtist) && (
                    <div className="profile-music">
                      {sideview.profile.musicAlbumUrl ? (
                        <img
                          src={sideview.profile.musicAlbumUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="profile-music-note" aria-hidden>♪</span>
                      )}
                      <div>
                        <strong>{sideview.profile.musicTitle || '프로필 뮤직'}</strong>
                        <small>{sideview.profile.musicArtist || '카카오톡 뮤직'}</small>
                      </div>
                      {sideview.profile.musicContentUrl ? (
                        <a
                          className="profile-music-open"
                          href={sideview.profile.musicContentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          듣기
                        </a>
                      ) : (
                        <span className="profile-music-badge">MUSIC</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="profile-hero-identity">
                  {sideview.profile.profileUrl ? (
                    <img
                      className="profile-photo"
                      src={sideview.profile.profileUrl}
                      alt={`${sideview.profile.nick} 프로필`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="profile-photo profile-photo-fallback"
                      style={{ background: avatarColor(sideview.profile.nick) }}
                    >
                      {initials(sideview.profile.nick)}
                    </div>
                  )}
                  <h2>{sideview.profile.nick}</h2>
                  <div className="profile-presence"><i /> KakaoTalk 사용자</div>
                </div>
                <div className="profile-detail">
                  <span>사용자 ID</span>
                  <strong>{sideview.profile.userId || '알 수 없음'}</strong>
                </div>
                <div className="profile-detail">
                  <span>현재 소셜 상태</span>
                  <strong>{socialStatusLabel(sideview.profile)}</strong>
                </div>
                <div className="profile-actions">
                  {!!sideview.profile.directChatId && !sideview.profile.blocked && (
                    <button
                      type="button"
                      disabled={friendBusy}
                      onClick={() => openDirectChat(sideview.profile.directChatId!)}
                    >
                      채팅
                    </button>
                  )}
                  {socialActionDefs(sideview.profile).map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      disabled={friendBusy || !locoSynced || !sideview.profile.userId}
                      className={a.danger ? 'danger' : undefined}
                      onClick={() => void applyFriendPatch(sideview.profile.userId, a.ops)}
                    >
                      {a.label}
                    </button>
                  ))}
                  <button type="button" disabled={friendBusy} onClick={() => void openFriendsManager()}>친구 관리</button>
                </div>
              </div>
            )}
            {sideview.kind === 'friends' && (
              <div className="profile-content">
                <h2>친구 관리</h2>
                <p className="profile-status">카카오톡 친구 기준 · Patch +/-</p>
                <div className="friend-list">
                  {sideview.friends.map((f) => (
                    <button
                      key={f.userId}
                      type="button"
                      className="friend-row"
                      onClick={() => void openProfile({
                        userId: f.userId,
                        directChatId: f.directChatId,
                        nick: f.nick,
                        profileUrl: f.profileUrl,
                        isFriend: f.isFriend,
                        blocked: f.blocked,
                        muted: f.muted,
                        favorite: f.favorite,
                      })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const flags: SocialFlags = {
                          isFriend: f.isFriend ?? true,
                          blocked: f.blocked,
                          muted: f.muted ?? f.hidden,
                          favorite: f.favorite,
                          addible: true,
                        };
                        setCtxMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            {
                              label: '프로필',
                              action: () => void openProfile({
                                userId: f.userId,
                                directChatId: f.directChatId,
                                nick: f.nick,
                                profileUrl: f.profileUrl,
                                ...flags,
                              }),
                            },
                            ...socialActionDefs(flags).map((a) => ({
                              label: a.label,
                              danger: a.danger,
                              action: () => void applyFriendPatch(f.userId, a.ops),
                            })),
                          ],
                        });
                      }}
                    >
                      {f.profileUrl ? (
                        <img src={f.profileUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="avatar-fallback" style={{ margin: 0, background: avatarColor(f.nick) }}>{initials(f.nick)}</div>
                      )}
                      <div>
                        <strong>{f.nick}</strong>
                        <span>{f.statusMessage || (f.favorite ? '즐겨찾기' : '친구')}</span>
                      </div>
                    </button>
                  ))}
                  {!sideview.friends.length && <p className="profile-status">친구가 없습니다.</p>}
                </div>
              </div>
            )}
            {sideview.kind === 'room' && (
              <div className="profile-content room-settings-panel">
                <h2>채팅방 설정</h2>
                <p className="room-settings-name">{sideview.room.name}</p>
                <div className="profile-presence"><i /> {ROOM_SECTIONS.find((s) => s.channel === (sideview.room.channel || 'talk'))?.label || '채팅'}</div>
                <div className="profile-detail">
                  <span>타입</span>
                  <strong>{sideview.room.type || 'unknown'}</strong>
                </div>
                <div className="room-settings-toggles">
                  <label className="room-toggle">
                    <span>
                      <strong>채팅 알림</strong>
                      <small>카카오/앱 푸시 알림 {sideview.room.muted ? '꺼짐' : '켜짐'}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={!sideview.room.muted}
                      disabled={roomSettingsBusy}
                      onChange={(event) => void applyRoomMute(sideview.room, !event.target.checked)}
                    />
                  </label>
                  <label className="room-toggle">
                    <span>
                      <strong>브라우저 알림</strong>
                      <small>탭이 백그라운드일 때 데스크톱 알림</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={!!sideview.room.notifyDesktop && !sideview.room.muted}
                      disabled={roomSettingsBusy || !!sideview.room.muted}
                      onChange={(event) => void applyRoomNotifyDesktop(sideview.room, event.target.checked)}
                    />
                  </label>
                  <label className="room-toggle">
                    <span>
                      <strong>상단 고정</strong>
                      <small>채팅 목록 맨 위에 고정</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={!!sideview.room.pinned}
                      disabled={roomSettingsBusy}
                      onChange={(event) => void applyRoomPinned(sideview.room, event.target.checked)}
                    />
                  </label>
                </div>
                {sideview.room.channel === 'community_plus' && (
                  <p className="profile-status">Van톡 동일 클라이언트 한정 서버입니다. 알림은 브라우저 설정만 적용됩니다.</p>
                )}
                <div className="profile-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(sideview.room.id);
                      setWorkspaceView('chats');
                      setSideview(null);
                    }}
                  >
                    대화 열기
                  </button>
                  <button type="button" className="ghost" onClick={() => setSideview(null)}>닫기</button>
                </div>
              </div>
            )}
          </aside>
        </>
      )}
      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.danger ? 'danger' : ''}
              onClick={() => {
                setCtxMenu(null);
                item.action();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {deviceReauth && (
        <div className="device-reauth-root" role="dialog" aria-modal="true" aria-label="기기 재등록">
          <div className="device-reauth-card login-card">
            <img className="login-logo-img" src="/branding/vantalk-logo.png" alt="Van톡" width={72} height={72} />
            <h1>기기 재등록</h1>
            <p className="login-sub">
              카카오톡에서 Van톡 기기 등록이 해제되었습니다.
              휴대폰에서 새 기기 인증을 허용한 뒤 계속하세요.
            </p>
            {error && <div className="error-banner">{error}</div>}
            <DevicePanel
              passcode={passcode}
              remain={deviceRemain}
              busy={busy || syncAction === 'resume'}
              onConfirm={() => void onConfirmDevice()}
              onBack={() => {
                setDeviceReauth(false);
                setError(null);
              }}
            />
          </div>
        </div>
      )}
      {urlIntent && (
        <div className="url-intent-root" role="dialog" aria-modal="true" aria-label={urlIntent.title}>
          <button type="button" className="url-intent-backdrop" aria-label="닫기" onClick={() => setUrlIntent(null)} />
          <div className="url-intent-sheet">
            <div className="url-intent-kind">{urlIntent.kind.toUpperCase()}</div>
            <h3>{urlIntent.title}</h3>
            <p className="url-intent-host">{urlIntent.subtitle || urlHostname(urlIntent.url)}</p>
            <p className="url-intent-url" title={urlIntent.url}>{urlIntent.url}</p>
            <p className="url-intent-note">Van톡 밖의 사이트로 이동합니다. 계속할까요?</p>
            <div className="url-intent-actions">
              <button type="button" className="ghost" onClick={() => setUrlIntent(null)}>취소</button>
              <button type="button" className="primary" onClick={confirmUrlIntent}>열기</button>
            </div>
          </div>
        </div>
      )}
      {snapshotPromptOpen && (
        <div className="snapshot-root" role="dialog" aria-modal="true" aria-label="채팅 스냅샷 시점">
          <div className="snapshot-card">
            <h2>채팅 스냅샷 시점</h2>
            <p>
              아직 암호화 채팅 백업이 없습니다. Google 계정으로 자동 백업이 시작되기 전까지,
              지정한 날짜 <strong>이후</strong>의 대화만 표시합니다.
            </p>
            <label>
              스냅샷 시작일
              <input
                type="date"
                value={snapshotDraft}
                onChange={(e) => setSnapshotDraft(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <p className="login-hint">
              백업이 생성되면 관리자도 열람할 수 없는 클라이언트 암호화 사본이 AWS 보안 영역에 저장됩니다.
            </p>
            <button type="button" className="primary" disabled={snapshotBusy || !snapshotDraft} onClick={() => void confirmSnapshotSince()}>
              {snapshotBusy ? '저장 중…' : '이 시점부터 표시'}
            </button>
          </div>
        </div>
      )}
      {legalDoc && (
        <div className="legal-overlay" role="dialog" aria-modal="true">
          <button type="button" className="legal-backdrop" aria-label="닫기" onClick={() => setLegalDoc(null)} />
          <div className="legal-sheet">
            {(legalDoc === 'privacy' || legalDoc === 'terms') && (
              <LegalDocument kind={legalDoc} />
            )}
            {legalDoc === 'version' && (
              <article className="legal-doc">
                <header className="legal-doc-head">
                  <h2>버전 {VANTALK_VERSION_LABEL}</h2>
                  <p>Van톡 웹 · 하이브리드 셸</p>
                  <p className="login-slogan">카카오톡을 더 YARU하게!</p>
                </header>
                <section className="legal-section">
                  <h3>이 빌드</h3>
                  <p>공개 배포물은 웹 클라이언트와 하이브리드 데스크톱 셸입니다. 완전 로컬 LOCO 통신은 v2026.7.29에서 폐지되었습니다.</p>
                  <p>
                    <a href={VANTALK_DOCS_URL} target="_blank" rel="noreferrer">문서 (GitHub Pages)</a>
                    {' · '}
                    <a href={VANTALK_GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
                  </p>
                  <button type="button" className="btn-text" onClick={() => setLegalDoc('patch')}>패치노트 보기</button>
                  {' '}
                  <button type="button" className="btn-text" onClick={() => setLegalDoc('disclaimer')}>면책 보기</button>
                </section>
              </article>
            )}
            {legalDoc === 'patch' && (
              <article className="legal-doc">
                <header className="legal-doc-head">
                  <h2>패치노트 {VANTALK_VERSION_LABEL}</h2>
                  <p>2026-07-29</p>
                </header>
                <section className="legal-section">
                  <h3>변경</h3>
                  <p>Supabase 강제, Firestore 웹 경로 제거, 스냅샷 저장 수정, 하이브리드 데스크톱, 공개 문서.</p>
                  <p><a href={`${VANTALK_DOCS_URL}patch-notes.html`} target="_blank" rel="noreferrer">전체 패치노트</a></p>
                </section>
              </article>
            )}
            {legalDoc === 'disclaimer' && (
              <article className="legal-doc">
                <header className="legal-doc-head">
                  <h2>면책</h2>
                  <p>Unofficial client</p>
                </header>
                <section className="legal-section">
                  <p>Van톡은 비공식 클라이언트이며 Kakao와 무관합니다. 공개 저장소에는 웹 UI만 포함되며 백엔드 키·AWS 접속 방법은 포함되지 않습니다.</p>
                  <p><a href={`${VANTALK_DOCS_URL}disclaimer.html`} target="_blank" rel="noreferrer">전체 면책 문서</a></p>
                </section>
              </article>
            )}
            <button type="button" className="primary" onClick={() => setLegalDoc(null)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DevicePanel({
  passcode,
  remain,
  busy,
  onConfirm,
  onBack,
}: {
  passcode: string | null;
  remain: number | null;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="device-panel">
      <p className="login-sub">휴대폰 카카오톡에서 새 기기 인증을 허용해 주세요.</p>
      {passcode ? (
        <div className="passcode-box">
          <span>인증번호</span>
          <strong>{passcode}</strong>
        </div>
      ) : (
        <div className="error-banner">
          인증번호가 아직 없습니다. 동기화 재개를 다시 시도하면 새 인증번호가 발급됩니다.
        </div>
      )}
      {remain != null && <p className="login-hint">남은 시간 약 {remain}초</p>}
      <button className="btn-kakao" type="button" disabled={busy || !passcode} onClick={onConfirm}>
        {busy ? '확인 중…' : '인증 완료 · 계속'}
      </button>
      <button className="btn-text" type="button" onClick={onBack}>나중에</button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.1 39.5 16 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l.1.1 6.2 5.2C39.2 37.3 44 32 44 24c0-1.3-.1-2.5-.4-3.5z"/>
    </svg>
  );
}

function renderText(text: string, onOpenUrl: (url: string, kind?: UrlIntentKind, title?: string) => void) {
  const chunks = splitTextWithUrls(text);
  return chunks.map((chunk, i) => {
    if (chunk.type === 'url') {
      return (
        <button
          key={i}
          type="button"
          className="msg-url-chip"
          onClick={() => onOpenUrl(chunk.value, 'link', '외부 링크 열기')}
          title={chunk.value}
        >
          {urlHostname(chunk.value)}
        </button>
      );
    }
    const parts = chunk.value.split(/(:[a-zA-Z0-9_]{1,32}:)/g);
    return parts.map((p, j) =>
      /^:[a-zA-Z0-9_]{1,32}:$/.test(p) ? (
        <span key={`${i}-${j}`} style={{ color: 'var(--brand-soft)', fontWeight: 700 }}>{p}</span>
      ) : (
        <span key={`${i}-${j}`}>{p}</span>
      ),
    );
  });
}
