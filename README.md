# VanTalk (Van톡) — v2026.7.29

Unofficial KakaoTalk **web client** and **hybrid desktop shell**.

- Live app: [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/)
- Docs (GitHub Pages): [https://niseullent.github.io/VanTalk/](https://niseullent.github.io/VanTalk/)
- Version: **v2026.7.29**

> This public repository contains **only the web client and hybrid shell**.  
> Backend infrastructure, bridge servers, cloud credentials, and AWS access methods are **not** included and will not be published.

## What’s inside

| Path | Role |
|------|------|
| `web/` | React web app (Vite) |
| `desktop/` | Electron hybrid shell that loads the hosted web app |
| `docs/` | Architecture, principles, disclaimer, patch notes |

## What changed in v2026.7.29

- Data/files use **Supabase** (Firestore client paths removed from the web app)
- Chat snapshot / encrypted backup via Supabase Storage gateway
- Desktop distribution is a **hybrid web shell** — full local LOCO/Java messaging is **discontinued**
- Public docs: principles, architecture, disclaimer, patch notes

## Quick start (web)

```bash
cd web
cp .env.production.example .env.production   # fill your own public keys if self-hosting UI
npm install
npm run dev
```

Production users should use [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/).

## Hybrid desktop

```bash
cd desktop
npm install
npm start
```

Opens the hosted VanTalk web app in a native window. No local Kakao LOCO stack.

## Security boundary

Do **not** expect this repo to contain:

- AWS API Gateway secrets / EC2 SSH / WireGuard configs
- Supabase **service role** keys
- Bridge JARs or private Java server source for production infra
- Credential vaults (`secret`, `*.pem`, service-account JSON)

Those belong to private operator infrastructure only.

## Disclaimer

VanTalk is an **unofficial** client. See [docs/disclaimer.md](docs/disclaimer.md).

## License

MIT — see [LICENSE](LICENSE).
