/** Supabase Storage via storage-gate Edge Function (Firebase JWT). No Firestore. */

import type { User } from 'firebase/auth';
import { supabase, supabaseConfigured } from './supabase';

const BACKUP_SCHEMA = 1;
const PBKDF2_ITERS = 120_000;

export type ChatBackupMeta = {
  updatedAt: number;
  messageCount: number;
  schemaVersion: number;
  hasBackup: boolean;
  storage: 'supabase';
};

export type ChatVisibility = {
  snapshotSinceMs: number | null;
  backup: ChatBackupMeta | null;
};

export type BackupMessage = {
  roomId: string;
  logId?: string | number;
  text?: string;
  nick?: string;
  sendAtMs?: number;
  authorId?: number;
};

function te() {
  return new TextEncoder();
}
function td() {
  return new TextDecoder();
}

function storageGateBase(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!fromEnv) throw new Error('supabase_not_configured');
  return `${fromEnv.replace(/\/$/, '')}/functions/v1/storage-gate`;
}

async function gateFetch(idToken: string, init: RequestInit & { query?: string } = {}) {
  const url = storageGateBase() + (init.query || '');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${idToken}`);
  const apikey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (apikey) headers.set('apikey', apikey);
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      body = { error: text || 'bad_response' };
    }
    if (!res.ok) {
      throw new Error(String(body.error || body.message || `storage_gate_${res.status}`));
    }
    return body;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('storage_gate_timeout');
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

async function deriveBackupKey(user: User): Promise<CryptoKey> {
  const google = user.providerData.find((p) => p.providerId === 'google.com');
  const material = `${user.uid}:${google?.uid || user.uid}:vantalk-backup-v1`;
  const base = await crypto.subtle.importKey(
    'raw',
    te().encode(material),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: te().encode('vantalk-chat-backup'),
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealJson(key: CryptoKey, payload: unknown): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    te().encode(JSON.stringify(payload)),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

async function openJson<T>(key: CryptoKey, blob: Uint8Array): Promise<T> {
  if (blob.length < 28) throw new Error('backup_corrupt');
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(td().decode(plain)) as T;
}

export async function loadChatVisibility(user: User): Promise<ChatVisibility> {
  if (!supabaseConfigured) throw new Error('supabase_required');
  const token = await user.getIdToken();
  const body = await gateFetch(token, { method: 'GET', query: '?action=status' });
  const backupRaw = body.backup as Record<string, unknown> | null;
  const visRaw = body.visibility as Record<string, unknown> | null;
  const since = visRaw?.snapshot_since_ms;
  return {
    snapshotSinceMs: typeof since === 'number' && since > 0 ? since : null,
    backup: backupRaw && backupRaw.has_backup !== false
      ? {
          updatedAt: Number(backupRaw.updated_at_ms || 0),
          messageCount: Number(backupRaw.message_count || 0),
          schemaVersion: Number(backupRaw.schema_version || BACKUP_SCHEMA),
          hasBackup: true,
          storage: 'supabase',
        }
      : null,
  };
}

export async function saveSnapshotSince(user: User, sinceMs: number): Promise<void> {
  const token = await user.getIdToken();
  await gateFetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'visibility',
      meta: { snapshot_since_ms: sinceMs },
    }),
  });
}

/** Collect recent messages from Supabase (no Firestore). */
export async function collectMessagesForBackup(
  uid: string,
  roomIds: string[],
): Promise<BackupMessage[]> {
  if (!supabase) throw new Error('supabase_required');
  const out: BackupMessage[] = [];
  const ids = roomIds.filter(Boolean).slice(0, 60);
  for (const roomId of ids) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('log_id,text,nick,send_at_ms,author_id')
        .eq('owner_uid', uid)
        .eq('chat_id', roomId)
        .order('send_at_ms', { ascending: false })
        .limit(30);
      for (const row of data || []) {
        out.push({
          roomId,
          logId: row.log_id,
          text: typeof row.text === 'string' ? row.text : undefined,
          nick: typeof row.nick === 'string' ? row.nick : undefined,
          sendAtMs: typeof row.send_at_ms === 'number' ? row.send_at_ms : undefined,
          authorId: row.author_id != null ? Number(row.author_id) : undefined,
        });
      }
    } catch {
      /* skip room */
    }
  }
  return out;
}

export async function uploadEncryptedChatBackup(
  user: User,
  messages: BackupMessage[],
): Promise<ChatBackupMeta> {
  if (!user.providerData.some((p) => p.providerId === 'google.com')) {
    throw new Error('google_required_for_backup');
  }
  if (!supabaseConfigured) throw new Error('supabase_required');
  const key = await deriveBackupKey(user);
  const payload = {
    schemaVersion: BACKUP_SCHEMA,
    exportedAt: Date.now(),
    uid: user.uid,
    messages: messages.slice(-5_000),
  };
  const sealed = await sealJson(key, payload);
  const path = `${user.uid}/latest.bin`;
  const token = await user.getIdToken();
  await gateFetch(token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vantalk-Bucket': 'chat-backups',
      'X-Vantalk-Path': path,
    },
    body: sealed,
  });
  const meta: ChatBackupMeta = {
    updatedAt: Date.now(),
    messageCount: payload.messages.length,
    schemaVersion: BACKUP_SCHEMA,
    hasBackup: true,
    storage: 'supabase',
  };
  await gateFetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'backup_meta',
      meta: {
        updated_at_ms: meta.updatedAt,
        message_count: meta.messageCount,
        schema_version: meta.schemaVersion,
        has_backup: true,
        path,
      },
    }),
  });
  return meta;
}

export async function downloadEncryptedChatBackup(
  user: User,
): Promise<{ exportedAt: number; messages: BackupMessage[] } | null> {
  const vis = await loadChatVisibility(user);
  if (!vis.backup?.hasBackup) return null;
  const token = await user.getIdToken();
  const path = `${user.uid}/latest.bin`;
  const signed = await gateFetch(token, {
    method: 'GET',
    query: `?bucket=chat-backups&path=${encodeURIComponent(path)}`,
  });
  const url = String(signed.url || '');
  if (!url) throw new Error('backup_download_failed');
  const res = await fetch(url);
  if (!res.ok) throw new Error('backup_download_failed');
  const key = await deriveBackupKey(user);
  const buf = new Uint8Array(await res.arrayBuffer());
  return openJson<{ exportedAt: number; messages: BackupMessage[] }>(key, buf);
}

export async function uploadAvatar(user: User, file: File): Promise<string> {
  if (!supabaseConfigured) throw new Error('supabase_required');
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${user.uid}/avatar.${ext || 'jpg'}`;
  const token = await user.getIdToken();
  const body = await gateFetch(token, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      'X-Vantalk-Bucket': 'avatars',
      'X-Vantalk-Path': path,
    },
    body: file,
  });
  const url = String(body.url || '');
  if (!url) throw new Error('avatar_upload_failed');
  return url;
}

export function filterMessagesSince<T extends { sendAtMs?: number; sendAt?: number }>(
  rows: T[],
  sinceMs: number | null,
): T[] {
  if (!sinceMs || sinceMs <= 0) return rows;
  return rows.filter((row) => {
    const t = Number(row.sendAtMs || row.sendAt || 0);
    return t <= 0 || t >= sinceMs;
  });
}

export function createSendGate(maxPerMinute = 18, maxPerRoomPerMinute = 8) {
  const hits: number[] = [];
  const byRoom = new Map<string, number[]>();
  return {
    allow(roomId: string): boolean {
      const now = Date.now();
      while (hits.length && now - hits[0]! >= 60_000) hits.shift();
      if (hits.length >= maxPerMinute) return false;
      const roomHits = (byRoom.get(roomId) || []).filter((t) => now - t < 60_000);
      if (roomHits.length >= maxPerRoomPerMinute) return false;
      hits.push(now);
      roomHits.push(now);
      byRoom.set(roomId, roomHits);
      return true;
    },
  };
}
