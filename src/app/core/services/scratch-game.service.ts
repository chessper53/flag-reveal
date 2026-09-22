/**
 * Scratch mode.
 *
 * The flag sits under an opaque layer that the player rubs away with the
 * pointer. Every uncovered cell costs points, so the game is a bet: rub until
 * you recognise it, but no further. Three guesses; a wrong one cuts the
 * multiplier rather than ending the round.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { Country, FlagGrid, Tier } from '../models/flag.model';
import {
  GameModeId,
  Guess,
  GuessOutcome,
  GuessRejection,
  RoundStatus,
  SCRATCH_MAX_ATTEMPTS,
  SCRATCH_MAX_SCORE,
} from '../models/game.model';
import { GRID_HEIGHT, GRID_WIDTH } from './flag-grid.service';
import { Mask, emptyMask, fullMask, maskRatio } from '../util/board-mask';
import { CountryService } from './country.service';
import { FlagGridService } from './flag-grid.service';
import { StatsService } from './stats.service';

const ANSWER_TIERS = [Tier.Easy, Tier.Medium] as const;

/**
 * Score multiplier by number of wrong guesses already made. Missing twice
 * still leaves something worth playing for.
 */
const ATTEMPT_MULTIPLIERS = [1, 0.7, 0.45] as const;

/** A correct guess is always worth at least this much, however much was rubbed. */
const MIN_WIN_SCORE = 25;

@Injectable({ providedIn: 'root' })
export class ScratchGameService {
  private readonly countries = inject(CountryService);
  private readonly grids = inject(FlagGridService);
  private readonly stats = inject(StatsService);

  private readonly answerState = signal<Country | null>(null);
  private readonly answerGridState = signal<FlagGrid | null>(null);
  private readonly maskState = signal<Mask>(emptyMask());
  private readonly guessesState = signal<readonly Guess[]>([]);
  private readonly statusState = signal<RoundStatus>(RoundStatus.Playing);
  private readonly finalScoreState = signal<number | null>(null);
  private readonly finalScratchedState = signal(0);
  private readonly busyState = signal(false);

  readonly answer = this.answerState.asReadonly();
  readonly answerGrid = this.answerGridState.asReadonly();
  readonly mask = this.maskState.asReadonly();
  readonly guesses = this.guessesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly busy = this.busyState.asReadonly();

  readonly scratchedRatio = computed(() => maskRatio(this.maskState()));
  readonly attemptsUsed = computed(() => this.guessesState().length);
  readonly attemptsLeft = computed(() => SCRATCH_MAX_ATTEMPTS - this.attemptsUsed());
  readonly isOver = computed(() => this.statusState() !== RoundStatus.Playing);
  readonly ready = computed(() => this.answerGridState() !== null);

  /**
   * What a correct guess would be worth right now. Shown live so the player
   * can watch the cost of every stroke.
   */
  readonly potentialScore = computed(() => {
    const multiplier = ATTEMPT_MULTIPLIERS[this.attemptsUsed()] ?? 0;
    const remaining = 1 - this.scratchedRatio();
    return Math.max(MIN_WIN_SCORE, Math.round(SCRATCH_MAX_SCORE * remaining * multiplier));
  });

  /** Points actually earned, once the round is over. */
  readonly finalScore = this.finalScoreState.asReadonly();

  /**
   * How much had been rubbed away when the round ended. Kept separately
   * because finishing uncovers the whole flag, which would otherwise report
   * every round as 100% rubbed.
   */
  readonly finalScratchedRatio = this.finalScratchedState.asReadonly();

  /**
   * Starts a fresh round.
   *
   * @param forced pins the answer instead of drawing one at random, which is
   *   what the `?flag=XX` query parameter uses to share or replay a round.
   */
  async newRound(forced?: Country): Promise<void> {
    const seen = this.stats.statsFor(GameModeId.Scratch).seenAnswers;
    const answer = forced ?? this.countries.randomAnswer([...ANSWER_TIERS], seen);

    this.answerState.set(answer);
    this.answerGridState.set(null);
    this.maskState.set(emptyMask());
    this.guessesState.set([]);
    this.statusState.set(RoundStatus.Playing);
    this.finalScoreState.set(null);
    this.finalScratchedState.set(0);
    this.busyState.set(true);

    try {
      const grid = await this.grids.load(answer.code);
      if (this.answerState() === answer) {
        this.answerGridState.set(grid);
      }
    } finally {
      this.busyState.set(false);
    }
  }

  /**
   * Rubs a circular patch centred on the given cell.
   *
   * Returns silently when the round is over or nothing changed, so the
   * component can call it freely on every pointer move.
   */
  rub(centerCol: number, centerRow: number, radius: number): void {
    if (this.isOver() || !this.ready()) {
      return;
    }

    const current = this.maskState();
    let next: Mask | null = null;
    const radiusSquared = radius * radius;

    const minRow = Math.max(0, Math.floor(centerRow - radius));
    const maxRow = Math.min(GRID_HEIGHT - 1, Math.ceil(centerRow + radius));
    const minCol = Math.max(0, Math.floor(centerCol - radius));
    const maxCol = Math.min(GRID_WIDTH - 1, Math.ceil(centerCol + radius));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const dx = col - centerCol;
        const dy = row - centerRow;
        if (dx * dx + dy * dy > radiusSquared) {
          continue;
        }
        const index = row * GRID_WIDTH + col;
        if (current[index] === 1) {
          continue;
        }
        // Copy lazily: most pointer moves land on cells that are already open.
        next ??= new Uint8Array(current);
        next[index] = 1;
      }
    }

    if (next) {
      this.maskState.set(next);
    }
  }

  submit(country: Country): GuessOutcome {
    const answer = this.answerState();
    if (!answer || !this.ready()) {
      return { accepted: false, reason: GuessRejection.NotReady };
    }
    if (this.isOver()) {
      return { accepted: false, reason: GuessRejection.RoundOver };
    }
    if (this.guessesState().some((guess) => guess.country.code === country.code)) {
      return { accepted: false, reason: GuessRejection.AlreadyGuessed };
    }

    const isCorrect = country.code === answer.code;
    const score = this.potentialScore();

    const guess: Guess = {
      index: this.guessesState().length + 1,
      country,
      isCorrect,
      matchRatio: 0,
      totalRevealed: this.scratchedRatio(),
      sharedFamilies: [],
    };
    this.guessesState.update((guesses) => [...guesses, guess]);

    if (isCorrect) {
      this.finish(RoundStatus.Won, score);
    } else if (guess.index >= SCRATCH_MAX_ATTEMPTS) {
      this.finish(RoundStatus.Lost, 0);
    }

    return { accepted: true, guess };
  }

  giveUp(): void {
    if (this.isOver() || !this.answerState()) {
      return;
    }
    this.finish(RoundStatus.Lost, 0);
  }

  private finish(status: RoundStatus, score: number): void {
    this.statusState.set(status);
    this.finalScoreState.set(score);
    this.finalScratchedState.set(this.scratchedRatio());
    // Whatever happened, the round ends with the flag on show.
    this.maskState.set(fullMask());

    const answer = this.answerState();
    if (!answer) {
      return;
    }
    this.stats.recordRound(GameModeId.Scratch, {
      won: status === RoundStatus.Won,
      attemptsUsed: this.guessesState().length,
      answer: answer.code,
      score,
    });
  }
}
