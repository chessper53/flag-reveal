/**
 * The promise a share link makes: open the same link and you play the same
 * flags. These tests exercise that end to end, across all three modes.
 */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ColorFamily } from '../models/color.model';
import { CountryCode, FlagGrid, Tier } from '../models/flag.model';
import { SCRATCH_ROUNDS_PER_SESSION } from '../models/game.model';
import { CountryService } from './country.service';
import { GRID_CELLS, GRID_HEIGHT, GRID_WIDTH, FlagGridService } from './flag-grid.service';
import { MosaicGameService } from './mosaic-game.service';
import { RevealGameService } from './reveal-game.service';
import { ScratchGameService } from './scratch-game.service';
import { SettingsService } from './settings.service';

/** Any code resolves, so engines can deal freely without real artwork. */
class AnyGridService {
  private readonly grid: FlagGrid = {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    families: new Uint8Array(GRID_CELLS).fill(ColorFamily.Green),
  };
  load(): Promise<FlagGrid> {
    return Promise.resolve(this.grid);
  }
  peek(): undefined {
    return undefined;
  }
  preload(): void {}
}

function configure(): void {
  TestBed.configureTestingModule({
    providers: [{ provide: FlagGridService, useClass: AnyGridService }],
  });
}

/** Plays `count` rounds of Reveal from a challenge and returns the answers. */
async function revealRun(seed: string, index: number, count: number): Promise<CountryCode[]> {
  TestBed.resetTestingModule();
  configure();
  const game = TestBed.inject(RevealGameService);
  game.useChallenge(seed, index);
  const codes: CountryCode[] = [];
  for (let i = 0; i < count; i++) {
    await game.newRound();
    codes.push(game.answer()!.code);
  }
  return codes;
}

describe('Seeded challenges', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    configure();
  });

  it('deals identical Reveal rounds to two players on the same link', async () => {
    const mine = await revealRun('k3m9x2', 0, 5);
    const theirs = await revealRun('k3m9x2', 0, 5);
    expect(theirs).toEqual(mine);
  });

  it('deals different flags for different seeds', async () => {
    const a = await revealRun('aaaaaa', 0, 6);
    const b = await revealRun('bbbbbb', 0, 6);
    expect(b).not.toEqual(a);
  });

  it('jumps straight to the shared round without replaying earlier ones', async () => {
    // Someone who played four rounds and shared the fifth, versus someone who
    // opened that link cold — both must see the same flag.
    const played = await revealRun('k3m9x2', 0, 5);
    const opened = await revealRun('k3m9x2', 4, 1);
    expect(opened[0]).toBe(played[4]);
  });

  it('reports a share position that reproduces the round in play', async () => {
    TestBed.resetTestingModule();
    configure();
    const game = TestBed.inject(RevealGameService);
    game.useChallenge('shareme', 0);
    await game.newRound();
    await game.newRound();
    await game.newRound();

    const { seed, index } = game.challenge;
    const replayed = await revealRun(seed, index, 1);
    expect(replayed[0]).toBe(game.answer()!.code);
  });

  it('gives Mosaic the same guarantee', async () => {
    const run = async () => {
      TestBed.resetTestingModule();
      configure();
      const game = TestBed.inject(MosaicGameService);
      game.useChallenge('mosaic1', 2);
      const codes: CountryCode[] = [];
      for (let i = 0; i < 4; i++) {
        await game.newRound();
        codes.push(game.answer()!.code);
      }
      return codes;
    };
    expect(await run()).toEqual(await run());
  });

  it('deals a Scratch session of three identical flags, without repeats', async () => {
    const run = async () => {
      TestBed.resetTestingModule();
      configure();
      const game = TestBed.inject(ScratchGameService);
      game.useChallenge('party7', 0);
      await game.newSession();
      const codes = [game.answer()!.code];
      for (let i = 1; i < SCRATCH_ROUNDS_PER_SESSION; i++) {
        await game.advance();
        codes.push(game.answer()!.code);
      }
      return codes;
    };

    const mine = await run();
    expect(await run()).toEqual(mine);
    // A session that shows the same flag twice would be an obvious bug.
    expect(new Set(mine).size).toBe(SCRATCH_ROUNDS_PER_SESSION);
  });

  it('deals different flags for the same seed when hard mode differs', async () => {
    // This is why the share link has to carry the hard-mode flag: the setting
    // changes the answer pool, so the seed alone is not enough.
    const run = async (hard: boolean) => {
      TestBed.resetTestingModule();
      configure();
      TestBed.inject(SettingsService).setHardMode(hard);
      const game = TestBed.inject(RevealGameService);
      game.useChallenge('poolcheck', 0);
      const codes: CountryCode[] = [];
      for (let i = 0; i < 12; i++) {
        await game.newRound();
        codes.push(game.answer()!.code);
      }
      return codes;
    };

    expect(await run(true)).not.toEqual(await run(false));
  });

  it('keeps seeded answers inside the requested tiers', () => {
    const countries = TestBed.inject(CountryService);
    for (let index = 0; index < 200; index++) {
      const answer = countries.seededAnswer([Tier.Easy], 'tiers', index);
      expect(answer.tier).toBe(Tier.Easy);
    }
  });
});
