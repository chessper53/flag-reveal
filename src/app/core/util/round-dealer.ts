/**
 * Deals the flags for a mode, deterministically, from a seed.
 *
 * Every mode owns one of these. It tracks three things: the seed, the index of
 * the next flag to deal, and where the round (or session) currently in play
 * started — that last one is what a share link points at, so the recipient
 * lands on exactly the challenge you were playing rather than the next one.
 *
 * Shared by all three modes so the sharing semantics cannot drift apart.
 */

import { Country, CountryCode, Tier } from '../models/flag.model';
import { CountryService } from '../services/country.service';
import { randomSeed } from './rng';

export class RoundDealer {
  private seedValue = randomSeed();
  /** Index of the next flag to deal. */
  private nextIndex = 0;
  /** Index the current round or session began at — the shareable position. */
  private startIndex = 0;
  /** Codes already dealt in this round or session, to avoid repeats. */
  private dealt: CountryCode[] = [];

  get seed(): string {
    return this.seedValue;
  }

  /** Index a share link should carry to reproduce what is being played now. */
  get shareIndex(): number {
    return this.startIndex;
  }

  /** Points the dealer at a specific challenge, e.g. from a share link. */
  configure(seed: string, startIndex: number): void {
    this.seedValue = seed;
    this.nextIndex = Math.max(0, Math.floor(startIndex));
    this.startIndex = this.nextIndex;
    this.dealt = [];
  }

  /**
   * Marks the start of a new round (or session, for modes that group them).
   * Everything dealt from here on is one shareable unit.
   */
  beginSession(): void {
    this.startIndex = this.nextIndex;
    this.dealt = [];
  }

  /**
   * Deals the next flag.
   *
   * Only codes dealt *within the current session* are excluded, never a
   * player's own history: the exclusion list has to be something both sides of
   * a shared link compute identically, or the two would drift apart.
   */
  deal(countries: CountryService, tiers: readonly Tier[]): Country {
    const country = countries.seededAnswer(tiers, this.seedValue, this.nextIndex, this.dealt);
    this.nextIndex++;
    this.dealt = [...this.dealt, country.code];
    return country;
  }
}
