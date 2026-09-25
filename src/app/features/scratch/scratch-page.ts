/**
 * Scratch & Guess page.
 *
 * Pointer strokes on the board are forwarded to the engine as rub events; the
 * live score above the board falls as the cover comes off, which is the whole
 * tension of the mode. Keyboard contract matches Reveal: Enter guesses, and
 * Enter starts the next round once this one is done.
 */

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Country, flagAssetUrl } from '../../core/models/flag.model';
import { CountryService } from '../../core/services/country.service';
import { SettingsService } from '../../core/services/settings.service';
import { createReplayArming } from '../../core/util/replay-arming';
import { normalizeSeed } from '../../core/util/rng';
import {
  HARD_PARAM,
  ROUND_PARAM,
  SEED_PARAM,
  buildShareLink,
  copyText,
} from '../../core/util/share-link';
import {
  GuessRejection,
  RoundStatus,
  SCRATCH_MAX_ATTEMPTS,
  SCRATCH_MAX_SCORE,
  SCRATCH_MAX_SESSION_SCORE,
  SCRATCH_ROUNDS_PER_SESSION,
} from '../../core/models/game.model';
import { GRID_WIDTH } from '../../core/services/flag-grid.service';
import { ScratchGameService } from '../../core/services/scratch-game.service';
import { BoardPoint, FlagBoard } from '../../shared/flag-board/flag-board';
import { CountryPicker } from '../../shared/country-picker/country-picker';
import { Icon } from '../../shared/icon/icon';
import { ResultBanner } from '../../shared/result-banner/result-banner';
import { SessionSummary } from './session-summary';

/**
 * Brush radius in cells, expressed against the grid width so it survives a
 * change of resolution.
 *
 * Sized so one tap costs one point: a radius-2 disc covers ~13 of the 12 288
 * cells, or ~0.1% of the board, which is 1 point of the 1000 on offer.
 */
const BRUSH_RADIUS_CELLS = 2;
const BRUSH_FRACTION = BRUSH_RADIUS_CELLS / 128;

@Component({
  selector: 'app-scratch-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FlagBoard, CountryPicker, ResultBanner, SessionSummary, Icon],
  templateUrl: './scratch-page.html',
  styleUrl: './scratch-page.scss',
})
export class ScratchPage implements OnInit {
  protected readonly game = inject(ScratchGameService);
  protected readonly RoundStatus = RoundStatus;
  protected readonly maxAttempts = SCRATCH_MAX_ATTEMPTS;
  protected readonly maxScore = SCRATCH_MAX_SCORE;
  protected readonly maxSessionScore = SCRATCH_MAX_SESSION_SCORE;
  protected readonly roundsPerSession = SCRATCH_ROUNDS_PER_SESSION;

