# Van톡 문서 사이트

Vite + React로 빌드되는 문서 앱입니다. 배포 URL: https://niseullent.github.io/VanTalk/

```bash
cd docs-site
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

GitHub Actions(`.github/workflows/docs.yml`)가 `main` 푸시 시 Pages로 배포합니다.
베이스 경로는 `/VanTalk/` 입니다.

마크다운 원문(README 링크용)은 저장소 루트 `docs/*.md` 에 있습니다.
