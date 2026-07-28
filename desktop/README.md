# Van톡 Desktop (Tauri)

호스팅된 Van톡 웹 앱(`https://vantalk.nyase.kr/`)을 네이티브 창으로 엽니다. Electron이 아닌 **Tauri 2** 셸입니다.

## 로컬 개발

```bash
npm ci
npm run dev      # 개발 (원격 URL 로드)
npm run build    # 현재 OS 기본 번들
```

## 패키지 빌드

| 명령 | 결과 |
|------|------|
| `npm run build:linux` | `.deb` (호스트에 webkit/gtk `-dev` 필요) |
| `./build-linux-docker.sh` | Docker Ubuntu 24.04에서 `.deb` / `.rpm` |
| `./build-windows-docker.sh` | Docker + `cargo-xwin`로 Windows NSIS |
| `npm run build:windows` | 호스트에서 `cargo-xwin` NSIS |

산출물: `src-tauri/target/release/bundle/` 및 `dist-out/`

환경 변수 `TAURI_BUNDLES`로 Docker Linux 타깃을 좁힐 수 있습니다 (`deb`, `rpm`, `deb,rpm`).

## 구조

- `src-tauri/` — Rust + Tauri 설정 (`frontendDist` = 원격 URL)
- `tauri-plugin-opener` — 외부 링크를 시스템 브라우저로 열기
- CI: `.github/workflows/desktop.yml` (Windows NSIS · Linux deb/rpm · macOS app)

설치 패키지는 [Releases](https://github.com/NiSeullent/VanTalk/releases)에 게시됩니다.
