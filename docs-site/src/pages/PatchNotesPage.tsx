import { VERSION_LABEL } from '../content/meta'

export function PatchNotesPage() {
  return (
    <article className="doc">
      <h1>패치노트</h1>
      <p className="lede">
        {VERSION_LABEL} · 2026-07-29
      </p>

      <h2>변경</h2>
      <ul>
        <li>공개 배포: 웹 + 하이브리드 셸</li>
        <li>웹 데이터 경로를 Supabase로 통일 (Firestore 클라이언트 경로 제거)</li>
        <li>채팅 표시 스냅샷 저장 수정 (스토리지 게이트웨이 JWT·타임아웃)</li>
        <li>Google 연동 암호화 채팅 백업 → Supabase Storage</li>
        <li>로컬 LOCO 풀스택 데스크톱 공개 패키지 중단</li>
      </ul>

      <h2>수정</h2>
      <ul>
        <li>스냅샷 저장이 “저장 중…”에 멈추던 문제</li>
        <li>
          스냅샷 저장용 <code>snapshotBusy</code> 상태를 분리해 다이얼로그가 다른 busy
          플래그에 묶이지 않도록 함
        </li>
      </ul>
    </article>
  )
}
