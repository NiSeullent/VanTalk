import { Link } from 'react-router-dom'
import { APP_URL, VERSION_LABEL } from '../content/meta'

export function HomePage() {
  return (
    <section className="shell" aria-label="Van톡 소개">
      <aside className="rail" aria-hidden="true">
        <div className="mark">
          <img src={`${import.meta.env.BASE_URL}branding/vantalk-mark.svg`} alt="" />
        </div>
        <span className="dot on" />
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </aside>

      <div className="pane">
        <div className="brand-row">
          <img
            className="logo"
            src={`${import.meta.env.BASE_URL}branding/vantalk-logo.png`}
            alt="Van톡"
          />
          <div>
            <h1>Van톡</h1>
            <p className="slogan">카카오톡을 더 YARU하게!</p>
            <span className="pill">{VERSION_LABEL} · 비공식</span>
          </div>
        </div>

        <p className="lead">
          브라우저와 하이브리드 셸에서 쓰는 비공식 카카오톡 클라이언트입니다.
          사용법·구조·변경 사항을 여기에 모아 둡니다.
        </p>

        <img
          className="promo"
          src={`${import.meta.env.BASE_URL}branding/vantalk-promo.jpg`}
          alt="Van톡 앱 미리보기"
        />

        <div className="cards">
          <Link className="card" to="/guide">
            <strong>사용법</strong>
            <p>로그인부터 카카오 연결, 데스크톱 셸까지.</p>
          </Link>
          <Link className="card" to="/architecture">
            <strong>아키텍처</strong>
            <p>웹 클라이언트, 인증, 데이터 경로, 셸 구조.</p>
          </Link>
          <Link className="card" to="/patch-notes">
            <strong>패치노트</strong>
            <p>버전별 변경 사항.</p>
          </Link>
          <Link className="card" to="/disclaimer">
            <strong>면책</strong>
            <p>비공식 클라이언트 · Kakao와 무관.</p>
          </Link>
        </div>

        <p className="cta-line">
          바로 쓰려면{' '}
          <a href={APP_URL} target="_blank" rel="noreferrer">
            vantalk.nyase.kr
          </a>
          로 들어가세요.
        </p>
      </div>
    </section>
  )
}
