# VanTalk · Van톡

<p align="center">
  <img src="vantalk.svg" width="96" alt="VanTalk"/>
</p>

<p align="center">
  <strong>카카오톡을 데스크톱에서 — VanTalk</strong><br/>
  비공식 · 개인용 메신저 클라이언트
</p>

<p align="center">
  <a href="#설치"><img src="https://img.shields.io/badge/Linux-x64-FEE500?style=flat-square&labelColor=191919&logo=linux&logoColor=FEE500" alt="Linux"/></a>
  <a href="#설치"><img src="https://img.shields.io/badge/Windows-x64-FEE500?style=flat-square&labelColor=191919&logo=windows&logoColor=FEE500" alt="Windows"/></a>
  <a href="#요구사항"><img src="https://img.shields.io/badge/Java-21+-FEE500?style=flat-square&labelColor=191919&logo=openjdk&logoColor=FEE500" alt="Java 21"/></a>
  <img src="https://img.shields.io/badge/Source-Closed-6B7280?style=flat-square&labelColor=191919" alt="Closed source"/>
</p>

---

**VanTalk** (한글: **Van톡**)은 카카오톡 계정을 데스크톱에서 쓰기 위한 **바이너리 배포** 프로젝트입니다.  
이 저장소에는 **실행 파일·설치 안내만** 포함되며, **소스는 공개하지 않습니다.**

디자인 톤: **Kakao 옐로** × **Discord식 레이아웃** × **클린 다크 크롬**.

## 설치

### Linux (Ubuntu / Zorin / GNOME)

1. [Releases](https://github.com/NiSeullent/VanTalk/releases)에서 `VanTalk-linux-x64.zip` 다운로드
2. 압축 해제 후:

```bash
cd linux          # 또는 압축 해제한 폴더
chmod +x VanTalk install-shortcuts.sh
./install-shortcuts.sh
```

- Super 키 → **VanTalk** / **Van톡** 검색
- 포터블 실행: `./VanTalk`

제거:

```bash
./uninstall-shortcuts.sh          # 바로가기만
./uninstall-shortcuts.sh --purge  # ~/.local/share/VanTalk 포함
```

### Windows

1. [Releases](https://github.com/NiSeullent/VanTalk/releases)에서 `VanTalk-windows-x64.zip` 다운로드
2. 압축 해제 후 `VanTalk.bat` 실행  
   (또는 폴더에 JDK 21+ `java`가 PATH에 있어야 합니다)

## 요구사항

| 항목 | 내용 |
|------|------|
| OS | Linux x64, Windows x64 |
| Runtime | **JDK / JRE 21+** (Swing GUI용 **full** JDK 권장, headless 제외) |
| 네트워크 | 카카오톡 계정 · 기기 인증(QR 또는 이메일) |

## 로그인

1. 앱을 실행하면 **QR 로그인**이 기본으로 열립니다.
2. 휴대폰 카카오톡 → **더보기 → QR코드 스캔**
3. 인증번호가 뜨면 휴대폰에 입력하세요. (웹 VanTalk과 동일한 기기 인증 흐름)
4. 계정/비밀번호 로그인도 가능합니다.

로그인 세션은 실행 폴더의 `login_data.json`에 저장됩니다.  
로그아웃: 해당 파일을 삭제하고 앱을 다시 실행하세요.

## 기능 요약

- 개인톡 · 그룹톡 실시간 송수신
- Discord식 사이드바 · 메시지 그룹핑
- 프로필 이미지, YouTube 링크 카드
- VanTalk 전용 이모지/반응 (로컬 UI; 공식 카카오톡에는 표시되지 않을 수 있음)
- 세션 만료 시 재로그인 안내

## 주의

- **비공식** 클라이언트입니다. 카카오와 무관하며, 계정·서비스 정책 위반 사용에 대한 책임은 사용자에게 있습니다.
- 개인·학습 목적 사용을 권장합니다.
- 소스 코드는 제공되지 않습니다. 이슈·피드백은 [Issues](https://github.com/NiSeullent/VanTalk/issues)로 남겨 주세요.

## Thanks to

VanTalk은 [**ChocoTalk**](https://github.com/netricecake/chocotalk) (by [netricecake](https://github.com/netricecake))의 아이디어와 기반 작업에 큰 빚을 지고 있습니다.  
프로토콜·클라이언트 구조에 영감을 준 오픈소스 프로젝트에 감사드립니다.

또한 디자인 참고: KakaoTalk · Discord · KiwiTalk 커뮤니티의 UI 감성.

## 라이선스

소스는 비공개입니다. 배포 바이너리의 재배포·역공학·상업적 재판매는 금지합니다.  
자세한 내용은 [`LICENSE`](LICENSE)를 보세요.

---

<p align="center">VanTalk · Van톡 — made for desktop</p>
