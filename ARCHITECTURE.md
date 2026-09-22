# Architecture

Written for: an engineer or agent picking this repo up with no prior context.

FlagReveal is a client-only Angular 22 game. There is no backend, no database
and no runtime configuration: everything ships as static files, which is what
makes GitHub Pages hosting viable.

---

## 1. The core idea

Both game modes rest on one abstraction: **every flag can be reduced to the
same fixed-size cell grid**, so any two flags can be compared cell by cell.

```
public/flags/fr.svg ──rasterise──▶ FlagGrid (families) ──compare──▶ Mask ──┐
       │                             128 × 96 cells                        │
       └────────────────── drawn at full resolution ─────────────────▶ Board
```

**Matching and display are separate concerns, and keeping them separate is the
single most important decision in the codebase.**

*Matching* works on a `FlagGrid`: one `Uint8Array` of quantised
{@link ColorFamily} values, 12 288 entries. Flag artwork uses hundreds of
near-identical colours (France's red `#EF4135`, Switzerland's `#FF0000`) and
anti-aliasing invents more, so comparing raw pixels would make Reveal mode feel
broken. Pixels are bucketed into ~13 coarse families and matching is family
equality.

*Display* never touches that grid. The board draws the original SVG at full
canvas resolution and punches it through the reveal mask, scaled up with
interpolation — so the flag looks like the real thing, smooth and crisp, with
softly feathered reveal edges rather than a mosaic of blocks.

---

## 2. Where the data comes from

