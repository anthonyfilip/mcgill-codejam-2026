// One run shared to the feed. Mirrors what the tracker shows on its results card.
export type Post = {
  id: string
  user: string
  postedAt: number // ms since epoch
  timeMs: number
  maxAngle: number | null
  startedBy: string[]
  clip: Blob | null
  cheers: number
}

const minutesAgo = (m: number) => Date.now() - m * 60_000

// Placeholder posts until Supabase is wired up. No videos: the real test clips are
// private and must never be served from the feed.
export const SAMPLE_POSTS: Post[] = [
  { id: 's1', user: 'anthony', postedAt: minutesAgo(4), timeMs: 3870, maxAngle: 118, startedBy: ['crack', 'mouth'], clip: null, cheers: 12 },
  { id: 's2', user: 'lana', postedAt: minutesAgo(26), timeMs: 4210, maxAngle: 104, startedBy: ['crack', 'angle'], clip: null, cheers: 8 },
  { id: 's3', user: 'sam', postedAt: minutesAgo(95), timeMs: 5530, maxAngle: 97, startedBy: ['mouth', 'angle'], clip: null, cheers: 3 },
]
