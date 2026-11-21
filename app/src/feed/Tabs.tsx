const TABS = [
  { href: '/feed.html', icon: '🏠', label: 'Feed' },
  { href: '/', icon: '📷', label: 'Record' },
  { href: '/leaderboard.html', icon: '🏆', label: 'Leaderboard' },
  { href: '/profile.html', icon: '👤', label: 'Profile' },
]

// Instagram-style tab bar fixed to the bottom of the screen.
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
