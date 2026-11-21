import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './feed.css'
import { Feed } from './Feed'
import { Leaderboard } from './Leaderboard'
import { ProfilePage } from './ProfilePage'
import { Results } from './Results'
import { installSwipeNav } from './swipeNav'

// One entry for all our pages; each .html picks its page with <body data-page="…">.
const PAGES = { feed: Feed, results: Results, leaderboard: Leaderboard, profile: ProfilePage }
const page = document.body.dataset.page as keyof typeof PAGES
const Page = PAGES[page] ?? Feed

// On the feed, swipe left to record a chug.
if (page === 'feed') installSwipeNav({ left: '/' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
