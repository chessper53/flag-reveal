import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ColorFamily } from '../models/color.model';
import { Continent, Country, FlagGrid, Tier } from '../models/flag.model';
import { RoundStatus, SCRATCH_MAX_SCORE } from '../models/game.model';
import { GRID_CELLS, GRID_HEIGHT, GRID_WIDTH, FlagGridService } from './flag-grid.service';
import { ScratchGameService } from './scratch-game.service';

const BRAZIL: Country = {
  code: 'BR',
  name: 'Brazil',
  continent: Continent.SouthAmerica,
  tier: Tier.Easy,
};

function solidGrid(): FlagGrid {
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    families: new Uint8Array(GRID_CELLS).fill(ColorFamily.Green),
  };
}

class StubGridService {
  load(): Promise<FlagGrid> {
    return Promise.resolve(solidGrid());
  }
  peek(): undefined {
    return undefined;
  }
  preload(): void {}
}

describe('ScratchGameService', () => {
  let game: ScratchGameService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: FlagGridService, useClass: StubGridService }],
    });
    game = TestBed.inject(ScratchGameService);
    await game.newRound(BRAZIL);
  });

  it('starts covered and worth full marks', () => {
    expect(game.scratchedRatio()).toBe(0);
    expect(game.potentialScore()).toBe(SCRATCH_MAX_SCORE);
  });

  it('uncovers a circular patch and charges for it', () => {
    game.rub(10, 10, 4);

    const ratio = game.scratchedRatio();
    expect(ratio).toBeGreaterThan(0);
    // A radius-4 disc is ~50 cells out of 3072, so the cost is small but real.
    expect(ratio).toBeLessThan(0.05);
    expect(game.potentialScore()).toBeLessThan(SCRATCH_MAX_SCORE);
  });

  it('does not charge twice for rubbing the same spot', () => {
    game.rub(10, 10, 4);
    const afterFirst = game.potentialScore();
    game.rub(10, 10, 4);
    expect(game.potentialScore()).toBe(afterFirst);
  });

  it('clips the brush at the board edges', () => {
    game.rub(0, 0, 6);
    expect(game.scratchedRatio()).toBeGreaterThan(0);
    expect(game.scratchedRatio()).toBeLessThan(0.05);
  });

  it('awards the live score on a correct guess', () => {
    game.rub(20, 20, 5);
    const expected = game.potentialScore();

    game.submit(BRAZIL);

    expect(game.status()).toBe(RoundStatus.Won);
    expect(game.finalScore()).toBe(expected);
    expect(game.scratchedRatio()).toBe(1);
  });

  it('cuts the multiplier after a wrong guess', () => {
    const before = game.potentialScore();
    game.submit({ ...BRAZIL, code: 'AR', name: 'Argentina' });

    expect(game.status()).toBe(RoundStatus.Playing);
    expect(game.potentialScore()).toBeCloseTo(before * 0.7, -1);
  });

  it('ends the round with nothing after three wrong guesses', () => {
    for (const code of ['AR', 'CO', 'PE']) {
      game.submit({ ...BRAZIL, code, name: code });
    }

    expect(game.status()).toBe(RoundStatus.Lost);
    expect(game.finalScore()).toBe(0);
    // Losing still shows the flag.
    expect(game.scratchedRatio()).toBe(1);
  });

  it('ignores rubbing once the round is over', () => {
    game.submit(BRAZIL);
    const ratio = game.scratchedRatio();
    game.rub(5, 5, 3);
    expect(game.scratchedRatio()).toBe(ratio);
  });
});

describe('ScratchGameService reporting', () => {
  let game: ScratchGameService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: FlagGridService, useClass: StubGridService }],
    });
    game = TestBed.inject(ScratchGameService);
    await game.newRound(BRAZIL);
  });

  it('freezes the rubbed share at the moment the round ended', () => {
    game.rub(20, 20, 5);
    const rubbed = game.scratchedRatio();

    game.submit(BRAZIL);

    // The board is now fully uncovered, but the report must still describe
    // how much the player actually rubbed.
    expect(game.scratchedRatio()).toBe(1);
    expect(game.finalScratchedRatio()).toBeCloseTo(rubbed, 5);
  });
});
