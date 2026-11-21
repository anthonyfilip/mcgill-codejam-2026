// Posts saved in this browser (IndexedDB) until Supabase is wired up.
// Swap these two functions for Supabase calls later; nothing else needs to change.
import type { Post } from './posts'

const DB = 'shotgun-feed'
const STORE = 'posts'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePost(post: Post): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(post)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadPosts(): Promise<Post[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as Post[]).sort((a, b) => b.postedAt - a.postedAt))
    req.onerror = () => reject(req.error)
  })
}
