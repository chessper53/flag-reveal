/**
 * Per-mode statistics, persisted to localStorage.
 *
 * Storage is best-effort: private browsing, disabled storage or corrupt JSON
 * all degrade to "no stats this session" rather than breaking the game.
 */

import { Injectable, signal } from '@angular/core';
import { EMPTY_STATS, GameModeId, ModeStats } from '../models/game.model';
import { CountryCode } from '../models/flag.model';

const STORAGE_KEY = 'flag-reveal.stats.v1';

/** How many past answers to remember when avoiding repeats. */
const SEEN_HISTORY = 40;

type StatsByMode = Partial<Record<GameModeId, ModeStats>>;

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly state = signal<StatsByMode>(readStored());

  /** Reactive stats for a mode; never `undefined`. */
  statsFor(mode: GameModeId): ModeStats {
    return this.state()[mode] ?? EMPTY_STATS;
  }

  /** Snapshot signal, for components that want to react to any change. */
  readonly all = this.state.asReadonly();

  /**
   * Records a finished round.
   *
   * Note this does *not* touch `bestScore`: for modes played in sessions, a
   * personal best is a session total, recorded by {@link recordSession}.
   *
   * @param attemptsUsed 1-based number of guesses spent, for the distribution.
   * @param score points earned, for modes that score.
   */
  recordRound(
    mode: GameModeId,
    outcome: { won: boolean; attemptsUsed: number; answer: CountryCode; score?: number },
  ): void {
    this.state.update((current) => {
      const previous = current[mode] ?? EMPTY_STATS;
      const winsByAttempt = [...previous.winsByAttempt];
      if (outcome.won) {
        const bucket = Math.max(0, outcome.attemptsUsed - 1);
        winsByAttempt[bucket] = (winsByAttempt[bucket] ?? 0) + 1;
      }

      const score = outcome.score ?? 0;
      const next: ModeStats = {
        played: previous.played + 1,
        won: previous.won + (outcome.won ? 1 : 0),
        currentStreak: outcome.won ? previous.currentStreak + 1 : 0,
        bestStreak: outcome.won
          ? Math.max(previous.bestStreak, previous.currentStreak + 1)
          : previous.bestStreak,
        winsByAttempt,
        bestScore: previous.bestScore,
        totalScore: previous.totalScore + score,
        seenAnswers: [outcome.answer, ...previous.seenAnswers].slice(0, SEEN_HISTORY),
      };

      const updated = { ...current, [mode]: next };
      writeStored(updated);
      return updated;
    });
  }

  /** Records the combined score of a finished session as a personal best. */
  recordSession(mode: GameModeId, total: number): void {
    this.state.update((current) => {
      const previous = current[mode] ?? EMPTY_STATS;
      const updated = {
        ...current,
        [mode]: { ...previous, bestScore: Math.max(previous.bestScore, total) },
      };
      writeStored(updated);
      return updated;
    });
  }

  reset(mode: GameModeId): void {
    this.state.update((current) => {
      const updated = { ...current, [mode]: EMPTY_STATS };
      writeStored(updated);
      return updated;
    });
  }
}

function readStored(): StatsByMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StatsByMode) : {};
  } catch {
    return {};
  }
}

function writeStored(stats: StatsByMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable — the session still plays fine without persistence.
  }
}
