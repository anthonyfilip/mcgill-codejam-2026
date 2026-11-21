// One run shared to the feed. Mirrors what the tracker shows on its results card.
export type Post = {
  id: string
  user: string
  postedAt: number // ms since epoch
  timeMs: number
  maxAngle: number | null
  startedBy: string[]
  description?: string // up to 300 characters, written when posting
  clip: Blob | null // local posts keep the video itself
  videoPath?: string | null // shared posts: file in the Supabase "clips" bucket
  videoUrl?: string | null // shared posts: public URL of that file
  cheers: number
}

// A comment on a post.
export type Comment = {
  id: string
  postId: string
  user: string
  body: string // up to 200 characters
  createdAt: number // ms since epoch
}

export const MAX_COMMENT = 200

const minutesAgo = (m: number) => Date.now() - m * 60_000

// Placeholder posts for the local (no Supabase) feed. No videos: the real test clips are
// private and must never be served from the feed.
export const SAMPLE_POSTS: Post[] = [
  { id: 's1', user: 'anthony', postedAt: minutesAgo(4), timeMs: 3870, maxAngle: 118, startedBy: ['crack', 'mouth'], clip: null, cheers: 12 },
  { id: 's2', user: 'lana', postedAt: minutesAgo(26), timeMs: 4210, maxAngle: 104, startedBy: ['crack', 'angle'], clip: null, cheers: 8 },
  { id: 's3', user: 'sam', postedAt: minutesAgo(95), timeMs: 5530, maxAngle: 97, startedBy: ['mouth', 'angle'], clip: null, cheers: 3 },
]
