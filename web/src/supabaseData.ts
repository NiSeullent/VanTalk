/**
 * Supabase-backed realtime + mutation helpers (Firestore replacement).
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';

export { supabaseConfigured };

function client(): SupabaseClient {
  if (!supabase) throw new Error('supabase_not_configured');
  return supabase;
}

export type SyncStatusRow = {
  uid: string;
  linked?: boolean;
  session_active?: boolean;
  kakao_user_id?: number;
  status?: string;
  sync_state?: string;
  sync_reason?: string;
  heartbeat_at?: number;
  profile_sync_state?: string;
  session_generation?: string;
  error?: string | null;
};

export type RoomRow = {
  owner_uid: string;
  chat_id: string;
  name?: string;
  type?: string;
  channel?: string;
  profile_url?: string;
  muted?: boolean;
  last_message_at?: number;
  last_message_preview?: string;
};

export type MessageRow = {
  owner_uid: string;
  chat_id: string;
  log_id: string;
  author_id?: string;
  nick?: string;
  text?: string;
  send_at_ms?: number;
  media_type?: string;
  media_url?: string;
  thumb_url?: string;
  file_name?: string;
  author_profile_url?: string;
  youtube?: Record<string, unknown>;
  feed?: Record<string, unknown>;
  call?: Record<string, unknown>;
  hidden?: boolean;
  feed_type?: number;
};

export type FeedRow = {
  owner_uid: string;
  id: string;
  author_uid?: string;
  kind?: string;
  text?: string;
  media_url?: string;
  created_at?: number;
  created_at_ms?: number;
  visibility?: string;
  author_name?: string;
  author_profile_url?: string;
};

export type NotificationRow = {
  owner_uid: string;
  id: string;
  type?: string;
  title?: string;
  body?: string;
  chat_id?: string;
  actor_id?: string;
  created_at?: number;
  read?: boolean;
  read_at?: number;
  metadata?: Record<string, unknown>;
};

export type CallRow = {
  owner_uid: string;
  call_id: string;
  status?: string;
  chat_id?: string;
  call_kind?: string;
  call_action?: string;
  send_at_ms?: number;
  updated_at?: string;
  raw?: Record<string, unknown>;
};

export type RoomPrefRow = {
  owner_uid: string;
  chat_id: string;
  muted?: boolean;
  notify_desktop?: boolean;
  pinned?: boolean;
};

export type ProfileRow = {
  uid: string;
  display_name?: string;
  photo_url?: string;
  profile_url?: string;
  status_message?: string;
  bio?: string;
  link_kakao_profile?: boolean;
  client_tier?: string;
};

function channelUnsub(sb: SupabaseClient, channel: RealtimeChannel | null) {
  if (channel) void sb.removeChannel(channel);
}

export function subscribeSyncStatus(
  uid: string,
  onRow: (row: SyncStatusRow | null) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  (async () => {
    const { data } = await sb.from('sync_status').select('*').eq('uid', uid).maybeSingle();
    if (!cancelled) onRow((data as SyncStatusRow) || null);
    channel = sb
      .channel(`sync_status:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_status', filter: `uid=eq.${uid}` },
        (payload) => onRow((payload.new as SyncStatusRow) || null))
      .subscribe();
  })();

  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeProfile(
  uid: string,
  onRow: (row: ProfileRow | null) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  (async () => {
    const { data } = await sb.from('profiles').select('*').eq('uid', uid).maybeSingle();
    if (!cancelled) onRow((data as ProfileRow) || null);
    channel = sb
      .channel(`profiles:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `uid=eq.${uid}` },
        (payload) => onRow((payload.new as ProfileRow) || null))
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeRooms(
  uid: string,
  onRows: (rows: RoomRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('rooms').select('*').eq('owner_uid', uid)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (!cancelled) onRows((data as RoomRow[]) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`rooms:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeMessages(
  uid: string,
  chatId: string,
  limit: number,
  onRows: (rows: MessageRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('messages').select('*')
      .eq('owner_uid', uid).eq('chat_id', chatId)
      .order('send_at_ms', { ascending: false, nullsFirst: false }).limit(limit);
    if (!cancelled) onRows(((data as MessageRow[]) || []).slice().reverse());
  };
  (async () => {
    await reload();
    channel = sb.channel(`messages:${uid}:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `owner_uid=eq.${uid}` },
        (payload) => {
          const row = (payload.new || payload.old) as MessageRow | undefined;
          if (row?.chat_id && row.chat_id !== chatId) return;
          void reload();
        })
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeRoomPrefs(
  uid: string,
  onRows: (rows: RoomPrefRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('room_prefs').select('*').eq('owner_uid', uid);
    if (!cancelled) onRows((data as RoomPrefRow[]) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`room_prefs:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_prefs', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeFeed(
  uid: string,
  limit: number,
  onRows: (rows: FeedRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('feed_posts').select('*').eq('owner_uid', uid)
      .order('created_at', { ascending: false, nullsFirst: false }).limit(limit);
    if (!cancelled) onRows((data as FeedRow[]) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`feed:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeNotifications(
  uid: string,
  limit: number,
  onRows: (rows: NotificationRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('notifications').select('*').eq('owner_uid', uid)
      .order('created_at', { ascending: false, nullsFirst: false }).limit(limit);
    if (!cancelled) onRows((data as NotificationRow[]) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeCalls(
  uid: string,
  onRows: (rows: CallRow[]) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('calls').select('*').eq('owner_uid', uid).eq('status', 'ringing')
      .order('updated_at', { ascending: false }).limit(1);
    if (!cancelled) onRows((data as CallRow[]) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`calls:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeTyping(
  chatId: string,
  onRows: (rows: Array<{ uid: string; nick?: string; profile_url?: string; updated_at?: string }>) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('typing').select('*').eq('chat_id', chatId);
    if (!cancelled) onRows((data as Array<{ uid: string; nick?: string; profile_url?: string; updated_at?: string }>) || []);
  };
  (async () => {
    await reload();
    channel = sb.channel(`typing:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'typing', filter: `chat_id=eq.${chatId}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export function subscribeReactions(
  uid: string,
  chatId: string,
  logId: string,
  onMap: (map: Record<string, string[]>) => void,
): () => void {
  if (!supabaseConfigured) return () => {};
  const sb = client();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  const reload = async () => {
    const { data } = await sb.from('message_reactions').select('*')
      .eq('owner_uid', uid).eq('chat_id', chatId).eq('log_id', logId);
    const map: Record<string, string[]> = {};
    for (const row of (data as Array<{ reactor_uid: string; emojis?: string[] }>) || []) {
      for (const emoji of row.emojis || []) {
        map[emoji] = map[emoji] || [];
        map[emoji].push(row.reactor_uid);
      }
    }
    if (!cancelled) onMap(map);
  };
  (async () => {
    await reload();
    channel = sb.channel(`reactions:${uid}:${chatId}:${logId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `owner_uid=eq.${uid}` },
        () => void reload())
      .subscribe();
  })();
  return () => { cancelled = true; channelUnsub(sb, channel); };
}

export async function upsertRoomPrefs(uid: string, chatId: string, prefs: {
  muted?: boolean; notifyDesktop?: boolean; pinned?: boolean;
}) {
  const sb = client();
  await sb.from('room_prefs').upsert({
    owner_uid: uid,
    chat_id: chatId,
    muted: prefs.muted === true,
    notify_desktop: prefs.notifyDesktop !== false,
    pinned: prefs.pinned === true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_uid,chat_id' });
}

export async function upsertVanProfile(uid: string, profile: {
  displayName?: string; photoURL?: string; statusMessage?: string; bio?: string; linkKakaoProfile?: boolean;
}) {
  const sb = client();
  const row = {
    uid,
    display_name: profile.displayName,
    photo_url: profile.photoURL,
    profile_url: profile.photoURL,
    status_message: profile.statusMessage,
    bio: profile.bio,
    link_kakao_profile: profile.linkKakaoProfile,
    updated_at: new Date().toISOString(),
  };
  await sb.from('profiles').upsert(row, { onConflict: 'uid' });
  await sb.from('van_profiles').upsert(row, { onConflict: 'uid' });
}

export async function setTyping(chatId: string, uid: string, data: {
  nick?: string; profileUrl?: string;
} | null) {
  const sb = client();
  if (!data) {
    await sb.from('typing').delete().eq('chat_id', chatId).eq('uid', uid);
    return;
  }
  await sb.from('typing').upsert({
    chat_id: chatId,
    uid,
    author_uid: uid,
    nick: data.nick,
    profile_url: data.profileUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'chat_id,uid' });
}

export async function upsertReaction(
  ownerUid: string,
  chatId: string,
  logId: string,
  reactorUid: string,
  emojis: string[],
) {
  const sb = client();
  if (!emojis.length) {
    await sb.from('message_reactions').delete()
      .eq('owner_uid', ownerUid).eq('chat_id', chatId).eq('log_id', logId).eq('reactor_uid', reactorUid);
    return;
  }
  await sb.from('message_reactions').upsert({
    owner_uid: ownerUid,
    chat_id: chatId,
    log_id: logId,
    reactor_uid: reactorUid,
    emojis,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_uid,chat_id,log_id,reactor_uid' });
}

export async function insertCommunityMessage(roomId: string, payload: Record<string, unknown>) {
  const sb = client();
  await sb.from('community_rooms').upsert({
    room_id: roomId,
    name: 'VanCommunity+',
    channel: 'community_plus',
    same_client_only: true,
    client_id: 'vantalk',
  }, { onConflict: 'room_id' });
  await sb.from('community_messages').insert({
    room_id: roomId,
    ...payload,
  });
}

export function syncStatusToLegacy(row: SyncStatusRow | null): Record<string, unknown> {
  if (!row) return {};
  return {
    linked: row.linked,
    sessionActive: row.session_active,
    kakaoUserId: row.kakao_user_id,
    status: row.status,
    syncState: row.sync_state || row.status,
    syncReason: row.sync_reason,
    heartbeatAt: row.heartbeat_at,
    profileSyncState: row.profile_sync_state,
    sessionGeneration: row.session_generation,
    error: row.error,
  };
}
