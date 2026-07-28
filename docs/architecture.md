# 아키텍처 — Van톡 v2026.7.29

```text
┌──────────────────────┐     HTTPS      ┌─────────────────────────┐
│  Browser / Hybrid    │ ─────────────► │  https://vantalk.nyase.kr │
│  Tauri shell         │                │  static web (S3+CF)      │
└──────────────────────┘                └────────────┬────────────┘
                                                     │
                         Firebase Auth (Google)      │
                         Supabase (data + storage)   │
                         Auth API via Edge proxy     │
                                                     ▼
                                        ┌────────────────────────┐
                                        │  Operator infra         │
                                        │  (not in this repo)     │
                                        └────────────────────────┘
```

## 웹 클라이언트

- `web/` — React + Vite SPA
- 로그인: Firebase Auth (Google) → 공개 Auth API로 카카오 계정 연결
- 채팅방·메시지·피드·알림: Supabase realtime
- 아바타·암호화 채팅 백업: Supabase Storage (Firebase JWT 게이트웨이)

## 하이브리드 데스크톱

- `desktop/` Tauri가 `https://vantalk.nyase.kr/` 를 엽니다
- 로컬 LOCO 소켓·브릿지 JAR는 공개 패키지에 없습니다

## 저장소 범위

이 저장소에는 웹 UI와 하이브리드 셸이 있습니다. 클라우드 계정·게이트웨이 시크릿·SSH 호스트 등은 포함하지 않습니다.

| 경로 | 역할 |
|------|------|
| `web/` | React 웹 앱 (Vite) |
| `desktop/` | 호스팅 웹을 여는 데스크톱 셸 |
| `docs-site/` | 문서 사이트 (Vite React → GitHub Pages) |
| `docs/` | 마크다운 원문 · 브랜딩 에셋 |
