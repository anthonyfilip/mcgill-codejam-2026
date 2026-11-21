// Round profile picture, or the first letter of the name when there's no photo.
export function Avatar({ name, url, big }: { name: string; url?: string | null; big?: boolean }) {
  const cls = big ? 'avatar big' : 'avatar'
  return url ? <img className={cls} src={url} alt="" /> : <span className={cls}>{name[0]?.toUpperCase()}</span>
}
