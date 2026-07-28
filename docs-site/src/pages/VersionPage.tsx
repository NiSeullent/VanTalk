import { APP_URL, DOCS_URL, GITHUB_URL, VERSION, VERSION_LABEL } from '../content/meta'

export function VersionPage() {
  return (
    <article className="doc">
      <h1>버전</h1>
      <p className="lede">현재 공개 채널 기준입니다.</p>

      <table>
        <tbody>
          <tr>
            <th>제품</th>
            <td>Van톡 (VanTalk)</td>
          </tr>
          <tr>
            <th>버전</th>
            <td>
              <strong>{VERSION_LABEL}</strong>
            </td>
          </tr>
          <tr>
            <th>채널</th>
            <td>웹 + 하이브리드</td>
          </tr>
          <tr>
            <th>앱</th>
            <td>
              <a href={APP_URL} target="_blank" rel="noreferrer">
                {APP_URL}
              </a>
            </td>
          </tr>
          <tr>
            <th>소스</th>
            <td>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                {GITHUB_URL}
              </a>
            </td>
          </tr>
          <tr>
            <th>문서</th>
            <td>
              <a href={DOCS_URL}>{DOCS_URL}</a>
            </td>
          </tr>
        </tbody>
      </table>

      <p className="note">
        버전 형식은 <code>YYYY.M.D</code> 입니다. 예: <code>{VERSION}</code>
      </p>
    </article>
  )
}
