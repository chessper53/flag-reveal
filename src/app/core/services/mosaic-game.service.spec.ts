import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Continent, Country, Tier } from '../models/flag.model';
import { MOSAIC_MAX_ATTEMPTS, MOSAIC_STEPS, RoundStatus } from '../models/game.model';
import { MosaicGameService } from './mosaic-game.service';

const JAPAN: Country = {
  code: 'JP',
  name: 'Japan',
  continent: Continent.Asia,
  tier: Tier.Easy,
};

function other(code: string): Country {
  return { code, name: code, continent: Continent.Asia, tier: Tier.Hard };
}

describe('MosaicGameService', () => {
  let game: MosaicGameService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    game = TestBed.inject(MosaicGameService);
    await game.newRound(JAPAN);
  });

  it('opens on the coarsest rung of the ladder', () => {
    expect(game.columns()).toBe(MOSAIC_STEPS[0]);
    expect(game.step()).toBe(1);
    expect(game.attemptsLeft()).toBe(MOSAIC_MAX_ATTEMPTS);
    expect(game.status()).toBe(RoundStatus.Playing);
  });

  it('sharpens exactly one rung per wrong guess', () => {
    for (let i = 1; i < MOSAIC_STEPS.length; i++) {
      game.submit(other(`X${i}`));
      expect(game.columns()).toBe(MOSAIC_STEPS[i]);
      expect(game.step()).toBe(i + 1);
    }
  });

  it('never sharpens past the last rung', () => {
    for (let i = 0; i < MOSAIC_MAX_ATTEMPTS; i++) {
      game.submit(other(`X${i}`));
    }
    expect(game.columns()).toBe(MOSAIC_STEPS[MOSAIC_STEPS.length - 1]);
  });

  it('wins on the correct country', () => {
    game.submit(other('KR'));
    const outcome = game.submit(JAPAN);

    expect(outcome.accepted).toBe(true);
    expect(game.status()).toBe(RoundStatus.Won);
    expect(game.attemptsUsed()).toBe(2);
  });

  it('loses once the ladder runs out', () => {
    for (let i = 0; i < MOSAIC_MAX_ATTEMPTS; i++) {
      game.submit(other(`X${i}`));
    }
    expect(game.status()).toBe(RoundStatus.Lost);
    expect(game.attemptsLeft()).toBe(0);
  });

  it('rejects a repeated guess without spending a rung', () => {
    game.submit(other('KR'));
    const columns = game.columns();
    const outcome = game.submit(other('KR'));

    expect(outcome.accepted).toBe(false);
    expect(game.columns()).toBe(columns);
    expect(game.attemptsUsed()).toBe(1);
  });

  it('rejects guesses once the round is over', () => {
    game.submit(JAPAN);
    const outcome = game.submit(other('KR'));
    expect(outcome.accepted).toBe(false);
  });

  it('resets the ladder for a new round', async () => {
    game.submit(other('KR'));
    await game.newRound(JAPAN);

    expect(game.columns()).toBe(MOSAIC_STEPS[0]);
    expect(game.guesses()).toHaveLength(0);
    expect(game.status()).toBe(RoundStatus.Playing);
  });

  it('draws answers from every tier, obscure countries included', () => {
    // The pool is what makes this mode hard; a regression to the easy tiers
    // would be invisible in play but would change the game entirely.
    const drawn = new Set<Tier>();
    for (let i = 0; i < 400; i++) {
      void game.newRound();
      drawn.add(game.answer()!.tier);
    }
    expect(drawn.has(Tier.Hard)).toBe(true);
  });
});
