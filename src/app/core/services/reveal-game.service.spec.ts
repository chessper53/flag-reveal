import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ColorFamily } from '../models/color.model';
import { Continent, Country, FlagGrid, Tier } from '../models/flag.model';
import { RoundStatus } from '../models/game.model';
import { GRID_CELLS, GRID_WIDTH, FlagGridService } from './flag-grid.service';
import { RevealGameService } from './reveal-game.service';
import { SettingsService } from './settings.service';

/**
 * Builds a flag of vertical bands from colour families, so tests can express
 * "blue | white | red" without any artwork or canvas.
 *
 * The board is 64 columns wide, which thirds do not divide evenly — use
 * {@link bandShare} rather than 1/3 when asserting on band sizes.
 */
function bandedGrid(...families: ColorFamily[]): FlagGrid {
  const cells = new Uint8Array(GRID_CELLS);
  for (let index = 0; index < GRID_CELLS; index++) {
    const column = index % GRID_WIDTH;
    const band = Math.min(families.length - 1, Math.floor((column / GRID_WIDTH) * families.length));
    cells[index] = families[band];
  }
  return { width: GRID_WIDTH, height: GRID_CELLS / GRID_WIDTH, families: cells };
}

/** Exact share of the board taken by band `index` of `count` vertical bands. */
function bandShare(index: number, count: number): number {
  let columns = 0;
  for (let column = 0; column < GRID_WIDTH; column++) {
    if (Math.min(count - 1, Math.floor((column / GRID_WIDTH) * count)) === index) {
      columns++;
    }
  }
  return columns / GRID_WIDTH;
}

const FRANCE: Country = {
  code: 'FR',
  name: 'France',
  continent: Continent.Europe,
  tier: Tier.Easy,
};

/** Serves canned grids instead of fetching and rasterising SVGs. */
class StubGridService {
  readonly grids = new Map<string, FlagGrid>([
    ['FR', bandedGrid(ColorFamily.Blue, ColorFamily.White, ColorFamily.Red)],
    // Shares only the final red band with France.
    ['AT', bandedGrid(ColorFamily.Green, ColorFamily.Green, ColorFamily.Red)],
    // Shares nothing at all.
    ['LY', bandedGrid(ColorFamily.Black, ColorFamily.Black, ColorFamily.Black)],
  ]);

  load(code: string): Promise<FlagGrid> {
    const grid = this.grids.get(code);
    return grid ? Promise.resolve(grid) : Promise.reject(new Error(`no grid for ${code}`));
  }

  peek(): undefined {
    return undefined;
  }

  preload(): void {}
}

function country(code: string, name: string): Country {
  return { code, name, continent: Continent.Europe, tier: Tier.Easy };
}

describe('RevealGameService', () => {
  let game: RevealGameService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: FlagGridService, useClass: StubGridService }],
    });
    game = TestBed.inject(RevealGameService);
    await game.newRound(FRANCE);
  });

  it('starts blank and playable', () => {
    expect(game.status()).toBe(RoundStatus.Playing);
    expect(game.revealedRatio()).toBe(0);
    expect(game.attemptsLeft()).toBe(5);
    expect(game.ready()).toBe(true);
  });

  it('reveals only the bands whose colour family matches', async () => {
    await game.submit(country('AT', 'Austria'));

    // Only the red band matches, so exactly that band opens up.
    expect(game.revealedRatio()).toBeCloseTo(bandShare(2, 3), 5);
    expect(game.guesses()[0].matchRatio).toBeCloseTo(bandShare(2, 3), 5);
    expect(game.status()).toBe(RoundStatus.Playing);
  });

  it('reveals nothing for a flag with no colours in common', async () => {
    await game.submit(country('LY', 'Libya'));
    expect(game.revealedRatio()).toBe(0);
  });

  it('keeps earlier reveals when a later guess matches less', async () => {
    await game.submit(country('AT', 'Austria'));
    const afterFirst = game.revealedRatio();
    await game.submit(country('LY', 'Libya'));
    expect(game.revealedRatio()).toBe(afterFirst);
  });

  it('wins on the correct country and shows the whole flag', async () => {
    await game.submit(country('AT', 'Austria'));
    const outcome = await game.submit(FRANCE);

    expect(outcome.accepted).toBe(true);
    expect(game.status()).toBe(RoundStatus.Won);
    expect(game.revealedRatio()).toBe(1);
  });

  it('rejects a repeated guess without spending an attempt', async () => {
    await game.submit(country('AT', 'Austria'));
    const outcome = await game.submit(country('AT', 'Austria'));

    expect(outcome.accepted).toBe(false);
    expect(game.attemptsLeft()).toBe(4);
  });

  it('loses after five wrong guesses and reveals the answer', async () => {
    for (const code of ['AT', 'LY']) {
      await game.submit(country(code, code));
    }
    // Reuse the same grids under fresh codes to burn the remaining attempts.
    const stub = TestBed.inject(FlagGridService) as unknown as StubGridService;
    for (const code of ['X1', 'X2', 'X3']) {
      stub.grids.set(code, stub.grids.get('LY')!);
      await game.submit(country(code, code));
    }

    expect(game.status()).toBe(RoundStatus.Lost);
    expect(game.attemptsLeft()).toBe(0);
    expect(game.revealedRatio()).toBe(1);
  });

  it('reports the colour families the guess shares with the answer', async () => {
    await game.submit(country('AT', 'Austria'));
    expect(game.guesses()[0].sharedFamilies).toEqual([ColorFamily.Red]);
  });
});

/** Serves the same grid for any code, so rounds can be dealt at random. */
class AnyGridService {
  private readonly grid = bandedGrid(ColorFamily.Blue, ColorFamily.White, ColorFamily.Red);

  load(): Promise<FlagGrid> {
    return Promise.resolve(this.grid);
  }
  peek(): undefined {
    return undefined;
  }
  preload(): void {}
}

describe('RevealGameService answer pool', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: FlagGridService, useClass: AnyGridService }],
    });
  });

  it('keeps obscure countries out of the pool unless hard mode is on', async () => {
    const game = TestBed.inject(RevealGameService);

    const normalTiers = new Set<Tier>();
    for (let i = 0; i < 300; i++) {
      await game.newRound();
      normalTiers.add(game.answer()!.tier);
    }
    expect(normalTiers.has(Tier.Hard)).toBe(false);

    TestBed.inject(SettingsService).setHardMode(true);
    const hardTiers = new Set<Tier>();
    for (let i = 0; i < 300; i++) {
      await game.newRound();
      hardTiers.add(game.answer()!.tier);
    }
    expect(hardTiers.has(Tier.Hard)).toBe(true);
  });
});
