# Van톡

**카카오톡을 더 YARU하게!**

비공식 카카오톡 **웹 클라이언트** · **하이브리드 데스크톱 셸**

[![Van톡](docs/branding/vantalk-promo.jpg)](https://vantalk.nyase.kr/)

<p align="center">
  <img src="docs/branding/vantalk-logo.png" alt="Van톡 로고" width="160" />
</p>

---

## 소개

**Van톡**은 브라우저와 데스크톱에서 카카오톡을 쓰는 비공식 클라이언트입니다.  
Kakao와 무관하며, 공식 앱을 대체하지 않습니다.

| | |
|---|---|
| 웹 앱 | [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/) |
| 문서 | [https://niseullent.github.io/VanTalk/](https://niseullent.github.io/VanTalk/) |
| 버전 | **v2026.7.29** |

---

## 사용

1. Google로 Van톡에 로그인합니다.
2. 카카오톡 계정을 연결하면 채팅·친구·알림을 웹에서 이어 쓸 수 있습니다.
3. 데이터·파일은 Supabase 경로를 사용합니다.
4. 데스크톱은 호스팅된 웹 앱을 여는 Electron 셸입니다.

이 저장소에는 **웹 UI와 하이브리드 셸**이 있습니다.

---

## 기술 개요

```
브라우저 / Electron 셸
        │
        ▼
   Van톡 웹 (React + Vite)
        │
        ├── Firebase Auth (로그인)
        └── Supabase (데이터 · 스토리지 · Edge)
```

| 경로 | 역할 |
|------|------|
| `web/` | React 웹 앱 (Vite) |
| `desktop/` | 호스팅 웹을 여는 Electron 셸 |
| `docs/` | 아키텍처 · 면책 · 패치노트 · 브랜딩 |

구조는 [docs/architecture.md](docs/architecture.md)를 보세요.

### 로컬에서 웹 UI

```bash
cd web
cp .env.production.example .env.production   # 셀프호스팅 시 공개 키 입력
npm install
npm run dev
```

일반 사용은 [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/)를 쓰면 됩니다.

### 하이브리드 데스크톱

```bash
cd desktop
npm ci
npm start
```

설치 패키지(Windows · Linux · macOS)는 [Releases](https://github.com/NiSeullent/VanTalk/releases)에 올라갑니다. 자세한 내용은 [`desktop/README.md`](desktop/README.md).

---

## 브랜딩

| 항목 | 값 |
|------|-----|
| 제품명 | **Van톡** (VanTalk) |
| 슬로건 | 카카오톡을 더 YARU하게! |
| 메인 컬러 | `#FEE500` |

에셋: [`docs/branding/`](docs/branding/)

---

## 면책

Van톡은 비공식 클라이언트입니다. [docs/disclaimer.md](docs/disclaimer.md)

---

## 라이선스

MIT — [LICENSE](LICENSE)
