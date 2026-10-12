# Super Astro Brothers

A Mario-style browser game for a trading platform: stomp the "Challenge Phase" aliens, grab the
**Get funded** mushroom, and reach the flag to **keep 90% profits**. Plain HTML + Canvas, no build step.

## Run locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
(Opening `index.html` directly also works.)

## Deploy
**GitHub Pages**
1. Create a repo, push this folder to `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**. The included workflow deploys on every push.
3. Your game goes live at `https://<user>.github.io/<repo>/`.

**Netlify / Vercel / Cloudflare Pages:** import the repo (or drag the folder in). No build command, publish directory `.`.

## Controls
Arrows or WASD to move, Space to jump, M to mute. On touch devices use the on-screen buttons.

## Embed in your platform
```html
<iframe src="https://<user>.github.io/<repo>/" width="960" height="540" style="border:0" allow="autoplay"></iframe>
<script>
  window.addEventListener('message', e => {
    if (e.data?.source === 'super-astro-brothers') console.log(e.data.type, e.data.detail);
  });
</script>
```
Events: `start`, `coin`, `phase-cleared`, `funded`, `shield-lost`, `hit`, `win` (`{score, coins, seconds}`).
The same events also fire on `window` as `astro:<name>` when the game is on your own page.

## Customise
- Level layout, enemy positions and speeds: `startGame()` / `start()` in `game.js`; tuning values in `CFG` at the top.
- Sprites live in `assets/` — replace a PNG with the same filename (transparent background, facing right for the astronaut).
