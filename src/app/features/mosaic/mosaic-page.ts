/**
 * Mosaic Ladder page.
 *
 * Thin shell over {@link MosaicGameService}. The board is handed a block count
 * rather than a mask while the round is live, and switches to the real flag
 * once it is over.
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
import {
  GuessRejection,
  MOSAIC_MAX_ATTEMPTS,
  MOSAIC_STEPS,
  RoundStatus,
} from '../../core/models/game.model';
import { CountryService } from '../../core/services/country.service';
import { SettingsService } from '../../core/services/settings.service';
import { MosaicGameService } from '../../core/services/mosaic-game.service';
import { createReplayArming } from '../../core/util/replay-arming';
import { normalizeSeed } from '../../core/util/rng';
import {
  HARD_PARAM,
  ROUND_PARAM,
  SEED_PARAM,
  buildShareLink,
  copyText,
} from '../../core/util/share-link';
import { fullMask } from '../../core/util/board-mask';
import { CountryPicker } from '../../shared/country-picker/country-picker';
import { FlagBoard } from '../../shared/flag-board/flag-board';
import { Icon } from '../../shared/icon/icon';
import { ResultBanner } from '../../shared/result-banner/result-banner';

@Component({
  selector: 'app-mosaic-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FlagBoard, CountryPicker, ResultBanner, Icon],
  templateUrl: './mosaic-page.html',
  styleUrl: './mosaic-page.scss',
})
export class MosaicPage implements OnInit {
  protected readonly game = inject(MosaicGameService);
  protected readonly RoundStatus = RoundStatus;
  protected readonly maxAttempts = MOSAIC_MAX_ATTEMPTS;
  protected readonly steps = MOSAIC_STEPS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly countries = inject(CountryService);
  protected readonly settings = inject(SettingsService);

  protected readonly canReplay = createReplayArming(this.game.isOver);
  protected readonly notice = signal('');
  /** Share button text, flipped to a confirmation after a copy. */
  protected readonly shareLabel = signal(SHARE_IDLE_LABEL);
  protected readonly focusTick = signal(0);

  protected readonly flagUrl = computed(() => {
    const answer = this.game.answer();
    return answer ? flagAssetUrl(answer.code) : null;
  });

  /** Block count while playing; `null` once the round is over, showing the flag. */
  protected readonly mosaicColumns = computed(() =>
    this.game.isOver() ? null : this.game.columns(),
  );

  /** The board only needs a mask for the final reveal. */
  protected readonly mask = fullMask();

  /** One slot per attempt, so the tracker shows spent and remaining guesses. */
  protected readonly attemptSlots = computed(() => {
    const guesses = this.game.guesses();
    return Array.from({ length: MOSAIC_MAX_ATTEMPTS }, (_, index) => guesses[index] ?? null);
  });

  protected readonly resultHeadline = computed(() =>
    this.game.status() === RoundStatus.Won
      ? `Solved at ${this.game.columns()} blocks`
      : 'Out of guesses',
  );

  protected readonly resultDetail = computed(() =>
    this.game.status() === RoundStatus.Won
      ? `${this.game.attemptsUsed()} of ${MOSAIC_MAX_ATTEMPTS} guesses used.`
      : 'Every country was in play on this one.',
  );

  ngOnInit(): void {
    this.applyChallengeFromUrl();
    void this.game.newRound(this.forcedAnswer()).then(() => this.syncUrlToChallenge());
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
    const link = buildShareLink('play/mosaic', seed, index, this.settings.hardMode());
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

  protected onPicked(country: Country): void {
    const outcome = this.game.submit(country);
    this.notice.set(outcome.accepted ? '' : REJECTION_MESSAGES[outcome.reason]);
  }

  protected onRejected(text: string): void {
    this.notice.set(`No country called “${text}”.`);
  }

  protected playAgain(): void {
    if (this.game.isOver() && !this.canReplay()) {
      return;
    }
    this.notice.set('');
    void this.game.newRound(this.forcedAnswer()).then(() => {
      this.syncUrlToChallenge();
      this.focusTick.update((tick) => tick + 1);
    });
  }
}

const SHARE_IDLE_LABEL = 'Share this flag';

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still dealing the flag…',
};
