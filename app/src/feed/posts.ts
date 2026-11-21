// One run shared to the feed. Mirrors what the tracker shows on its results card.
export type Post = {
  id: string
  user: string
  faculty?: string | null // the poster's McGill faculty, if they picked one
  profileId?: string | null // who posted it (their current name/photo are looked up)
  avatarUrl?: string | null
  postedAt: number // ms since epoch
  timeMs: number
  maxAngle: number | null
  startedBy: string[]
  title?: string // the shotgun's name, up to 40 characters, required when posting
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
  profileId?: string | null // who wrote it (to show their rating, or "Author")
  body: string // up to 200 characters
  cheers?: number
  createdAt: number // ms since epoch
}

export const MAX_COMMENT = 200

// Words for 1–5 stars (rating pop-up, averages, and next to commenters' names).
export const RATING_LABELS = ['', 'Super poop', 'Poop', 'Good', 'Epic', 'Legendary']

// Limits the database also enforces (supabase/schema.sql).
export const MIN_RUN_MS = 1000
export const MAX_RUN_MS = 120_000
export const MAX_CLIP_BYTES = 50 * 1024 * 1024

// McGill faculties people can pick on their profile. Keep in sync with the check in
// supabase/schema.sql (profiles.faculty).
export const FACULTIES = [
  'Arts',
  'Science',
  'Arts & Science',
  'Engineering',
  'Business',
  'Music',
  'Education',
  'Law',
  'Dental Medicine',
  'Environmental Sciences',
  'Continuing Studies',
  'Health Sciences',
] as const
export const MAX_TITLE = 40

// One person's star rating of a post: 1 to 5, 5 = best.
export type PostRating = {
  id: string // `${postId}:${profileId}`: one rating per person per post
  postId: string
  profileId: string
  stars: number
}

const minutesAgo = (m: number) => Date.now() - m * 60_000

// Placeholder posts for the local (no Supabase) feed. No videos: the real test clips are
// private and must never be served from the feed.
export const SAMPLE_POSTS: Post[] = [
  { id: 's1', title: 'Tab Snapper', user: 'anthony', postedAt: minutesAgo(4), timeMs: 3870, maxAngle: 118, startedBy: ['crack', 'mouth'], clip: null, cheers: 12 },
  { id: 's2', title: 'Friday Flood', user: 'lana', postedAt: minutesAgo(26), timeMs: 4210, maxAngle: 104, startedBy: ['crack', 'angle'], clip: null, cheers: 8 },
  { id: 's3', title: 'Slow & Steady', user: 'sam', postedAt: minutesAgo(95), timeMs: 5530, maxAngle: 97, startedBy: ['mouth', 'angle'], clip: null, cheers: 3 },
]
