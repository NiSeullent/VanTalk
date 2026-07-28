# VanTalk Desktop (hybrid)

버전 **v2026.7.29** 부터 데스크톱 설치본은 **호스팅된 웹 클라이언트**를 여는 하이브리드 셸입니다.

- 기본 URL: `https://vantalk.nyase.kr/`
- 로컬 LOCO / 완전 오프라인 Java 클라이언트 통신은 **폐지**되었습니다.

```bash
cd desktop
npm install
npm start
```

환경변수 `VANTALK_APP_URL`로 다른 오리진을 열 수 있습니다(개발용).
