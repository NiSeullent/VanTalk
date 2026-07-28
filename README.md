# Van톡

**카카오톡을 더 YARU하게!**

비공식 카카오톡 **웹 클라이언트** · **하이브리드 데스크톱 셸**

[![Van톡 글래스 셸](docs/branding/vantalk-promo.jpg)](https://vantalk.nyase.kr/)

<p align="center">
  <img src="docs/branding/vantalk-logo.png" alt="Van톡 로고" width="160" />
</p>

<p align="center">
  <strong>Van톡</strong> · 브랜드 컬러 <code>#FEE500</code> (카카오 옐로우)
</p>

---

## 소개

**Van톡**은 카카오톡을 브라우저와 데스크톱에서 더 편하게 쓰도록 만든 비공식 클라이언트입니다.  
공식 앱을 대체하지 않으며, Kakao와 무관합니다.

핵심 한 줄:

> **카카오톡을 더 YARU하게!** — 웹에서도, 하이브리드 셸에서도 같은 Van톡 경험.

| | |
|---|---|
| 웹 앱 | [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/) |
| 문서 | [https://niseullent.github.io/VanTalk/](https://niseullent.github.io/VanTalk/) |
| 버전 | **v2026.7.29** |

---

## 브랜딩

| 항목 | 값 |
|------|-----|
| 제품명 | **Van톡** (영문 표기 VanTalk) |
| 슬로건 | 카카오톡을 더 YARU하게! |
| 메인 컬러 | 카카오 노란색 `#FEE500` |
| 포인트 텍스트 | 차콜 `#191919` |

<img src="docs/branding/vantalk-mark.svg" alt="Van톡 마크" width="96" />

에셋: [`docs/branding/`](docs/branding/)

- `vantalk-logo.png` — 앱/소개용 로고
- `vantalk-hero.jpg` — README·홍보용 히어로
- `vantalk-mark.svg` — 심플 마크
- `vantalk-icon-192.png` / `vantalk-icon-64.png` — 아이콘

---

## 무엇을 하나요

1. **Google 로그인**으로 Van톡에 진입합니다.
2. **카카오톡 계정**을 연결해 채팅·친구·알림을 웹에서 이어 씁니다.
3. 데이터·파일은 **Supabase** 경로를 사용합니다. (웹에서 Firestore 클라이언트 경로 제거)
4. 데스크톱은 호스팅된 웹 앱을 여는 **하이브리드 셸**입니다. (로컬 LOCO/Java 풀스택 배포는 중단)

이 공개 저장소에는 **웹 UI와 하이브리드 셸만** 있습니다.  
백엔드·브릿지·클라우드 자격 증명·AWS 접속 방법은 **포함하지 않습니다**.

---

## 기술 개요

```
브라우저 / Electron 셸
        │
        ▼
   Van톡 웹 (React + Vite)
        │
        ├── Firebase Auth (로그인만)
        └── Supabase (데이터 · 스토리지 · Edge 게이트)
```

| 경로 | 역할 |
|------|------|
| `web/` | React 웹 앱 (Vite) |
| `desktop/` | 호스팅 웹을 여는 Electron 하이브리드 셸 |
| `docs/` | 아키텍처 · 원칙 · 면책 · 패치 노트 · 브랜딩 |

자세한 구조는 [docs/architecture.md](docs/architecture.md), 동작 원리·연구 목적은 [docs/principles.md](docs/principles.md)를 보세요.

### 로컬에서 웹 UI만 실행

```bash
cd web
cp .env.production.example .env.production   # 셀프호스팅 시 공개 키 입력
npm install
npm run dev
```

일반 사용은 [https://vantalk.nyase.kr/](https://vantalk.nyase.kr/)를 권장합니다.

### 하이브리드 데스크톱

```bash
cd desktop
npm ci
npm start
```

호스팅된 Van톡 웹을 네이티브 창으로 엽니다.

설치 패키지(Windows `.exe` · Linux `.deb`/`.rpm` · macOS `.pkg`)는 GitHub Actions가 빌드해 [Releases](https://github.com/NiSeullent/VanTalk/releases)에 올립니다. 자세한 방법은 [`desktop/README.md`](desktop/README.md)를 보세요.

---

## 공개 범위 (보안)

이 저장소에 **기대하지 마세요**:

- AWS API Gateway 시크릿 / EC2 SSH / WireGuard
- Supabase **service role** 키
- 프로덕션 브릿지 JAR · 비공개 Java 서버 소스
- 자격 증명 금고 (`secret`, `*.pem`, 서비스 계정 JSON)

위 항목은 운영자 전용 인프라에만 둡니다.

---

## 면책

Van톡은 **비공식** 클라이언트입니다. [docs/disclaimer.md](docs/disclaimer.md)를 읽어 주세요.

---

## 라이선스

MIT — [LICENSE](LICENSE)
