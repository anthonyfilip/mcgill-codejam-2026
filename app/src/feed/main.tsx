import './install' // catches Chrome's install prompt as early as possible
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './feed.css'
import { Feed } from './Feed'
import { Leaderboard } from './Leaderboard'
import { ProfilePage } from './ProfilePage'
import { Results } from './Results'
import { installSwipeBack, installSwipeNav } from './swipeNav'

// One entry for all our pages; each .html picks its page with <body data-page="…">.
const PAGES = { feed: Feed, results: Results, leaderboard: Leaderboard, profile: ProfilePage }
const page = document.body.dataset.page as keyof typeof PAGES
const Page = PAGES[page] ?? Feed

// Swipe left/right through Feed ⇄ Record ⇄ Leaderboard ⇄ Profile (results isn't part of it).
const SWIPE_HREF = { feed: '/feed.html', leaderboard: '/leaderboard.html', profile: '/profile.html' } as const
// Not in someone's shotguns opened from their profile (?user=): it has its own Back button.
const viewingUser = new URLSearchParams(location.search).get('user')
if (page === 'feed' && viewingUser) {
  // Opened from a profile: swipe back to the profile page you came from.
  const fromProfile = document.referrer.startsWith(`${location.origin}/profile.html`)
  installSwipeBack(fromProfile ? document.referrer : `/profile.html?user=${encodeURIComponent(viewingUser)}`)
} else if (page in SWIPE_HREF) installSwipeNav(SWIPE_HREF[page as keyof typeof SWIPE_HREF])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
