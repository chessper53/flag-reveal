/**
 * Colour Reveal page.
 *
 * Thin shell over {@link RevealGameService}: it renders the board, feeds
 * guesses in, and owns the keyboard contract — type, Enter to guess, Enter
 * again to start the next round.
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
import { FAMILY_INFO } from '../../core/models/color.model';
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
import { GuessRejection, REVEAL_MAX_ATTEMPTS, RoundStatus } from '../../core/models/game.model';
import { RevealGameService } from '../../core/services/reveal-game.service';
import { CountryPicker } from '../../shared/country-picker/country-picker';
import { FlagBoard } from '../../shared/flag-board/flag-board';
import { Icon } from '../../shared/icon/icon';
import { ResultBanner } from '../../shared/result-banner/result-banner';

@Component({
  selector: 'app-reveal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FlagBoard, CountryPicker, ResultBanner, Icon],
  templateUrl: './reveal-page.html',
  styleUrl: './reveal-page.scss',
})
export class RevealPage implements OnInit {
  protected readonly game = inject(RevealGameService);
  protected readonly RoundStatus = RoundStatus;
  protected readonly maxAttempts = REVEAL_MAX_ATTEMPTS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly countries = inject(CountryService);
  protected readonly settings = inject(SettingsService);

  /** Transient message under the input ("already guessed", "no such country"). */
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
  /** Bumped whenever the input should be refocused. */
  protected readonly focusTick = signal(0);

  /** One slot per attempt, so the tracker can show spent and remaining guesses. */
  protected readonly attemptSlots = computed(() => {
    const guesses = this.game.guesses();
    return Array.from({ length: REVEAL_MAX_ATTEMPTS }, (_, index) => guesses[index] ?? null);
  });

  protected readonly revealedPercent = computed(() => Math.round(this.game.revealedRatio() * 100));

  protected readonly resultHeadline = computed(() =>
    this.game.status() === RoundStatus.Won
      ? `Solved in ${this.game.attemptsUsed()}`
      : 'Out of guesses',
  );

  protected readonly resultDetail = computed(() => {
    const used = this.game.attemptsUsed();
    return this.game.status() === RoundStatus.Won
      ? `${used} of ${REVEAL_MAX_ATTEMPTS} guesses used.`
      : 'Here it is in full — next one is waiting.';
  });

  ngOnInit(): void {
    this.applyChallengeFromUrl();
    this.playAgain();
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
    const link = buildShareLink('play/reveal', seed, index, this.settings.hardMode());
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

  /** Enter restarts once the round is over, wherever focus happens to be. */
  @HostListener('document:keydown.enter')
  protected onGlobalEnter(): void {
    if (this.game.isOver() && this.canReplay()) {
      this.playAgain();
    }
  }

  protected async onPicked(country: Country): Promise<void> {
    const outcome = await this.game.submit(country);
    if (outcome.accepted) {
      this.notice.set('');
      return;
    }
    this.notice.set(REJECTION_MESSAGES[outcome.reason]);
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

  protected familyHex(family: number): string {
    return FAMILY_INFO[family as keyof typeof FAMILY_INFO].hex;
  }

  protected familyName(family: number): string {
    return FAMILY_INFO[family as keyof typeof FAMILY_INFO].name;
  }
}

const SHARE_IDLE_LABEL = 'Share this flag';

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still loading the flag…',
};