  /** One slot per session round, so the header can show progress at a glance. */
  protected readonly sessionSlots = computed(() => {
    const played = this.game.sessionRounds();
    return Array.from({ length: SCRATCH_ROUNDS_PER_SESSION }, (_, index) => played[index] ?? null);
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly countries = inject(CountryService);
  protected readonly settings = inject(SettingsService);

  /**
   * Artwork for the board. Only set once the answer's grid is rasterised, so
   * the board never shows the flag before the round is ready to play.
   */
  protected readonly flagUrl = computed(() => {
    const answer = this.game.answer();
    return answer && this.game.ready() ? flagAssetUrl(answer.code) : null;
  });

  /**
   * True once the finished flag has been on screen long enough to be seen.
   * Enter only starts the next round after that, so the reveal is never cut
   * short by the keystroke that ended the round.
   */
  protected readonly canReplay = createReplayArming(this.game.isOver);

  protected readonly notice = signal('');
  /** Share button text, flipped to a confirmation after a copy. */
  protected readonly shareLabel = signal(SHARE_IDLE_LABEL);
  protected readonly focusTick = signal(0);

  protected readonly scratchedPercent = computed(() =>
    Math.round(this.game.scratchedRatio() * 100),
  );

  /** Score bar fill, relative to a perfect round. */
  protected readonly scorePercent = computed(() => {
    const score = this.game.isOver() ? (this.game.finalScore() ?? 0) : this.game.potentialScore();
    return Math.round((score / SCRATCH_MAX_SCORE) * 100);
  });

  /** Rubbed share to report afterwards: frozen at the moment the round ended. */
  protected readonly finalScratchedPercent = computed(() =>
    Math.round(this.game.finalScratchedRatio() * 100),
  );

  protected readonly resultHeadline = computed(() =>
    this.game.status() === RoundStatus.Won
      ? `+${this.game.finalScore()} points`
      : 'No points this time',
  );

  protected readonly resultDetail = computed(() => {
    const scratched = this.finalScratchedPercent();
    const opener =
      this.game.status() === RoundStatus.Won
        ? `Recognised it with ${scratched}% rubbed away.`
        : `The cover is off — you had rubbed ${scratched}%.`;
    return `${opener} ${this.game.sessionTotal()} points banked.`;
  });

  ngOnInit(): void {
    this.applyChallengeFromUrl();
    void this.game.newSession(this.forcedAnswer()).then(() => this.syncUrlToChallenge());
  }

  /**
   * Reads a shared challenge out of the URL.
   *
   * Hard mode is applied first: it decides the answer pool, so the seed alone
   * would deal different flags to a player whose toggle happened to differ.
   */
  private applyChallengeFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    const hard = params.get(HARD_PARAM);
    if (hard !== null) {
      this.settings.setHardMode(hard === '1' || hard === 'true');
    }
    const seed = params.get(SEED_PARAM);
    if (seed) {
      const index = Number.parseInt(params.get(ROUND_PARAM) ?? '0', 10);
      this.game.useChallenge(normalizeSeed(seed), Number.isFinite(index) ? index : 0);
    }
  }

  /**
   * Writes the current challenge into the address bar.
   *
   * This makes the URL itself the share link, so a player can always copy it
   * by hand — the Share button is then a convenience rather than the only
   * route out. It also means a reload replays the same round instead of
   * silently dealing a different one.
   */
  private syncUrlToChallenge(): void {
    const { seed, index } = this.game.challenge;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [SEED_PARAM]: seed,
        [ROUND_PARAM]: index > 0 ? index : null,
        [HARD_PARAM]: this.settings.hardMode() ? 1 : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Copies a link that reproduces exactly what was just played. */
  protected async onShare(): Promise<void> {
    const { seed, index } = this.game.challenge;
    const link = buildShareLink('play/scratch', seed, index, this.settings.hardMode());
    const copied = await copyText(link);
    // A blocked clipboard is not a dead end: the address bar holds the link.
    this.shareLabel.set(copied ? 'Link copied!' : 'Copy from the address bar');
    setTimeout(() => this.shareLabel.set(SHARE_IDLE_LABEL), 2500);
  }

  /**
   * `?flag=FR` pins the round to one country, so a round can be shared or
   * replayed. Anything unrecognised falls back to a random answer.
   */
  private forcedAnswer(): Country | undefined {
    const code = this.route.snapshot.queryParamMap.get('flag');
    return code ? this.countries.find(code.toUpperCase()) : undefined;
  }

  @HostListener('document:keydown.enter')
  protected onGlobalEnter(): void {
    if (this.game.isOver() && this.canReplay()) {
      this.playAgain();
    }
  }

  protected onScratch(point: BoardPoint): void {
    this.game.rub(point.col, point.row, GRID_WIDTH * BRUSH_FRACTION);
  }

  protected onPicked(country: Country): void {
    const outcome = this.game.submit(country);
    this.notice.set(outcome.accepted ? '' : REJECTION_MESSAGES[outcome.reason]);
  }

  protected onRejected(text: string): void {
    this.notice.set(`No country called “${text}”.`);
  }

  /** Next flag of the session, or a fresh session once all three are played. */
  protected playAgain(): void {
    if (this.game.isOver() && !this.canReplay()) {
      return;
    }
    this.notice.set('');
    void this.game.advance(this.forcedAnswer()).then(() => {
      this.syncUrlToChallenge();
      this.focusTick.update((tick) => tick + 1);
    });
  }

  /** Abandons the current session and deals a fresh set of three flags. */
  protected restartSession(): void {
    this.notice.set('');
    void this.game.newSession(this.forcedAnswer()).then(() => {
      this.syncUrlToChallenge();
      this.focusTick.update((tick) => tick + 1);
    });
  }
}

const SHARE_IDLE_LABEL = 'Share these 3 flags';

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still loading the flag…',
};
