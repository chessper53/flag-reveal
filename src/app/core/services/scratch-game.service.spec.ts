import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ColorFamily } from '../models/color.model';
import { Continent, Country, FlagGrid, Tier } from '../models/flag.model';
import {
  GameModeId,
  RoundStatus,
  SCRATCH_MAX_SCORE,
  SCRATCH_ROUNDS_PER_SESSION,
} from '../models/game.model';
import { GRID_CELLS, GRID_HEIGHT, GRID_WIDTH, FlagGridService } from './flag-grid.service';
import { ScratchGameService } from './scratch-game.service';
import { StatsService } from './stats.service';

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
    await game.newSession(BRAZIL);
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
    await game.newSession(BRAZIL);
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

describe('ScratchGameService sessions', () => {
  let game: ScratchGameService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: FlagGridService, useClass: StubGridService }],
    });
    game = TestBed.inject(ScratchGameService);
    await game.newSession(BRAZIL);
  });

  it('opens on round one of three with nothing banked', () => {
    expect(game.roundNumber()).toBe(1);
    expect(game.sessionTotal()).toBe(0);
    expect(game.sessionComplete()).toBe(false);
  });

  it('banks each round and advances to the next flag', async () => {
    game.submit(BRAZIL);
    const first = game.finalScore()!;

    await game.advance(BRAZIL);

    expect(game.roundNumber()).toBe(2);
    expect(game.sessionTotal()).toBe(first);
    expect(game.sessionComplete()).toBe(false);
    // The new round starts clean.
    expect(game.status()).toBe(RoundStatus.Playing);
    expect(game.scratchedRatio()).toBe(0);
  });

  it('completes after three rounds and totals them', async () => {
    const scores: number[] = [];
    for (let round = 0; round < SCRATCH_ROUNDS_PER_SESSION; round++) {
      game.rub(20 + round, 20, 4);
      game.submit(BRAZIL);
      scores.push(game.finalScore()!);
      if (round < SCRATCH_ROUNDS_PER_SESSION - 1) {
        await game.advance(BRAZIL);
      }
    }

    expect(game.sessionComplete()).toBe(true);
    expect(game.sessionRounds()).toHaveLength(SCRATCH_ROUNDS_PER_SESSION);
    expect(game.sessionTotal()).toBe(scores.reduce((sum, score) => sum + score, 0));
  });

  it('records a lost round as a zero that still fills a slot', async () => {
    for (const code of ['AR', 'CO', 'PE']) {
      game.submit({ ...BRAZIL, code, name: code });
    }

    expect(game.sessionRounds()).toHaveLength(1);
    expect(game.sessionRounds()[0].won).toBe(false);
    expect(game.sessionRounds()[0].score).toBe(0);
    expect(game.sessionTotal()).toBe(0);

    await game.advance(BRAZIL);
    expect(game.roundNumber()).toBe(2);
  });

  it('starts a fresh session once the third round is done', async () => {
    for (let round = 0; round < SCRATCH_ROUNDS_PER_SESSION; round++) {
      game.submit(BRAZIL);
      if (round < SCRATCH_ROUNDS_PER_SESSION - 1) {
        await game.advance(BRAZIL);
      }
    }
    expect(game.sessionComplete()).toBe(true);

    // Advancing past a complete session deals a new one rather than a 4th flag.
    await game.advance(BRAZIL);

    expect(game.sessionComplete()).toBe(false);
    expect(game.roundNumber()).toBe(1);
    expect(game.sessionTotal()).toBe(0);
    expect(game.sessionRounds()).toHaveLength(0);
  });

  it('keeps the session total as the personal best, not a single round', async () => {
    for (let round = 0; round < SCRATCH_ROUNDS_PER_SESSION; round++) {
      game.submit(BRAZIL);
      if (round < SCRATCH_ROUNDS_PER_SESSION - 1) {
        await game.advance(BRAZIL);
      }
    }
    const total = game.sessionTotal();
    const stats = TestBed.inject(StatsService).statsFor(GameModeId.Scratch);

    expect(stats.bestScore).toBe(total);
    expect(total).toBeGreaterThan(SCRATCH_MAX_SCORE);
  });
});
