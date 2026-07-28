/** External URL open Intent — never navigate with raw <a target=_blank>. */

export type UrlIntentKind = 'link' | 'photo' | 'file' | 'video' | 'youtube' | 'other';

export type UrlIntent = {
  url: string;
  kind: UrlIntentKind;
  title: string;
  subtitle?: string;
};

const URL_RE = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;

export function normalizeExternalUrl(raw: string): string | null {
  if (!raw) return null;
  let u = raw.trim();
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  if (!/^https:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function urlHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const found = text.match(URL_RE) || [];
  const out: string[] = [];
  for (const raw of found) {
    const cleaned = raw.replace(/[),.;!?]+$/g, '');
    const n = normalizeExternalUrl(cleaned);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function splitTextWithUrls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  if (!text) return [];
  const re = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: text.slice(last, m.index) });
    }
    const cleaned = m[0].replace(/[),.;!?]+$/g, '');
    const trailing = m[0].slice(cleaned.length);
    const n = normalizeExternalUrl(cleaned);
    if (n) {
      parts.push({ type: 'url', value: n });
      if (trailing) parts.push({ type: 'text', value: trailing });
    } else {
      parts.push({ type: 'text', value: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function intentTitle(kind: UrlIntentKind, fallback?: string): string {
  switch (kind) {
    case 'photo':
      return '사진 보기';
    case 'file':
      return '파일 열기';
    case 'video':
      return '동영상 열기';
    case 'youtube':
      return 'YouTube에서 열기';
    case 'link':
      return '외부 링크 열기';
    default:
      return fallback || '외부 URL 열기';
  }
}
