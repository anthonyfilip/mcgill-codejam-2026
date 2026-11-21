import type { ClipLabel } from '../data/labels'
import type { Detection } from '../detect/rules'

export interface ClipScore {
  clip: string
  label: ClipLabel | undefined
  det: Detection | null // null = clip not analysed yet
}

const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d))
const err = (det: number | null, truth: number | null | undefined) =>
  det === null || truth === null || truth === undefined ? null : det - truth

function summary(scores: ClipScore[]) {
  const ok = scores.filter((s) => s.det && s.label?.start_s != null)
  const startErr = ok.map((s) => err(s.det!.start, s.label!.start_s)).filter((e): e is number => e !== null)
  const endErr = ok.map((s) => err(s.det!.end, s.label!.end_s)).filter((e): e is number => e !== null)
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + Math.abs(y), 0) / a.length : null)
  const within = (a: number[], s: number) => a.filter((e) => Math.abs(e) <= s).length
  return {
    clips: ok.length,
    started: startErr.length,
    startMean: mean(startErr),
    startWithin05: within(startErr, 0.5),
    endMean: mean(endErr),
    endWithin05: within(endErr, 0.5),
    ended: endErr.length,
  }
}

function SummaryLine({ title, scores }: { title: string; scores: ClipScore[] }) {
  const s = summary(scores)
  if (!s.clips) return <p>{title}: not analysed yet.</p>
  return (
    <p>
      <strong>{title}</strong> ({s.clips} clips): start found in {s.started}/{s.clips}, off by {fmt(s.startMean, 2)} s on
      average ({s.startWithin05} within ±0.5 s) · end found in {s.ended}/{s.clips}, off by {fmt(s.endMean, 2)} s (
      {s.endWithin05} within ±0.5 s)
    </p>
  )
}

export function Scoreboard({ scores }: { scores: ClipScore[] }) {
  const single = scores.filter((s) => s.label?.people_in_frame === '1')
  const multi = scores.filter((s) => s.label?.people_in_frame !== '1')
  return (
    <section className="scoreboard">
      <SummaryLine title="Single person" scores={single} />
      <SummaryLine title="Several people / unknown" scores={multi} />
      <table>
        <thead>
          <tr>
            <th>Clip</th>
            <th>People</th>
            <th>Start: labelled → detected (error)</th>
            <th>End: labelled → detected (error)</th>
            <th>Started by</th>
            <th>Ended by</th>
            <th>Cracks ignored</th>
          </tr>
        </thead>
        <tbody>
          {scores.map(({ clip, label, det }) => {
            const es = det ? err(det.start, label?.start_s) : null
            const ee = det ? err(det.end, label?.end_s) : null
            const cls = (e: number | null) => (e === null ? 'bad' : Math.abs(e) <= 0.5 ? 'good' : Math.abs(e) <= 1.5 ? 'meh' : 'bad')
            return (
              <tr key={clip}>
                <td>{clip.replace('.mp4', '')}</td>
                <td>{label?.people_in_frame || '?'}</td>
                {det ? (
                  <>
                    <td className={cls(es)}>
                      {fmt(label?.start_s)} → {fmt(det.start)} ({es === null ? 'missed' : `${es > 0 ? '+' : ''}${es.toFixed(1)}`})
                    </td>
                    <td className={cls(ee)}>
                      {fmt(label?.end_s)} → {fmt(det.end)} ({ee === null ? 'missed' : `${ee > 0 ? '+' : ''}${ee.toFixed(1)}`})
                    </td>
                    <td>{det.startBy}</td>
                    <td>{det.endBy}</td>
                    <td>{det.ignoredCracks}</td>
                  </>
                ) : (
                  <td colSpan={5}>not analysed yet</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
