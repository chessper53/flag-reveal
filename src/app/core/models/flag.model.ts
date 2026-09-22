/**
 * Country and flag model.
 *
 * Flags are real SVG artwork from the `flag-icons` project, served from
 * `public/flags/<code>.svg`. At runtime each one is rasterised once into a
 * {@link FlagGrid}: a fixed-size pixel grid where every cell carries both the
 * colour to draw and a coarse {@link ColorFamily} used for matching.
 *
 * Fixing every flag to the same grid means two flags always line up cell for
 * cell, which is the whole basis of the Reveal mode.
 */

import { ColorFamily } from './color.model';

/** ISO 3166-1 alpha-2 code, uppercase. Primary key for a country. */
export type CountryCode = string;

export enum Continent {
  Europe = 'Europe',
  Africa = 'Africa',
  Asia = 'Asia',
  NorthAmerica = 'North America',
  SouthAmerica = 'South America',
  Oceania = 'Oceania',
}

/** How widely recognised the flag is; drives which answers a mode may pick. */
export enum Tier {
  Easy = 'Easy',
  Medium = 'Medium',
  Hard = 'Hard',
}

/** A country. Generated into `data/countries.generated.ts`. */
export interface Country {
  readonly code: CountryCode;
  readonly name: string;
  readonly continent: Continent;
  readonly tier: Tier;
  /** Alternative spellings accepted by the guess input ("USA", "Holland"). */
  readonly aliases?: readonly string[];
}

/**
 * A rasterised flag: the quantised {@link ColorFamily} of each cell, row-major
 * with `width * height` entries.
 *
 * This is a *matching* structure, not a picture. Nothing is ever painted from
 * it — the board displays the original SVG and uses the reveal mask to decide
 * which parts of it are visible. Quantising is what makes Switzerland's red
 * and France's red count as the same red.
 */
export interface FlagGrid {
  readonly width: number;
  readonly height: number;
  readonly families: Uint8Array;
}

/** URL of a country's flag artwork, relative to the app base href. */
export function flagAssetUrl(code: CountryCode): string {
  return `flags/${code.toLowerCase()}.svg`;
}
