// Things about "you" kept in this browser until there are real accounts:
// your display name, which posts you made, and which posts you cheered.

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

export const getName = () => get('shotgun-name') || 'you'
export const setName = (name: string) => set('shotgun-name', name)

export const myPosts = () => idSet('shotgun-my-posts')
export const addMyPost = (id: string) => toggleId('shotgun-my-posts', id, true)
export const removeMyPost = (id: string) => toggleId('shotgun-my-posts', id, false)

export const hasCheered = (id: string) => idSet('shotgun-cheered').has(id)
export const setCheered = (id: string, on: boolean) => toggleId('shotgun-cheered', id, on)
