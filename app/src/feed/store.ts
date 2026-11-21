// Where posts live. With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set (app/.env.local),
// posts and clips go to Supabase and everyone sees the same feed. Without them, posts are
// saved in this browser only (IndexedDB) so the app still works offline.
// Drafts (finished runs not yet posted) always stay in this browser.
import { createClient } from '@supabase/supabase-js'
import { addMyPost, myPosts, removeMyPost } from './me'
import { SAMPLE_POSTS, type Post } from './posts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && key ? createClient(url, key) : null
const BUCKET = 'clips'

export const isShared = supabase !== null
// Sample posts only fill the empty local feed; the shared feed shows real posts only.
export const samplePosts: Post[] = isShared ? [] : SAMPLE_POSTS
// In the shared feed, "yours" = posted from this browser. Locally, everything is yours.
export const isMine = (p: Post) => !isShared || myPosts().has(p.id)

// A finished run waiting on the results page to be posted (or not).
export type Draft = {
  id: string
  createdAt: number
  timeMs: number
  maxAngle: number | null
  startedBy: string[]
  clip: Blob | null
}

// ---------- Supabase rows ----------

type Row = {
  id: string
  user_name: string
  time_ms: number
  max_angle: number | null
  started_by: string[]
  description: string
  video_path: string | null
  cheers: number
  created_at: string
}

function fromRow(r: Row): Post {
  return {
    id: r.id,
    user: r.user_name,
    postedAt: Date.parse(r.created_at),
    timeMs: r.time_ms,
    maxAngle: r.max_angle,
    startedBy: r.started_by,
    description: r.description,
    clip: null,
    videoPath: r.video_path,
    videoUrl: r.video_path ? supabase!.storage.from(BUCKET).getPublicUrl(r.video_path).data.publicUrl : null,
    cheers: r.cheers,
  }
}

// ---------- IndexedDB (local posts + drafts) ----------

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

// ---------- Posts ----------

export async function savePost(post: Post): Promise<void> {
  if (!supabase) return write(POSTS, (s) => s.put(post))

  let videoPath: string | null = null
  if (post.clip) {
    videoPath = `${post.id}.${post.clip.type.includes('mp4') ? 'mp4' : 'webm'}`
    const up = await supabase.storage.from(BUCKET).upload(videoPath, post.clip, { contentType: post.clip.type })
    if (up.error) throw up.error
  }
  const { error } = await supabase.from('posts').insert({
    id: post.id,
    user_name: post.user,
    time_ms: Math.round(post.timeMs),
    max_angle: post.maxAngle,
    started_by: post.startedBy,
    description: post.description ?? '',
    video_path: videoPath,
  })
  if (error) throw error
  addMyPost(post.id)
}

// Everyone's posts (shared) or this browser's posts (local), newest first.
export async function loadPosts(): Promise<Post[]> {
  if (!supabase) {
    const posts = await read<Post[]>(POSTS, (s) => s.getAll())
    return posts.sort((a, b) => b.postedAt - a.postedAt)
  }
  const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data as Row[]).map(fromRow)
}

export async function deletePost(post: Post): Promise<void> {
  if (!supabase) return write(POSTS, (s) => s.delete(post.id))
  const { error } = await supabase.from('posts').delete().eq('id', post.id)
  if (error) throw error
  if (post.videoPath) await supabase.storage.from(BUCKET).remove([post.videoPath])
  removeMyPost(post.id)
}

// +1 or -1 cheer. Only stored in the shared feed.
export async function cheer(post: Post, delta: 1 | -1): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('cheer', { post_id: post.id, delta })
  if (error) throw error
}

// ---------- Drafts ----------

export const saveDraft = (draft: Draft) => write(DRAFTS, (s) => s.put(draft))
export const loadDraft = (id: string) => read<Draft | undefined>(DRAFTS, (s) => s.get(id))
export const deleteDraft = (id: string) => write(DRAFTS, (s) => s.delete(id))