Flags are **not** hand-authored. They come from the MIT-licensed
[`flag-icons`](https://github.com/lipis/flag-icons) package.

`scripts/build-flag-data.mjs` (run via `npm run flags:build`) does two things:

1. Copies the 4:3 SVG of each included country into `public/flags/<code>.svg`.
2. Generates `src/app/core/data/countries.generated.ts` — code, display name,
   continent, difficulty tier and aliases for 197 countries.

Both outputs are **committed**, so a normal `npm ci && npm run build` never
needs the script or the `flag-icons` dev dependency. Re-run the script only to
change which countries are included or how they are tiered; the tier lists and
the alias map live at the top of the script.

Serving the SVGs from our own origin matters: a same-origin image can be drawn
to a canvas without tainting it, which is what keeps `getImageData` — and
therefore the whole game — working without a server.

---

## 3. Directory layout

```
src/app/
├── core/                        # No UI. Pure logic, safe to unit test.
│   ├── models/
│   │   ├── color.model.ts       # ColorFamily enum + classifyRgb() quantiser
│   │   ├── flag.model.ts        # Country, FlagGrid, flagAssetUrl()
│   │   └── game.model.ts        # Modes, RoundStatus, Guess, ModeStats, tuning constants
│   ├── data/
│   │   ├── countries.generated.ts   # GENERATED — do not edit
│   │   └── modes.ts             # The mode registry the menu renders
│   ├── services/
│   │   ├── flag-grid.service.ts # SVG → FlagGrid, cached
│   │   ├── country.service.ts   # Lookup, fuzzy search, random answer
│   │   ├── reveal-game.service.ts   # Reveal mode rules + state
│   │   ├── scratch-game.service.ts  # Scratch mode rules + state
│   │   └── stats.service.ts     # localStorage-backed stats
│   └── util/board-mask.ts       # The visibility mask shared by both modes
├── features/                    # One folder per page, lazily routed.
│   ├── menu/                    # Mode cards + lifetime stats
│   ├── reveal/                  # Colour Reveal page
│   └── scratch/                 # Scratch & Guess page + session summary
└── shared/                      # Reusable presentational components.
    ├── flag-board/              # The canvas playfield
    ├── country-picker/          # Autocomplete with flag previews
    ├── result-banner/           # End-of-round panel
    └── icon/                    # Inline SVG icon set
```

**The rule:** `core` never imports from `features` or `shared`. Components
render signals exposed by services and call methods on them; they hold no game
rules of their own.

---

## 4. Key components

### `FlagGridService` — rasterisation

`load(code)` fetches `flags/xx.svg`, draws it to an offscreen canvas at 3×
board resolution, and reduces each 3 × 3 block of sub-pixels to one cell.

It takes the **modal** family of those sub-pixels, not their average. Averaging
smears stripe borders into colours that exist in no flag (red + white = pink),
and such phantom colours would never match anything.

Results are cached per country code and concurrent loads are de-duplicated.

### Game services — one per mode

`RevealGameService` and `ScratchGameService` are the rule engines. Both:

- expose state as **signals** (`status`, `mask`, `guesses`, `answer`, …),
- expose derived values as `computed` (`attemptsLeft`, `potentialScore`, …),
- accept `newRound(forced?: Country)` — `forced` backs the `?flag=XX` query
  parameter, which pins the answer so a round can be shared, replayed or tested,
- return `GuessOutcome` rather than throwing, so the UI can explain a rejection.

They differ only in what makes a cell visible:

| Mode    | Reveal rule                                | Scoring                                                         |
| ------- | ------------------------------------------ | --------------------------------------------------------------- |
| Reveal  | `guess.families[i] === answer.families[i]` | 5 attempts, win or lose                                         |
| Scratch | the pointer passed within the brush radius | `1000 × (1 − rubbed) × multiplier`, multiplier `1 / 0.7 / 0.45` |

`ScratchGameService` additionally tracks a **session**: three rounds, then one
combined score out of 3000. It therefore has two lifetimes — the round (mask,
guesses, status) and the session (`sessionRounds`, `sessionTotal`,
`sessionComplete`) — and three entry points:

- `newSession(forced?)` — clear the banked rounds, deal the first flag.
- `advance(forced?)` — next flag, or a new session if all three are played.
- `startRound(forced?)` — private; the per-round reset both of the above share.

A session is the number players compare, so the session total (not a single
round) is what `StatsService.recordSession()` keeps as a personal best.

### `FlagBoard` — the playfield

Purely presentational: it takes a `flagUrl` and a `mask` and emits `scratch`
events in **cell coordinates**, leaving the page to decide what that means.

Each frame composites three canvases:

1. `maskCanvas` (128 × 96) — one alpha value per cell, holding the animation.
2. `flagCanvas` (full size) — the SVG, then `destination-in` the upscaled mask.
3. the visible canvas — the cover, then the masked flag on top.

Upscaling the small mask with smoothing on is what feathers the reveal edges:
a hard cell boundary becomes a one-cell gradient, so the flag reads as being
wiped clean rather than assembled from blocks.

A `Float32Array` of per-cell opacity is walked towards the mask on
`requestAnimationFrame`. The loop stops once every cell has settled, and
`prefers-reduced-motion` collapses it to an instant switch.

### `CountryPicker` — the only input

Search (`CountryService.search`) folds accents, matches aliases and ISO codes,
and ranks prefix hits above substring hits. Enter takes the highlighted
suggestion, or resolves the typed text when it is unambiguous — which is what
lets a round be played entirely by typing.

---

## 5. Adding a third mode

1. Add an id to `GameModeId` and an entry to `GAME_MODES` in
   `core/data/modes.ts`. The menu picks it up automatically.
2. Write `core/services/<mode>-game.service.ts`. Reuse `board-mask.ts` for the
   visibility bookkeeping and follow the signal shape of the existing engines.
3. Add `features/<mode>/` with a page component, and a lazy route in
   `app.routes.ts`.
4. Reuse `FlagBoard`, `CountryPicker` and `ResultBanner`; set `--accent` on the
   page host to recolour the whole page.

Keep the keyboard contract: **Enter guesses; Enter starts the next round once
the round is over** (`@HostListener('document:keydown.enter')`), and gate that
second Enter behind `createReplayArming()` — see below.

### The reveal hold

When a round ends the board plays its final reveal while the player is often
still holding the Enter key that submitted the last guess. `core/util/
replay-arming.ts` keeps "play again" disarmed for `REVEAL_GRACE_MS` so that
keystroke cannot skip past the answer; the result banner's button is disabled
over the same window.

---

## 6. Tuning knobs

| Constant                             | File                    | Effect                             |
| ------------------------------------ | ----------------------- | ---------------------------------- |
| `GRID_WIDTH` / `GRID_HEIGHT`         | `flag-grid.service.ts`  | Match resolution (reveal precision)|
| `SUPERSAMPLE`                        | `flag-grid.service.ts`  | Rasterisation quality              |
| hue/value cut-offs in `classifyRgb`  | `color.model.ts`        | Which colours count as "the same"  |
| `REVEAL_MAX_ATTEMPTS`                | `game.model.ts`         | Guesses in Reveal                  |
| `SCRATCH_MAX_SCORE`, multipliers     | `game.model.ts`, engine | Scratch scoring curve              |
| `SCRATCH_ROUNDS_PER_SESSION`         | `game.model.ts`         | Flags per Scratch session          |
| `BRUSH_RADIUS_CELLS`                 | `scratch-page.ts`       | Rub size; 2 cells ≈ 1 point a tap  |
| `REVEAL_GRACE_MS`                    | `replay-arming.ts`      | How long the answer holds the screen|
| `EASY` / `MEDIUM` tier lists         | `build-flag-data.mjs`   | Which flags can be answers         |

Answer pools are `[Tier.Easy, Tier.Medium]` in both engines — the autocomplete
still offers all 197 countries.

---

## 7. Testing

`npm run test:ci` (Vitest + jsdom). Canvas is unavailable in jsdom, so
`FlagGridService` is stubbed with hand-built grids: the engine specs assert on
banded synthetic flags ("blue | white | red") rather than real artwork, which
keeps them fast and readable. `classifyRgb` is tested directly against real
flag hexes — those cases are the behavioural contract of the quantiser.

To test in a real browser, `?flag=XX` pins the answer.

---

## 8. Deployment (not enabled — nothing has been published)

`npm run build:pages` builds with `$BASE_HREF` and then runs
`scripts/prepare-pages.mjs`, which copies `index.html` to `404.html` (so deep
links survive a refresh on Pages) and writes `.nojekyll`.

For a project site the base href must be `/<repo-name>/`; for a user site or a
custom domain it is `/`. Nothing is deployed until the workflow in
`.github/workflows/deploy.yml` runs on a push to `main`.
