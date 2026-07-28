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

빌드 결과물은 `../docs/` 로 출력됩니다 (`base: '/VanTalk/'`).  
GitHub Pages는 **main 브랜치 `/docs` 폴더**를 서빙합니다.  
문서 내용을 바꾼 뒤에는 `npm run build` 후 `docs/index.html`·`docs/assets/` 변경을 함께 커밋하세요.

마크다운 원문(README 링크용)은 `docs/*.md` 에 있습니다.
