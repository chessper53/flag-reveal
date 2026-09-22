/**
 * Game model — mode-agnostic pieces plus per-mode round state.
 *
 * The menu renders {@link GameModeDescriptor} entries, so adding a mode means
 * registering a descriptor and a route; the menu never learns what a mode does.
 * Both current modes share the same shape: a secret {@link Country}, a board
 * that starts blank, and a rule for how cells become visible.
 */

import { ColorFamily } from './color.model';
import { Country, CountryCode } from './flag.model';

export enum GameModeId {
  /** Five guesses; cells whose colour family matches the answer stay revealed. */
  Reveal = 'reveal',
  /** Rub the board open with the cursor; the more you uncover, the less you score. */
  Scratch = 'scratch',
  /** The flag as a coarse mosaic that sharpens one step per wrong guess. */
  Mosaic = 'mosaic',
}

/** Menu metadata for a mode. */
export interface GameModeDescriptor {
  readonly id: GameModeId;
  readonly title: string;
  readonly tagline: string;
  readonly description: string;
  /** Key into the shared icon set. */
  readonly icon: string;
  /** Router path, relative to the app root. */
  readonly route: string;
  readonly available: boolean;
  /** Accent colour for the menu card, `#rrggbb`. */
  readonly accent: string;
}

/** Lifecycle of a single round. */
export enum RoundStatus {
  Playing = 'playing',
  Won = 'won',
  Lost = 'lost',
}

/** One submitted guess and what it uncovered. */
export interface Guess {
  /** 1-based position in the round. */
  readonly index: number;
  readonly country: Country;
  readonly isCorrect: boolean;
  /** Share of the board this guess uncovered on its own, 0..1. */
  readonly matchRatio: number;
  /** Share of the board uncovered in total after this guess, 0..1. */
  readonly totalRevealed: number;
  /** Colour families this guess shares with the answer, for the chips. */
  readonly sharedFamilies: readonly ColorFamily[];
}

/** Why a guess was rejected, so the UI can explain itself. */
export enum GuessRejection {
  RoundOver = 'roundOver',
  UnknownCountry = 'unknownCountry',
  AlreadyGuessed = 'alreadyGuessed',
  NotReady = 'notReady',
}

export type GuessOutcome =
  | { readonly accepted: true; readonly guess: Guess }
  | { readonly accepted: false; readonly reason: GuessRejection };

/** Aggregate stats per mode, persisted in localStorage. */
export interface ModeStats {
  readonly played: number;
  readonly won: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** Wins bucketed by attempts used: index 0 is a first-guess win. */
  readonly winsByAttempt: readonly number[];
  /** Best single-round score, for modes that score (Scratch). */
  readonly bestScore: number;
  /** Running total of points earned. */
  readonly totalScore: number;
  /** Codes already used as answers, so a session does not repeat itself. */
  readonly seenAnswers: readonly CountryCode[];
}

export const EMPTY_STATS: ModeStats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  winsByAttempt: [],
  bestScore: 0,
  totalScore: 0,
  seenAnswers: [],
};

/** Attempts allowed in a Reveal round. */
export const REVEAL_MAX_ATTEMPTS = 5;

/** Points awarded for a Scratch round with nothing rubbed away. */
export const SCRATCH_MAX_SCORE = 1000;

/** Guesses allowed in a Scratch round before it is lost. */
export const SCRATCH_MAX_ATTEMPTS = 3;

/**
 * Flags per Scratch session. A session is the unit players compare: three
 * rounds, then one combined score out of {@link SCRATCH_MAX_SESSION_SCORE}.
 */
export const SCRATCH_ROUNDS_PER_SESSION = 3;

export const SCRATCH_MAX_SESSION_SCORE = SCRATCH_MAX_SCORE * SCRATCH_ROUNDS_PER_SESSION;

/**
 * The Mosaic ladder: how many blocks wide the flag is drawn, per guess spent.
 *
 * Deliberately unfair at the top — two blocks is barely a colour scheme — and
 * it never reaches a resolution where the flag is simply legible. The last
 * rung is still a 12-block smear, so the final guess should cost you something
 * to make. Length of this array is the number of attempts.
 */
export const MOSAIC_STEPS: readonly number[] = [2, 3, 5, 8, 12];

export const MOSAIC_MAX_ATTEMPTS = MOSAIC_STEPS.length;

/** What one finished round contributed to the session. */
export interface SessionRound {
  /** 1-based position in the session. */
  readonly index: number;
  readonly country: Country;
  readonly won: boolean;
  readonly score: number;
  /** How much had been rubbed away when the round ended, 0..1. */
  readonly scratchedRatio: number;
}
