const TABS = [
  { href: '/', label: 'Record Chug' },
  { href: '/feed.html', label: 'Feed' },
  { href: '/leaderboard.html', label: 'Leaderboard' },
]

export function Tabs({ active }: { active?: string }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={t.href === active ? 'active' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}
