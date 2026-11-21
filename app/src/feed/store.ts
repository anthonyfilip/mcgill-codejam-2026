// Posts and unposted runs (drafts) saved in this browser (IndexedDB) until Supabase is
// wired up. Swap these functions for Supabase calls later; nothing else needs to change.
import type { Post } from './posts'

// A finished run waiting on the results page to be posted (or not).
export type Draft = {
  id: string
  createdAt: number
  timeMs: number
  maxAngle: number | null
  startedBy: string[]
  clip: Blob | null
}

const DB = 'shotgun-feed'
const POSTS = 'posts'
const DRAFTS = 'drafts'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      for (const name of [POSTS, DRAFTS]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function write(store: string, fn: (s: IDBObjectStore) => void): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    fn(tx.objectStore(store))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function read<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store).objectStore(store))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export const savePost = (post: Post) => write(POSTS, (s) => s.put(post))

export async function loadPosts(): Promise<Post[]> {
  const posts = await read<Post[]>(POSTS, (s) => s.getAll())
  return posts.sort((a, b) => b.postedAt - a.postedAt)
}

export const saveDraft = (draft: Draft) => write(DRAFTS, (s) => s.put(draft))
export const loadDraft = (id: string) => read<Draft | undefined>(DRAFTS, (s) => s.get(id))
export const deleteDraft = (id: string) => write(DRAFTS, (s) => s.delete(id))
