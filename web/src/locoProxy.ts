/** Encrypted LOCO proxy — same WRITE path as desktop TalkClient via bridge. */

const DEFAULT_API = import.meta.env.VITE_AUTH_API_URL || '';

function apiBase(): string {
  const base = DEFAULT_API.replace(/\/$/, '');
  if (!base) throw new Error('VITE_AUTH_API_URL이 설정되지 않았습니다.');
  return base;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type ProxyState = {
  sessionId: string;
  key: CryptoKey;
  expiresAt: number;
  uid: string;
};

let state: ProxyState | null = null;
let handshakeInflight: Promise<ProxyState> | null = null;

async function importAesKey(rawB64: string): Promise<CryptoKey> {
  const raw = unb64(rawB64);
  if (raw.length !== 32) throw new Error('invalid_key_len');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(key: CryptoKey, plain: object): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(plain)),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return b64(out);
}

async function open<T>(key: CryptoKey, blobB64: string): Promise<T> {
  const blob = unb64(blobB64);
  if (blob.length < 28) throw new Error('cipher_too_short');
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

async function handshake(idToken: string, uid: string): Promise<ProxyState> {
  const res = await fetch(`${apiBase()}/v1/loco/handshake`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error || 'handshake_failed'));
  const sessionId = String(body.sessionId || '');
  const keyB64 = String(body.key || '');
  const expiresAt = Number(body.expiresAt || 0);
  if (!sessionId || !keyB64) throw new Error('handshake_invalid');
  const key = await importAesKey(keyB64);
  return { sessionId, key, expiresAt, uid };
}

async function ensureSession(idToken: string, uid: string): Promise<ProxyState> {
  const now = Date.now();
  if (state && state.uid === uid && state.expiresAt - 60_000 > now) return state;
  if (handshakeInflight) return handshakeInflight;
  handshakeInflight = handshake(idToken, uid)
    .then((s) => {
      state = s;
      return s;
    })
    .finally(() => {
      handshakeInflight = null;
    });
  return handshakeInflight;
}

export function resetLocoProxy(): void {
  state = null;
}

async function command<T extends Record<string, unknown>>(
  idToken: string,
  uid: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const tryOnce = async (force: boolean): Promise<T> => {
    if (force) state = null;
    const sess = await ensureSession(idToken, uid);
    const blob = await seal(sess.key, payload);
    const res = await fetch(`${apiBase()}/v1/loco/c`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: sess.sessionId, blob }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status === 401 && body.error === 'session_expired') {
      throw new Error('session_expired');
    }
    if (!res.ok) throw new Error(String(body.error || 'loco_proxy_failed'));
    const sealed = String(body.blob || '');
    if (!sealed) throw new Error('missing_response_blob');
    return open<T>(sess.key, sealed);
  };

  try {
    return await tryOnce(false);
  } catch (e) {
    if (e instanceof Error && e.message === 'session_expired') return tryOnce(true);
    throw e;
  }
}

/** Same as desktop ChatManager.sendMessage → LOCO WRITE. */
export async function locoWrite(
  idToken: string,
  uid: string,
  chatId: string | number,
  text: string,
  extra: string = '{}',
): Promise<{ ok: boolean }> {
  // Kakao chatIds exceed Number.MAX_SAFE_INTEGER — always send as decimal string.
  const chatIdStr = typeof chatId === 'string' ? chatId.trim() : String(chatId);
  if (!/^\d{1,20}$/.test(chatIdStr)) throw new Error('invalid_chat_id');
  const result = await command<{ ok?: boolean }>(idToken, uid, {
    op: 'write',
    chatId: chatIdStr,
    text,
    extra,
  });
  if (!result.ok) throw new Error('write_failed');
  return { ok: true };
}

export async function locoMute(
  idToken: string,
  uid: string,
  chatId: string | number,
  muted: boolean,
): Promise<void> {
  const chatIdStr = typeof chatId === 'string' ? chatId.trim() : String(chatId);
  if (!/^\d{1,20}$/.test(chatIdStr)) throw new Error('invalid_chat_id');
  await command(idToken, uid, { op: 'mute', chatId: chatIdStr, muted });
}

export async function locoPing(idToken: string, uid: string): Promise<void> {
  await command(idToken, uid, { op: 'ping' });
}
