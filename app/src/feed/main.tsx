import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './feed.css'
import { Feed } from './Feed'
import { Leaderboard } from './Leaderboard'
import { ProfilePage } from './ProfilePage'
import { Results } from './Results'

// One entry for all our pages; each .html picks its page with <body data-page="…">.
const PAGES = { feed: Feed, results: Results, leaderboard: Leaderboard, profile: ProfilePage }
const Page = PAGES[document.body.dataset.page as keyof typeof PAGES] ?? Feed

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
