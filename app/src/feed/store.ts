// Where posts live. With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set (app/.env.local),
// posts and clips go to Supabase and everyone sees the same feed. Without them, posts are
// saved in this browser only (IndexedDB) so the app still works offline.
// Drafts (finished runs not yet posted) always stay in this browser.
import { createClient } from '@supabase/supabase-js'
import { addMyPost, getProfile, myPosts, removeMyPost, type MyProfile } from './me'
import { SAMPLE_POSTS, type Comment, type Post, type PostRating } from './posts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && key ? createClient(url, key) : null
const BUCKET = 'clips'
const AVATARS = 'avatars'

export const isShared = supabase !== null
// Sample posts only fill the empty local feed; the shared feed shows real posts only.
export const samplePosts: Post[] = isShared ? [] : SAMPLE_POSTS
// In the shared feed, "yours" = posted from this browser. Locally, everything is yours.
export const isMine = (p: Post) =>
  !isShared || myPosts().has(p.id) || (!!p.profileId && p.profileId === getProfile()?.id)

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
  title: string
  description: string
  video_path: string | null
  cheers: number
  created_at: string
  profile_id: string | null
  profiles: { username: string; avatar_path: string | null } | null // joined from profiles
}

const publicUrl = (bucket: string, path: string | null | undefined) =>
  path ? supabase!.storage.from(bucket).getPublicUrl(path).data.publicUrl : null

function fromRow(r: Row): Post {
  return {
    id: r.id,
    // Show the poster's current name and photo (falls back to the name at posting time).
    user: r.profiles?.username ?? r.user_name,
    profileId: r.profile_id,
    avatarUrl: publicUrl(AVATARS, r.profiles?.avatar_path),
    postedAt: Date.parse(r.created_at),
    timeMs: r.time_ms,
    maxAngle: r.max_angle,
    startedBy: r.started_by,
    title: r.title,
    description: r.description,
    clip: null,
    videoPath: r.video_path,
    videoUrl: publicUrl(BUCKET, r.video_path),
    cheers: r.cheers,
  }
}

// ---------- IndexedDB (local posts + drafts) ----------

const DB = 'shotgun-feed'
const POSTS = 'posts'
const DRAFTS = 'drafts'
const COMMENTS = 'comments'
const RATINGS = 'ratings'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 4)
    req.onupgradeneeded = () => {
      for (const name of [POSTS, DRAFTS, COMMENTS, RATINGS]) {
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
    profile_id: post.profileId ?? null,
    time_ms: Math.round(post.timeMs),
    max_angle: post.maxAngle,
    started_by: post.startedBy,
    title: post.title ?? '',
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
  // "!profile_id" = join through posts.profile_id. Without it Supabase also sees posts↔profiles
  // via the comments and ratings tables and refuses ("more than one relationship was found").
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!profile_id(username, avatar_path)')
    .order('created_at', { ascending: false })
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

// ---------- Profiles ----------

// Names: lowercase letters, numbers, "_" and "." only, 3-24 long. The database checks too.
export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/
// In the local feed, the sample people's names count as taken.
const LOCAL_TAKEN = new Set(SAMPLE_POSTS.map((p) => p.user))

// Is this name used by someone other than `myId`?
export async function isUsernameTaken(username: string, myId?: string): Promise<boolean> {
  if (!supabase) return LOCAL_TAKEN.has(username)
  let q = supabase.from('profiles').select('id').eq('username', username)
  if (myId) q = q.neq('id', myId)
  const { data, error } = await q
  if (error) throw error
  return data.length > 0
}

// Create or update your profile; `photo` = a new picture to upload (already resized).
// Throws Error('taken') if someone else has the name.
export async function saveProfile(p: MyProfile, photo: Blob | null): Promise<MyProfile> {
  if (!supabase) {
    if (LOCAL_TAKEN.has(p.username)) throw new Error('taken')
    const avatarUrl = photo ? await blobToDataUrl(photo) : p.avatarUrl
    return { ...p, avatarUrl }
  }
  let avatarPath = p.avatarUrl ? p.avatarUrl.split(`/${AVATARS}/`)[1] ?? null : null
  if (photo) {
    avatarPath = `${p.id}-${Date.now()}.jpg` // new name each time so old copies aren't cached
    const up = await supabase.storage.from(AVATARS).upload(avatarPath, photo, { contentType: 'image/jpeg' })
    if (up.error) throw up.error
  }
  const { error } = await supabase.rpc('save_profile', {
    p_id: p.id,
    p_secret: p.secret,
    p_username: p.username,
    p_avatar_path: avatarPath,
  })
  if (error) throw error.code === '23505' ? new Error('taken') : error
  return { ...p, avatarUrl: publicUrl(AVATARS, avatarPath) }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

// ---------- Comments ----------

type CommentRow = {
  id: string
  post_id: string
  user_name: string
  body: string
  created_at: string
  profiles: { username: string } | null
}

// Every comment, oldest first (the feed groups them by post).
export async function loadComments(): Promise<Comment[]> {
  if (!supabase) {
    const comments = await read<Comment[]>(COMMENTS, (s) => s.getAll())
    return comments.sort((a, b) => a.createdAt - b.createdAt)
  }
  const { data, error } = await supabase.from('comments').select('*, profiles(username)').order('created_at')
  if (error) throw error
  return (data as CommentRow[]).map((r) => ({
    id: r.id,
    postId: r.post_id,
    user: r.profiles?.username ?? r.user_name,
    body: r.body,
    createdAt: Date.parse(r.created_at),
  }))
}

export async function addComment(c: Comment): Promise<void> {
  if (!supabase) return write(COMMENTS, (s) => s.put(c))
  const { error } = await supabase.from('comments').insert({
    id: c.id,
    post_id: c.postId,
    user_name: c.user,
    profile_id: getProfile()?.id ?? null,
    body: c.body,
  })
  if (error) throw error
}

// ---------- Ratings ----------

type RatingRow = { post_id: string; profile_id: string; stars: number }

export async function loadRatings(): Promise<PostRating[]> {
  if (!supabase) return read<PostRating[]>(RATINGS, (s) => s.getAll())
  const { data, error } = await supabase.from('ratings').select('post_id, profile_id, stars')
  if (error) throw error
  return (data as RatingRow[]).map((r) => ({
    id: `${r.post_id}:${r.profile_id}`,
    postId: r.post_id,
    profileId: r.profile_id,
    stars: r.stars,
  }))
}

// Rate (or re-rate) a post as you. Returns the saved rating.
export async function ratePost(postId: string, stars: number): Promise<PostRating> {
  const me = getProfile()
  if (!me) throw new Error('make your profile first (tap your name at the top)')
  const rating: PostRating = { id: `${postId}:${me.id}`, postId, profileId: me.id, stars }
  if (!supabase) {
    // One rating per person, no changes.
    if (await read<PostRating | undefined>(RATINGS, (s) => s.get(rating.id))) throw new Error('you already rated this')
    await write(RATINGS, (s) => s.add(rating))
    return rating
  }
  const { error } = await supabase.rpc('rate_post', {
    p_post_id: postId,
    p_profile_id: me.id,
    p_secret: me.secret,
    p_stars: stars,
  })
  if (error) throw error
  return rating
}

// ---------- Drafts ----------

export const saveDraft = (draft: Draft) => write(DRAFTS, (s) => s.put(draft))
export const loadDraft = (id: string) => read<Draft | undefined>(DRAFTS, (s) => s.get(id))
export const deleteDraft = (id: string) => write(DRAFTS, (s) => s.delete(id))
