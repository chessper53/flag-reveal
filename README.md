# FlagReveal

A flag guessing game with two modes, built with Angular 22. No backend — it is
a static site.

## Modes

**Colour Reveal** — the flag starts blank. You get five guesses, and every
guess paints in the pixels where its colours match the hidden flag. Guess
Switzerland against France and France's red band lights up.

**Scratch & Guess** — the flag sits under a cover you rub away with the
pointer. You start at 1000 points and every press you rub costs about one, so
the game is how early you dare to guess. Played in sessions of three flags, for
a combined score out of 3000.

**Mosaic Ladder** — the hard one. The flag is drawn as two enormous blocks and
sharpens one rung per wrong guess (2 → 3 → 5 → 8 → 12 blocks), never far enough
to be readable. Every one of the 197 countries can come up.

**Hard mode** (toggle on the menu) strips the flag previews out of the
autocomplete, so you have to know a country by name rather than matching
thumbnails against the board, and opens the answer pool to every country.

All modes are played from the keyboard: type a country, press Enter to guess,
press Enter again to start the next round.

## Running it

```bash
npm install
npm start          # http://localhost:4200
npm run test:ci    # unit tests
```

Add `?flag=FR` to a game URL to pin the answer to a specific country — handy
for sharing a round or reproducing a bug.

## Regenerating the flag data

Country data and artwork are generated from the MIT-licensed `flag-icons`
package and committed, so you only need this after changing which countries are
included:

```bash
npm run flags:build
```

## Deploying to GitHub Pages

Not enabled yet. When you want it:

1. Push the repo to GitHub.
2. In **Settings → Pages**, set Source to **GitHub Actions**.
3. Push to `main`; `.github/workflows/deploy.yml` builds and publishes.

The workflow sets the base href to `/<repo-name>/`. For a user site or custom
domain, change `BASE_HREF` in the workflow to `/`.

## Docs

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the pixel comparison works and
where to add a third mode.

## Credits

Flag artwork: [flag-icons](https://github.com/lipis/flag-icons) (MIT).
