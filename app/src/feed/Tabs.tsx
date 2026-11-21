const TABS = [
  { href: '/feed.html', label: 'Chugs' },
  { href: '/leaderboard.html', label: 'Leaderboard' },
  { href: '/profile.html', label: 'Profile' },
]

// Instagram-style tab bar fixed to the bottom of the screen. Recording is reached from the
// feed's "Record a chug" button, a swipe left on the feed (src/feed/swipeNav.ts), or the button
// on your profile.
export function Tabs({ active }: { active?: string }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={t.href === active ? 'active' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}
