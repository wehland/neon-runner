# Neon Runner

Browser-based procedural endless runner. A Three.js technical demo: TypeScript, Vite, and a deterministic simulation layer that the renderer follows. Live demo: https://demo.johnwehland.com

## Run locally

```bash
npm install
npm run dev
```

Opens the Vite dev server (http://127.0.0.1:5173). Click **Start**, then use the keyboard.

## Build / test

```bash
npm run build          # typecheck + production bundle
npm test               # unit tests (vitest)
npm run test:e2e       # local Playwright (builds with VITE_E2E)
npm run test:gate      # unit + production build + secret/dist checks + local E2E
```

Related: `npm run test:secrets` and `npm run test:prod-build` scan `dist/`. `npm run test:e2e:prod` hits the live demo.

Production is deployed as a static Vite build behind HTTPS. Deployment infrastructure is maintained separately from this public showcase repository.

## Controls

- **A / D** or **← / →** — change lane
- **Space** — jump
- **Sound** button — mute / unmute (first interaction also unlocks audio)

## Architecture

Gameplay state and deterministic simulation are separated from Three.js rendering. `GameSimulation` owns rules and state (lanes, jump, collisions, spawns, course progress). View classes (`TrackView`, `PlayerView`, `SpawnView`, `Starfield`) only synchronize meshes from that state. Unit tests cover simulation without a GPU. Browser E2E uses a Vite `VITE_E2E=true` hook in `src/test/instrumentation.ts`; production builds do not attach it.

## Code map

| Path | Role |
| --- | --- |
| `src/main.ts` | Entry: canvas, input, resize, loop |
| `src/game/Game.ts` | Scene, renderer, camera, render loop, visual sync |
| `src/game/simulation.ts` | Core gameplay state and deterministic tick |
| `src/game/course.ts` | Procedural 3D path, lane masks, track breaks |
| `src/game/collision.ts` | Lane math, jump physics, hit tests |
| `src/game/config.ts` | Shared tunables |
| `src/game/Track.ts` | Track segment meshes |
| `src/game/Player.ts` | Player mesh |
| `src/game/Spawner.ts` | Obstacle and orb meshes |
| `src/game/Stars.ts` | Procedural starscape |
| `src/audio/` | Music and SFX |
| `src/ui/` | HUD and overlays |
| `tests/unit/` | Deterministic logic tests |
| `tests/e2e/` | Local and production Playwright |

Audio asset licenses: `AUDIO_LICENSES.md`.

## License

Proprietary. Source is available for viewing and evaluation only. See `LICENSE`.
