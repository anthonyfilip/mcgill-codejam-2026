const TABS = [
  { href: '/feed.html', icon: '🏠', label: 'Feed' },
  { href: '/leaderboard.html', icon: '🏆', label: 'Leaderboard' },
  { href: '/profile.html', icon: '👤', label: 'Profile' },
]

// Instagram-style tab bar fixed to the bottom of the screen. Recording is reached from the
// feed's "Record a chug" button, a swipe left on the feed (src/feed/swipeNav.ts), or the button
// on your profile.
export function Tabs({ active }: { active?: string }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={t.href === active ? 'active' : undefined}>
          <span className="tab-icon">{t.icon}</span>
          {t.label}
        </a>
      ))}
    </nav>
  )
}
