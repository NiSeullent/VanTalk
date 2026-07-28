# Architecture — VanTalk v2026.7.29

```text
┌──────────────────────┐     HTTPS      ┌─────────────────────────┐
│  Browser / Hybrid    │ ─────────────► │  https://vantalk.nyase.kr │
│  Electron shell      │                │  static web (S3+CF)      │
└──────────────────────┘                └────────────┬────────────┘
                                                     │
                         Firebase Auth (Google)      │
                         Supabase (data + storage)   │
                         Auth API via Edge proxy     │
                                                     ▼
                                        ┌────────────────────────┐
                                        │  Private operator       │
                                        │  infra (not in repo)    │
                                        └────────────────────────┘
```

## Web client

- React + Vite SPA under `web/`
- Login: Firebase Auth (Google) then Kakao account link through the public Auth API proxy
- Rooms/messages/feed/notifications: Supabase realtime tables
- Avatars & encrypted chat backups: Supabase Storage via a Firebase-JWT storage gateway

## Hybrid desktop

- `desktop/` Electron window loads `https://vantalk.nyase.kr/`
- No embedded bridge JAR, no local LOCO socket, no offline Kakao protocol

## What is intentionally omitted

Deployment scripts that reveal cloud accounts, gateway shared secrets, SSH hosts, or WireGuard peers are **not** part of this repository.
