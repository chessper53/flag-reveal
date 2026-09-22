/**
 * Generates the country dataset from the `flag-icons` package (MIT).
 *
 * Run with `npm run flags:build`. It does two things:
 *
 *   1. Copies the 4:3 SVG of every included country into `public/flags/`,
 *      so the app can fetch `flags/ch.svg` same-origin at runtime (no CORS,
 *      no tainted canvas, works unchanged on GitHub Pages).
 *   2. Writes `src/app/core/data/countries.generated.ts` — code, display name,
 *      continent and difficulty tier for each country.
 *
 * The output is committed, so a normal `npm ci && npm run build` never needs
 * this script or the `flag-icons` dependency.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'node_modules/flag-icons');
const FLAG_OUT = resolve(ROOT, 'public/flags');
const DATA_OUT = resolve(ROOT, 'src/app/core/data/countries.generated.ts');

/**
 * The 193 UN member states plus Taiwan, Kosovo and the Holy See. Territories
 * and dependencies are left out: they make the guessing pool unfair and
 * clutter the autocomplete.
 */
const INCLUDED = `
af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi
cv kh cm ca cf td cl cn co km cg cd cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee
sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id ir iq ie il it jm
jp jo kz ke ki kp kr kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx
fm md mc mn me ma mz mm na nr np nl nz ni ne ng mk no om pk pw ps pa pg py pe ph pl
pt qa ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za ss es lk sd sr se
ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae gb us uy uz vu va ve vn ye zm zw
tw xk
`
  .trim()
  .split(/\s+/);

/**
 * Difficulty tiers. `easy` holds flags most players can name on sight, `medium`
 * the ones they have probably seen. Everything else falls through to `hard`.
 * Tiers drive the answer pool per mode, not the autocomplete, which always
 * offers every country.
 */
const EASY = `
us gb fr de it es pt nl be ch at se no dk fi is ie pl gr tr ru ua jp cn kr in br
ar mx ca au nz za eg ma ng ke il sa th vn id ph pk hu cz ro
`
  .trim()
  .split(/\s+/);

const MEDIUM = `
by bg hr rs si sk lt lv ee md ge am az kz uz cl co pe ve ec uy py bo cu jm cr pa
do gt hn ni sv tn dz ly sd et gh sn ci cm tz ug zw zm ao mz na bw ae qa kw om jo
lb sy iq ir af bd lk np mm my sg kh la kp mn tw lu mt cy al mk ba me
`
  .trim()
  .split(/\s+/);

/** Extra spellings the guess input should accept. */
const ALIASES = {
  us: ['USA', 'United States', 'America'],
  gb: ['UK', 'Great Britain', 'Britain', 'England'],
  nl: ['Holland'],
  cz: ['Czechia'],
  ae: ['UAE', 'Emirates'],
  kr: ['Korea', 'Republic of Korea'],
  kp: ['Korea', 'DPRK'],
  de: ['Deutschland'],
  es: ['Espana', 'España'],
  ch: ['Schweiz', 'Suisse', 'Svizzera'],
  tr: ['Turkey', 'Türkiye'],
  mm: ['Burma'],
  ci: ['Ivory Coast'],
  cv: ['Cape Verde'],
  tl: ['East Timor'],
  sz: ['Swaziland'],
  mk: ['Macedonia'],
  cd: ['DR Congo', 'Congo-Kinshasa', 'Zaire'],
  cg: ['Congo-Brazzaville'],
  la: ['Laos'],
  va: ['Vatican', 'Vatican City'],
  nl_be: [],
  ru: ['Russian Federation'],
  ps: ['Palestine'],
  st: ['Sao Tome'],
  gb_sct: [],
};

const catalogue = JSON.parse(readFileSync(resolve(SOURCE, 'country.json'), 'utf8'));
const byCode = new Map(catalogue.map((entry) => [entry.code, entry]));

rmSync(FLAG_OUT, { recursive: true, force: true });
mkdirSync(FLAG_OUT, { recursive: true });

const countries = [];
const missing = [];

for (const code of INCLUDED) {
  const entry = byCode.get(code);
  if (!entry) {
    missing.push(code);
    continue;
  }
  copyFileSync(resolve(SOURCE, entry.flag_4x3), resolve(FLAG_OUT, `${code}.svg`));
  countries.push({
    code: code.toUpperCase(),
    name: entry.name,
    continent: entry.continent || 'Asia',
    tier: EASY.includes(code) ? 'Easy' : MEDIUM.includes(code) ? 'Medium' : 'Hard',
    aliases: ALIASES[code] ?? [],
  });
}

countries.sort((a, b) => a.name.localeCompare(b.name));

const CONTINENT_ENUM = {
  Europe: 'Continent.Europe',
  Africa: 'Continent.Africa',
  Asia: 'Continent.Asia',
  'North America': 'Continent.NorthAmerica',
  'South America': 'Continent.SouthAmerica',
  Oceania: 'Continent.Oceania',
};

const rows = countries
  .map((country) => {
    const aliases = country.aliases.length ? `, aliases: ${JSON.stringify(country.aliases)}` : '';
    return `  { code: '${country.code}', name: ${JSON.stringify(country.name)}, continent: ${
      CONTINENT_ENUM[country.continent]
    }, tier: Tier.${country.tier}${aliases} },`;
  })
  .join('\n');

const file = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/build-flag-data.mjs from the flag-icons package (MIT).
// Flag artwork lives in public/flags/<lowercase code>.svg.

import { Continent, Country, Tier } from '../models/flag.model';

export const COUNTRIES: readonly Country[] = [
${rows}
];
`;

writeFileSync(DATA_OUT, file);

console.log(`Wrote ${countries.length} countries to ${DATA_OUT}`);
console.log(`Copied ${countries.length} SVGs to ${FLAG_OUT}`);
if (missing.length) {
  console.warn(`No flag-icons entry for: ${missing.join(', ')}`);
}
