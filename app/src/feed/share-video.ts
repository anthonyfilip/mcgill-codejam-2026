// Sharing and saving a feed post's video.
import type { Post } from './posts'

const fileName = (post: Post, type: string) =>
  `${(post.title || 'shotgun').replace(/[^\w-]+/g, '_').slice(0, 40)}.${type.includes('mp4') ? 'mp4' : 'webm'}`

// The clip as a file: posts from the shared feed are fetched from storage.
async function videoFile(post: Post): Promise<File | null> {
  let blob = post.clip
  if (!blob && post.videoUrl) blob = await (await fetch(post.videoUrl)).blob()
  return blob ? new File([blob], fileName(post, blob.type), { type: blob.type }) : null
}

// A link that opens the feed with this post first.
export const postLink = (post: Post) => `${location.origin}/feed.html?post=${encodeURIComponent(post.id)}`

// Phone share sheet with the video itself (Instagram, TikTok, Messages, and "Save Video" on
// iPhone). Browsers that can't share files get the link instead; no share sheet = copy the link.
export async function sharePost(post: Post): Promise<void> {
  const text = `${post.user} sent it in ${(post.timeMs / 1000).toFixed(2)} s${post.title ? `: ${post.title}` : ''}`
  const url = postLink(post)
  try {
    const file = await videoFile(post)
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: post.title || 'Shotgun', text })
    if (navigator.share) return await navigator.share({ title: post.title || 'Shotgun', text, url })
    await navigator.clipboard.writeText(`${text} ${url}`)
    alert('Link copied, paste it anywhere to share.')
  } catch (e) {
    if ((e as Error).name !== 'AbortError') alert(`Couldn't share: ${(e as Error).message}`) // AbortError = closed the sheet
  }
}

// Download a just-recorded clip to the device (results page "Save").
export function saveClip(clip: Blob, title: string) {
  const name = `${(title || 'shotgun').replace(/[^\w-]+/g, '_').slice(0, 40)}.${clip.type.includes('mp4') ? 'mp4' : 'webm'}`
  const url = URL.createObjectURL(clip)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
