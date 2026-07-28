import { describe, expect, it } from 'vitest';
import {
  extractUrls,
  normalizeExternalUrl,
  normalizeHttpsAssetUrl,
  splitTextWithUrls,
} from './urlIntent';

describe('normalizeExternalUrl', () => {
  it('accepts https URLs', () => {
    expect(normalizeExternalUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('upgrades http to https', () => {
    expect(normalizeExternalUrl('http://example.com/x')).toBe('https://example.com/x');
  });

  it('rejects javascript and data URLs', () => {
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects credential-bearing URLs', () => {
    expect(normalizeExternalUrl('https://user:pass@example.com/')).toBeNull();
  });
});

describe('normalizeHttpsAssetUrl', () => {
  it('mirrors external URL rules for assets', () => {
    expect(normalizeHttpsAssetUrl('https://cdn.example/img.jpg')).toBe(
      'https://cdn.example/img.jpg',
    );
    expect(normalizeHttpsAssetUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('splitTextWithUrls', () => {
  it('does not treat javascript as a link', () => {
    const parts = splitTextWithUrls('click javascript:alert(1) now');
    expect(parts.every((p) => p.type !== 'url' || p.value.startsWith('https://'))).toBe(true);
  });

  it('extracts https links only', () => {
    expect(extractUrls('see https://vantalk.nyase.kr/x')).toEqual(['https://vantalk.nyase.kr/x']);
  });
});
