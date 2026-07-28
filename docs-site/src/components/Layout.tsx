import { NavLink, Outlet } from 'react-router-dom'
import { APP_URL, GITHUB_URL, VERSION_LABEL } from '../content/meta'

const links = [
  { to: '/', label: '소개', end: true },
  { to: '/guide', label: '사용법' },
  { to: '/architecture', label: '아키텍처' },
  { to: '/patch-notes', label: '패치노트' },
  { to: '/version', label: '버전' },
  { to: '/disclaimer', label: '면책' },
] as const

export function Layout() {
  return (
    <div className="page">
      <header className="topbar">
        <nav className="topnav" aria-label="문서 메뉴">
          <NavLink to="/" className="brand-link" end>
            <img src={`${import.meta.env.BASE_URL}branding/vantalk-logo.png`} alt="" width={28} height={28} />
            <span>Van톡</span>
            <em className="ver">{VERSION_LABEL}</em>
          </NavLink>
          <div className="nav-links">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={'end' in link ? link.end : false}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-actions">
            <a className="btn ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="btn primary" href={APP_URL} target="_blank" rel="noreferrer">
              앱 열기
            </a>
          </div>
        </nav>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <span>Van톡 · 비공식 클라이언트</span>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          NiSeullent/VanTalk
        </a>
      </footer>
    </div>
  )
}
