// Your display name, kept in this browser until there are real accounts (Supabase).
const KEY = 'shotgun-name'

export function getName(): string {
  try {
    return localStorage.getItem(KEY) || 'you'
  } catch {
    return 'you'
  }
}

export function setName(name: string) {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    // Private mode etc. — the name just won't stick.
  }
}
