import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { GuidePage } from './pages/GuidePage'
import { ArchitecturePage } from './pages/ArchitecturePage'
import { PatchNotesPage } from './pages/PatchNotesPage'
import { VersionPage } from './pages/VersionPage'
import { DisclaimerPage } from './pages/DisclaimerPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="architecture" element={<ArchitecturePage />} />
        <Route path="patch-notes" element={<PatchNotesPage />} />
        <Route path="version" element={<VersionPage />} />
        <Route path="disclaimer" element={<DisclaimerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
