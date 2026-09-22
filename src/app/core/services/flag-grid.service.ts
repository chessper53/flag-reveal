/**
 * Rasterises flag SVGs into comparable pixel grids.
 *
 * The SVGs are served from the app's own origin, so drawing them to a canvas
 * does not taint it and `getImageData` stays available — this is what lets the
 * whole game run as a static site with no server and no image CDN.
 *
 * Each flag is sampled at {@link SUPERSAMPLE}× the board resolution and each
 * board cell takes the *modal* colour family of its sub-pixels rather than
 * their average. Averaging would smear stripe borders into colours that exist
 * in no flag (red + white = pink), and those phantom colours would never match
 * anything. The modal family keeps every cell a colour the flag really uses.
 *
 * The output is used for matching only; the board displays the SVG itself.
 */

import { Injectable } from '@angular/core';
import { ColorFamily, classifyRgb } from '../models/color.model';
import { CountryCode, FlagGrid, flagAssetUrl } from '../models/flag.model';

/**
 * Match resolution. Every flag is rasterised to this 4:3 field.
 *
 * This is the granularity of *comparison and reveal*, not of display: the
 * board paints the real SVG through this mask, so a fine grid means the
 * revealed edges follow the flag's own stripes closely.
 */
export const GRID_WIDTH = 128;
export const GRID_HEIGHT = 96;
export const GRID_CELLS = GRID_WIDTH * GRID_HEIGHT;

/** Sub-pixels sampled per board cell, per axis. */
const SUPERSAMPLE = 3;

@Injectable({ providedIn: 'root' })
export class FlagGridService {
  private readonly cache = new Map<CountryCode, FlagGrid>();
  private readonly inFlight = new Map<CountryCode, Promise<FlagGrid>>();

  /** Already-rasterised grid, or `undefined` if it still needs loading. */
  peek(code: CountryCode): FlagGrid | undefined {
    return this.cache.get(code);
  }

  /** Rasterises a flag, de-duplicating concurrent requests for the same code. */
  load(code: CountryCode): Promise<FlagGrid> {
    const cached = this.cache.get(code);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(code);
    if (pending) {
      return pending;
    }

    const request = rasterize(code)
      .then((grid) => {
        this.cache.set(code, grid);
        return grid;
      })
      .finally(() => this.inFlight.delete(code));

    this.inFlight.set(code, request);
    return request;
  }

  /** Warms the cache for codes the player is about to see. Failures are ignored. */
  preload(codes: readonly CountryCode[]): void {
    for (const code of codes) {
      void this.load(code).catch(() => undefined);
    }
  }
}

async function rasterize(code: CountryCode): Promise<FlagGrid> {
  const image = await loadImage(flagAssetUrl(code));
  const width = GRID_WIDTH * SUPERSAMPLE;
  const height = GRID_HEIGHT * SUPERSAMPLE;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const families = new Uint8Array(GRID_CELLS);

  // Tally reused across cells to keep this allocation-free in the hot loop.
  const familyCounts = new Uint16Array(16);

  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      familyCounts.fill(0);

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const y = row * SUPERSAMPLE + sy;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = col * SUPERSAMPLE + sx;
          const offset = (y * width + x) * 4;
          const alpha = data[offset + 3];
          // Transparent pixels (a few flags have them) read as white.
          const r = alpha === 0 ? 255 : data[offset];
          const g = alpha === 0 ? 255 : data[offset + 1];
          const b = alpha === 0 ? 255 : data[offset + 2];
          familyCounts[classifyRgb(r, g, b)]++;
        }
      }

      let winner = ColorFamily.Unknown;
      let best = -1;
      for (let family = 0; family < familyCounts.length; family++) {
        if (familyCounts[family] > best) {
          best = familyCounts[family];
          winner = family;
        }
      }

      families[row * GRID_WIDTH + col] = winner;
    }
  }

  return { width: GRID_WIDTH, height: GRID_HEIGHT, families };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load flag artwork: ${url}`));
    image.src = url;
  });
}
