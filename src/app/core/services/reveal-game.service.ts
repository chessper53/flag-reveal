/**
 * Reveal mode.
 *
 * The board starts blank. Each guess is rasterised and compared with the
 * answer cell by cell: wherever the two flags share a colour family, the
 * answer's real pixel is painted in and stays for the rest of the round.
 * Guess Switzerland against France and France's red band lights up.
 *
 * State is exposed as signals; the components are pure renderers of it.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { ColorFamily, isNotableFamily } from '../models/color.model';
import { Country, FlagGrid, Tier } from '../models/flag.model';
import {
  GameModeId,
  Guess,
  GuessOutcome,
  GuessRejection,
  REVEAL_MAX_ATTEMPTS,
  RoundStatus,
} from '../models/game.model';
import { Mask, emptyMask, fullMask, maskRatio } from '../util/board-mask';
import { CountryService } from './country.service';
import { FlagGridService } from './flag-grid.service';
import { SettingsService } from './settings.service';
import { StatsService } from './stats.service';

/**
 * Tiers the answer is drawn from. Hard mode opens the pool to every country
 * in the catalogue instead of the ones most players can name on sight.
 */
const NORMAL_TIERS = [Tier.Easy, Tier.Medium] as const;
const HARD_TIERS = [Tier.Easy, Tier.Medium, Tier.Hard] as const;

@Injectable({ providedIn: 'root' })
export class RevealGameService {
  private readonly countries = inject(CountryService);
  private readonly grids = inject(FlagGridService);
  private readonly stats = inject(StatsService);
  private readonly settings = inject(SettingsService);

  private readonly answerState = signal<Country | null>(null);
  private readonly answerGridState = signal<FlagGrid | null>(null);
  private readonly maskState = signal<Mask>(emptyMask());
  private readonly guessesState = signal<readonly Guess[]>([]);
  private readonly statusState = signal<RoundStatus>(RoundStatus.Playing);
  private readonly busyState = signal(false);

  readonly answer = this.answerState.asReadonly();
  readonly answerGrid = this.answerGridState.asReadonly();
  readonly mask = this.maskState.asReadonly();
  readonly guesses = this.guessesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  /** True while a flag is being fetched and rasterised. */
  readonly busy = this.busyState.asReadonly();

  readonly attemptsUsed = computed(() => this.guessesState().length);
  readonly attemptsLeft = computed(() => REVEAL_MAX_ATTEMPTS - this.attemptsUsed());
  readonly revealedRatio = computed(() => maskRatio(this.maskState()));
  readonly isOver = computed(() => this.statusState() !== RoundStatus.Playing);
  /** The round is playable once the answer's artwork has been rasterised. */
  readonly ready = computed(() => this.answerGridState() !== null);

  /**
   * Starts a fresh round.
   *
   * @param forced pins the answer instead of drawing one at random, which is
   *   what the `?flag=XX` query parameter uses to share or replay a round.
   */
  async newRound(forced?: Country): Promise<void> {
    const seen = this.stats.statsFor(GameModeId.Reveal).seenAnswers;
    const tiers = this.settings.hardMode() ? HARD_TIERS : NORMAL_TIERS;
    const answer = forced ?? this.countries.randomAnswer([...tiers], seen);

    this.answerState.set(answer);
    this.answerGridState.set(null);
    this.maskState.set(emptyMask());
    this.guessesState.set([]);
    this.statusState.set(RoundStatus.Playing);
    this.busyState.set(true);

    try {
      const grid = await this.grids.load(answer.code);
      // A newer round may have started while this one was loading.
      if (this.answerState() === answer) {
        this.answerGridState.set(grid);
      }
    } finally {
      this.busyState.set(false);
    }
  }

  /**
   * Submits a guess and uncovers every cell whose colour family matches.
   * Rejections are returned rather than thrown so the UI can show a hint.
   */
  async submit(country: Country): Promise<GuessOutcome> {
    const answer = this.answerState();
    const answerGrid = this.answerGridState();

    if (!answer || !answerGrid) {
      return { accepted: false, reason: GuessRejection.NotReady };
    }
    if (this.isOver()) {
      return { accepted: false, reason: GuessRejection.RoundOver };
    }
    if (this.guessesState().some((guess) => guess.country.code === country.code)) {
      return { accepted: false, reason: GuessRejection.AlreadyGuessed };
    }

    this.busyState.set(true);
    let guessGrid: FlagGrid;
    try {
      guessGrid = await this.grids.load(country.code);
    } finally {
      this.busyState.set(false);
    }

    const isCorrect = country.code === answer.code;
    const previousMask = this.maskState();
    const nextMask = isCorrect ? fullMask() : mergeMatches(previousMask, guessGrid, answerGrid);

    const matchedCells = countMatches(guessGrid, answerGrid);
    const guess: Guess = {
      index: this.guessesState().length + 1,
      country,
      isCorrect,
      matchRatio: matchedCells / answerGrid.families.length,
      totalRevealed: maskRatio(nextMask),
      sharedFamilies: sharedFamilies(guessGrid, answerGrid),
    };

    this.maskState.set(nextMask);
    this.guessesState.update((guesses) => [...guesses, guess]);

    if (isCorrect) {
      this.finish(RoundStatus.Won, guess.index);
    } else if (guess.index >= REVEAL_MAX_ATTEMPTS) {
      // Out of guesses: show the answer in full so the round has a payoff.
      this.maskState.set(fullMask());
      this.finish(RoundStatus.Lost, guess.index);
    }

    return { accepted: true, guess };
  }

  /** Ends the round early and shows the answer. */
  giveUp(): void {
    if (this.isOver() || !this.answerState()) {
      return;
    }
    this.maskState.set(fullMask());
    this.finish(RoundStatus.Lost, this.guessesState().length);
  }

  private finish(status: RoundStatus, attemptsUsed: number): void {
    this.statusState.set(status);
    const answer = this.answerState();
    if (!answer) {
      return;
    }
    this.stats.recordRound(GameModeId.Reveal, {
      won: status === RoundStatus.Won,
      attemptsUsed,
      answer: answer.code,
    });
  }
}

/** Adds every cell where the two flags agree on colour family to the mask. */
function mergeMatches(previous: Mask, guess: FlagGrid, answer: FlagGrid): Mask {
  const next = new Uint8Array(previous);
  for (let i = 0; i < next.length; i++) {
    if (guess.families[i] === answer.families[i]) {
      next[i] = 1;
    }
  }
  return next;
}

function countMatches(guess: FlagGrid, answer: FlagGrid): number {
  let matches = 0;
  for (let i = 0; i < answer.families.length; i++) {
    if (guess.families[i] === answer.families[i]) {
      matches++;
    }
  }
  return matches;
}

/** Colour families present in both flags, regardless of position. */
function sharedFamilies(guess: FlagGrid, answer: FlagGrid): readonly ColorFamily[] {
  const inGuess = familySet(guess);
  const inAnswer = familySet(answer);
  return [...inGuess].filter((family) => inAnswer.has(family)).sort((a, b) => a - b);
}

/**
 * Families covering a meaningful share of a flag. The threshold keeps
 * anti-aliasing leftovers and tiny emblem details out of the colour chips.
 */
function familySet(grid: FlagGrid): Set<ColorFamily> {
  const counts = new Map<ColorFamily, number>();
  for (const family of grid.families) {
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  const threshold = grid.families.length * 0.02;
  const families = new Set<ColorFamily>();
  for (const [family, count] of counts) {
    if (count >= threshold && isNotableFamily(family)) {
      families.add(family);
    }
  }
  return families;
}
