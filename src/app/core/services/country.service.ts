/**
 * The country catalogue: lookup, search and answer picking.
 *
 * Search powers the autocomplete, so it has to be forgiving — accents folded,
 * aliases matched, prefix hits ranked above substring hits — and fast enough
 * to run on every keystroke over ~200 entries.
 */

import { Injectable } from '@angular/core';
import { COUNTRIES } from '../data/countries.generated';
import { Country, CountryCode, Tier } from '../models/flag.model';
import { rngFor } from '../util/rng';

/** A country plus where the query matched, so the UI can highlight it. */
export interface CountryMatch {
  readonly country: Country;
  /** Index of the match inside the displayed name, or -1 if it matched an alias. */
  readonly highlightStart: number;
  readonly highlightLength: number;
}

interface IndexedCountry {
  readonly country: Country;
  /** Normalised name, used for matching. */
  readonly needle: string;
  /** Normalised aliases plus the ISO code. */
  readonly extras: readonly string[];
}

/** Lowercases and strips diacritics so "Türkiye" matches "turkiye". */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

@Injectable({ providedIn: 'root' })
export class CountryService {
  readonly all: readonly Country[] = COUNTRIES;

  private readonly index: readonly IndexedCountry[] = COUNTRIES.map((country) => ({
    country,
    needle: normalize(country.name),
    extras: [normalize(country.code), ...(country.aliases ?? []).map(normalize)],
  }));

  private readonly byCode = new Map<CountryCode, Country>(
    COUNTRIES.map((country) => [country.code, country]),
  );

  byCodeOrThrow(code: CountryCode): Country {
    const country = this.byCode.get(code);
    if (!country) {
      throw new Error(`Unknown country code "${code}"`);
    }
    return country;
  }

  find(code: CountryCode): Country | undefined {
    return this.byCode.get(code);
  }

  /**
   * Ranked matches for `query`. Prefix matches on the name come first, then
   * word-start matches, then anything else; ties break alphabetically.
   */
  search(query: string, limit = 8): readonly CountryMatch[] {
    const needle = normalize(query);
    if (!needle) {
      return [];
    }

    const scored: { match: CountryMatch; score: number }[] = [];

    for (const entry of this.index) {
      const position = entry.needle.indexOf(needle);
      if (position === 0) {
        scored.push({
          match: { country: entry.country, highlightStart: 0, highlightLength: needle.length },
          score: 0,
        });
        continue;
      }
      if (position > 0) {
        // A match right after a space reads as a "real" word match.
        const atWordStart = entry.needle[position - 1] === ' ';
        scored.push({
          match: {
            country: entry.country,
            highlightStart: position,
            highlightLength: needle.length,
          },
          score: atWordStart ? 1 : 2,
        });
        continue;
      }
      if (entry.extras.some((extra) => extra.startsWith(needle))) {
        scored.push({
          match: { country: entry.country, highlightStart: -1, highlightLength: 0 },
          score: 3,
        });
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.match.country.name.localeCompare(b.match.country.name))
      .slice(0, limit)
      .map((entry) => entry.match);
  }

  /**
   * Resolves free text to exactly one country, for when the player types a
   * full name and hits Enter without touching the dropdown.
   */
  resolve(query: string): Country | undefined {
    const needle = normalize(query);
    if (!needle) {
      return undefined;
    }
    const exact = this.index.find(
      (entry) => entry.needle === needle || entry.extras.includes(needle),
    );
    if (exact) {
      return exact.country;
    }
    const matches = this.search(query, 2);
    // Only auto-accept when the query is unambiguous.
    return matches.length === 1 ? matches[0].country : undefined;
  }

  /**
   * Picks a random answer from `tiers`, avoiding `exclude` where possible.
   * Falls back to the full tier pool once every country has been seen.
   */
  randomAnswer(tiers: readonly Tier[], exclude: readonly CountryCode[] = []): Country {
    const pool = this.poolFor(tiers);
    const excluded = new Set(exclude);
    const fresh = pool.filter((country) => !excluded.has(country.code));
    const source = fresh.length > 0 ? fresh : pool;
    return source[Math.floor(Math.random() * source.length)];
  }

  /**
   * The answer for round `index` of `seed` — the same country for everyone who
   * opens the same link.
   *
   * `exclude` keeps a session from repeating itself, and is only safe to pass
   * values that both players will compute identically (the codes already dealt
   * from this same seed). Passing anything player-specific, such as history
   * from localStorage, would silently desynchronise the two sides.
   */
  seededAnswer(
    tiers: readonly Tier[],
    seed: string,
    index: number,
    exclude: readonly CountryCode[] = [],
  ): Country {
    const pool = this.poolFor(tiers);
    const excluded = new Set(exclude);
    const fresh = pool.filter((country) => !excluded.has(country.code));
    const source = fresh.length > 0 ? fresh : pool;
    return source[Math.floor(rngFor(seed, index)() * source.length)];
  }

  /** Countries in the given tiers, in catalogue order. */
  private poolFor(tiers: readonly Tier[]): readonly Country[] {
    return this.all.filter((country) => tiers.includes(country.tier));
  }
}
