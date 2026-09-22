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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FAMILY_INFO } from '../../core/models/color.model';
import { Country, flagAssetUrl } from '../../core/models/flag.model';
import { CountryService } from '../../core/services/country.service';
import { createReplayArming } from '../../core/util/replay-arming';
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
  private readonly countries = inject(CountryService);

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
    this.playAgain();
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
    void this.game
      .newRound(this.forcedAnswer())
      .then(() => this.focusTick.update((tick) => tick + 1));
  }

  protected familyHex(family: number): string {
    return FAMILY_INFO[family as keyof typeof FAMILY_INFO].hex;
  }

  protected familyName(family: number): string {
    return FAMILY_INFO[family as keyof typeof FAMILY_INFO].name;
  }
}

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still loading the flag…',
};
