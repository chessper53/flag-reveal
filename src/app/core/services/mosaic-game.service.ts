/**
 * Mosaic mode — the hard one.
 *
 * The flag is drawn as a handful of enormous blocks and sharpens by one rung
 * of {@link MOSAIC_STEPS} per wrong guess. Three things make this the hardest
 * mode in the game, all of them on purpose:
 *
 *   1. The ladder starts at two blocks — a colour scheme, not a flag.
 *   2. It tops out at twelve blocks, so the flag is never simply legible; the
 *      last guess still has to be earned.
 *   3. The answer is drawn from **every** country, not just the well-known
 *      tiers the other modes use.
 *
 * Unlike Reveal, nothing here compares two flags, so this engine needs no
 * rasterised grids at all — only the answer and a rung on the ladder.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { Country, Tier } from '../models/flag.model';
import {
  GameModeId,
  Guess,
  GuessOutcome,
  GuessRejection,
  MOSAIC_MAX_ATTEMPTS,
  MOSAIC_STEPS,
  RoundStatus,
} from '../models/game.model';
import { CountryService } from './country.service';
import { StatsService } from './stats.service';

/** Every country is fair game — this is the mode that does not go easy. */
const ANSWER_TIERS = [Tier.Easy, Tier.Medium, Tier.Hard] as const;

@Injectable({ providedIn: 'root' })
export class MosaicGameService {
  private readonly countries = inject(CountryService);
  private readonly stats = inject(StatsService);

  private readonly answerState = signal<Country | null>(null);
  private readonly guessesState = signal<readonly Guess[]>([]);
  private readonly statusState = signal<RoundStatus>(RoundStatus.Playing);

  readonly answer = this.answerState.asReadonly();
  readonly guesses = this.guessesState.asReadonly();
  readonly status = this.statusState.asReadonly();

  readonly attemptsUsed = computed(() => this.guessesState().length);
  readonly attemptsLeft = computed(() => MOSAIC_MAX_ATTEMPTS - this.attemptsUsed());
  readonly isOver = computed(() => this.statusState() !== RoundStatus.Playing);
  /** No artwork to rasterise, so a round is playable the moment it is dealt. */
  readonly ready = computed(() => this.answerState() !== null);

  /** Blocks across at the current rung of the ladder. */
  readonly columns = computed(
    () => MOSAIC_STEPS[Math.min(this.attemptsUsed(), MOSAIC_STEPS.length - 1)],
  );

  /** 1-based rung, for the "step 2 of 5" readout. */
  readonly step = computed(() => Math.min(this.attemptsUsed() + 1, MOSAIC_STEPS.length));

  /**
   * Starts a fresh round.
   *
   * @param forced pins the answer instead of drawing one at random, which is
   *   what the `?flag=XX` query parameter uses to share or replay a round.
   */
  async newRound(forced?: Country): Promise<void> {
    const seen = this.stats.statsFor(GameModeId.Mosaic).seenAnswers;
    const answer = forced ?? this.countries.randomAnswer([...ANSWER_TIERS], seen);

    this.answerState.set(answer);
    this.guessesState.set([]);
    this.statusState.set(RoundStatus.Playing);
  }

  /** Submits a guess; a wrong one spends a rung of the ladder. */
  submit(country: Country): GuessOutcome {
    const answer = this.answerState();
    if (!answer) {
      return { accepted: false, reason: GuessRejection.NotReady };
    }
    if (this.isOver()) {
      return { accepted: false, reason: GuessRejection.RoundOver };
    }
    if (this.guessesState().some((guess) => guess.country.code === country.code)) {
      return { accepted: false, reason: GuessRejection.AlreadyGuessed };
    }

    const isCorrect = country.code === answer.code;
    const guess: Guess = {
      index: this.guessesState().length + 1,
      country,
      isCorrect,
      matchRatio: 0,
      totalRevealed: 0,
      sharedFamilies: [],
    };
    this.guessesState.update((guesses) => [...guesses, guess]);

    if (isCorrect) {
      this.finish(RoundStatus.Won);
    } else if (guess.index >= MOSAIC_MAX_ATTEMPTS) {
      this.finish(RoundStatus.Lost);
    }

    return { accepted: true, guess };
  }

  giveUp(): void {
    if (this.isOver() || !this.answerState()) {
      return;
    }
    this.finish(RoundStatus.Lost);
  }

  private finish(status: RoundStatus): void {
    this.statusState.set(status);
    const answer = this.answerState();
    if (!answer) {
      return;
    }
    this.stats.recordRound(GameModeId.Mosaic, {
      won: status === RoundStatus.Won,
      attemptsUsed: this.guessesState().length,
      answer: answer.code,
    });
  }
}
