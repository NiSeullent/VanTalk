import { VERSION_LABEL } from '../content/meta'

export function ArchitecturePage() {
  return (
    <article className="doc">
      <h1>아키텍처</h1>
      <p className="lede">{VERSION_LABEL} 기준의 공개 저장소 범위입니다.</p>

      <pre className="diagram">{`┌──────────────────────┐     HTTPS      ┌─────────────────────────┐
│  Browser / Hybrid    │ ─────────────► │  https://vantalk.nyase.kr │
│  Tauri shell         │                │  static web (S3+CF)      │
└──────────────────────┘                └────────────┬────────────┘
                                                     │
                         Firebase Auth (Google)      │
                         Supabase (data + storage)   │
                         Auth API via Edge proxy     │
                                                     ▼
                                        ┌────────────────────────┐
                                        │  Operator infra         │
                                        │  (not in this repo)     │
                                        └────────────────────────┘`}</pre>

      <h2>웹 클라이언트</h2>
      <ul>
        <li>
          <code>web/</code> — React + Vite SPA
        </li>
        <li>로그인: Firebase Auth (Google) → 공개 Auth API로 카카오 계정 연결</li>
        <li>채팅방·메시지·피드·알림: Supabase realtime</li>
        <li>아바타·암호화 채팅 백업: Supabase Storage (Firebase JWT 게이트웨이)</li>
      </ul>

      <h2>하이브리드 데스크톱</h2>
      <ul>
        <li>
          <code>desktop/</code> 셸이 <code>https://vantalk.nyase.kr/</code> 를 엽니다
        </li>
        <li>로컬 LOCO 소켓·브릿지 JAR는 공개 패키지에 없습니다</li>
      </ul>

      <h2>저장소 범위</h2>
      <p>
        이 저장소에는 웹 UI와 하이브리드 셸이 있습니다. 클라우드 계정·게이트웨이 시크릿·SSH
        호스트 등은 포함하지 않습니다.
      </p>

      <table>
        <thead>
          <tr>
            <th>경로</th>
            <th>역할</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>web/</code>
            </td>
            <td>React 웹 앱 (Vite)</td>
          </tr>
          <tr>
            <td>
              <code>desktop/</code>
            </td>
            <td>호스팅 웹을 여는 데스크톱 셸</td>
          </tr>
          <tr>
            <td>
              <code>docs-site/</code>
            </td>
            <td>이 문서 사이트 (Vite React)</td>
          </tr>
        </tbody>
      </table>
    </article>
  )
}
