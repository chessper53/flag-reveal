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
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  private readonly countries = inject(CountryService);
  protected readonly settings = inject(SettingsService);

  protected readonly canReplay = createReplayArming(this.game.isOver);
  protected readonly notice = signal('');
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
    void this.game.newRound(this.forcedAnswer());
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
    void this.game
      .newRound(this.forcedAnswer())
      .then(() => this.focusTick.update((tick) => tick + 1));
  }
}

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still dealing the flag…',
};
