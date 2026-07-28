export function DisclaimerPage() {
  return (
    <article className="doc">
      <h1>면책</h1>
      <p className="lede">짧게만 정리합니다.</p>

      <div className="callout">
        <p>
          Van톡은 <strong>비공식</strong> 클라이언트입니다. Kakao / 카카오와 제휴·보증 관계가
          없습니다.
        </p>
      </div>

      <ul>
        <li>계정 제한·데이터 손실·보안 사고에 대해 운영자가 법령 범위를 넘는 책임을 지지는 않습니다.</li>
        <li>카카오톡 본 서비스 약관·정책을 지켜 주세요.</li>
        <li>
          이 저장소에는 웹 UI와 하이브리드 셸만 있습니다. 백엔드 키·운영 인프라 접속 정보는
          포함되지 않습니다.
        </li>
        <li>암호화·백업 기능이 있어도 절대 보안을 보장하지는 않습니다.</li>
      </ul>

      <p>이용하면 위 내용에 동의한 것으로 봅니다.</p>

      <p className="en">
        VanTalk is an unofficial client, not affiliated with Kakao. Use at your own risk. This
        repository ships the web UI and hybrid shell only.
      </p>
    </article>
  )
}
