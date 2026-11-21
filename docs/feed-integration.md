# Feed integration (do this when combining branches)

The feed lives entirely in `app/feed.html` and `app/src/feed/`. It doesn't touch the
tracker's files. To hook it up, make these three small edits in the tracker's files.

## 1. `app/index.html`: load the feed add-on
Add after the tracker's script tag:
```html
<script type="module" src="/src/feed/share.ts"></script>
```
This adds the Tracker | Feed tabs, hides the angle and started-by lines on the results,
and adds the description box and the "Post to feed" button.

## 2. `app/src/live/app.js`: announce the finished run
At the end of `showClip()`, after the download link is set:
```js
// Hand the finished run to the feed (src/feed/share.ts shows "Post to feed").
const a = run.angles;
window.dispatchEvent(new CustomEvent("run:finished", {
  detail: { timeMs: run.timeMs, maxAngle: a.length ? Math.round(Math.max(...a)) : null, startedBy: run.startedBy, clip: blob },
}));
```

## 3. `app/vite.config.ts`: include the feed page in production builds
In `build.rollupOptions.input`, add:
```ts
feed: path.resolve(import.meta.dirname, 'feed.html'),
```
Not needed for `npm run dev`, which serves `/feed.html` without it.
