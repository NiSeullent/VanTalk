# Van톡 Desktop (hybrid)

호스팅된 Van톡 웹 앱을 네이티브 창으로 여는 Electron 셸입니다.  
완전 로컬 LOCO/Java 메시징은 포함하지 않습니다.

```bash
npm ci
npm start
```

환경 변수 `VANTALK_APP_URL`로 열 URL을 바꿀 수 있습니다. 기본값은 `https://vantalk.nyase.kr/` 입니다.

## 로컬 패키징

| 명령 | 결과 |
|------|------|
| `npm run dist:win` | Windows NSIS `.exe` |
| `npm run dist:linux` | Linux `.deb` + `.rpm` |
| `npm run dist:mac` | macOS `.pkg` (x64 · arm64) |

산출물은 `desktop/dist/` 아래에 `VanTalk-<version>-<os>-<arch>.<ext>` 형식으로 생성됩니다.

## GitHub Actions 배포

워크플로: [`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml)

- **태그** `v*` 푸시 → Windows / Linux / macOS 빌드 후 GitHub Release에 업로드
- **Actions → Desktop packages → Run workflow** → 아티팩트만 받거나, tag 입력 시 Release 게시

예:

```bash
git tag v2026.7.29
git push origin v2026.7.29
```

서명 인증서가 없는 공개 CI 빌드라 Windows SmartScreen / macOS Gatekeeper 경고가 날 수 있습니다.
