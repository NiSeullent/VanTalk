import { APP_URL, RELEASES_URL } from '../content/meta'

export function GuidePage() {
  return (
    <article className="doc">
      <h1>사용법</h1>
      <p className="lede">웹에서 시작하고, 필요하면 데스크톱 셸로 이어 씁니다.</p>

      <h2>웹</h2>
      <ol>
        <li>
          <a href={APP_URL} target="_blank" rel="noreferrer">
            https://vantalk.nyase.kr/
          </a>
          에서 Google로 로그인합니다.
        </li>
        <li>카카오톡 계정을 연결하면 채팅·친구·알림을 웹에서 이어 쓸 수 있습니다.</li>
        <li>채팅·파일·백업 데이터는 Supabase 경로를 사용합니다.</li>
      </ol>

      <h2>데스크톱</h2>
      <p>
        하이브리드 셸은 호스팅된 웹 앱을 여는 데스크톱 래퍼입니다.
        Windows · Linux · macOS 패키지는{' '}
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          Releases
        </a>
        에서 받을 수 있습니다.
      </p>

      <h2>로컬에서 웹 UI 보기</h2>
      <pre>{`cd web
cp .env.production.example .env.production
npm install
npm run dev`}</pre>
      <p className="note">셀프호스팅할 때만 공개 키를 넣으면 됩니다. 일반 사용은 호스팅 앱을 쓰면 됩니다.</p>

      <h2>알아두면 좋은 점</h2>
      <ul>
        <li>Kakao 공식 앱이 아니며, 공식 앱을 대체하려는 제품이 아닙니다.</li>
        <li>이 공개 저장소에는 웹 UI와 하이브리드 셸이 있습니다.</li>
        <li>계정·데이터 관련 이슈는 면책 페이지를 함께 봐 주세요.</li>
      </ul>
    </article>
  )
}
