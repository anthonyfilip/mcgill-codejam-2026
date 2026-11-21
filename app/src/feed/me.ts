// Things about "you" kept in this browser until there are real logins:
// your profile, which posts you made, and which posts you cheered.

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // private mode etc.
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode etc. — it just won't stick.
  }
}

const idSet = (key: string) => new Set<string>(JSON.parse(get(key) ?? '[]'))
const toggleId = (key: string, id: string, on: boolean) => {
  const ids = idSet(key)
  if (on) ids.add(id)
  else ids.delete(id)
  set(key, JSON.stringify([...ids]))
}

// Your account. `secret` proves to the database that this browser owns the profile.
export type MyProfile = { id: string; secret: string; username: string; avatarUrl: string | null; faculty?: string | null }

export function getProfile(): MyProfile | null {
  try {
    return JSON.parse(get('shotgun-profile') ?? 'null')
  } catch {
    return null
  }
}
export const setProfile = (p: MyProfile) => set('shotgun-profile', JSON.stringify(p))
export const getName = () => getProfile()?.username ?? 'you'

export const myPosts = () => idSet('shotgun-my-posts')
export const addMyPost = (id: string) => toggleId('shotgun-my-posts', id, true)
export const removeMyPost = (id: string) => toggleId('shotgun-my-posts', id, false)

export const hasCheered = (id: string) => idSet('shotgun-cheered').has(id)
export const setCheered = (id: string, on: boolean) => toggleId('shotgun-cheered', id, on)

// After deleting your account: forget your profile, your posts and your cheers in this browser.
export function forgetMe() {
  for (const key of ['shotgun-profile', 'shotgun-my-posts', 'shotgun-cheered']) {
    try {
      localStorage.removeItem(key)
    } catch {
      // private mode etc.
    }
  }
}

