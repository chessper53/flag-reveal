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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Country, flagAssetUrl } from '../../core/models/flag.model';
import { CountryService } from '../../core/services/country.service';
import { createReplayArming } from '../../core/util/replay-arming';
import {
  GuessRejection,
  RoundStatus,
  SCRATCH_MAX_ATTEMPTS,
  SCRATCH_MAX_SCORE,
} from '../../core/models/game.model';
import { GRID_WIDTH } from '../../core/services/flag-grid.service';
import { ScratchGameService } from '../../core/services/scratch-game.service';
import { BoardPoint, FlagBoard } from '../../shared/flag-board/flag-board';
import { CountryPicker } from '../../shared/country-picker/country-picker';
import { Icon } from '../../shared/icon/icon';
import { ResultBanner } from '../../shared/result-banner/result-banner';

/** Brush radius as a fraction of board width, so it scales with the grid. */
const BRUSH_FRACTION = 0.021;

@Component({
  selector: 'app-scratch-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FlagBoard, CountryPicker, ResultBanner, Icon],
  templateUrl: './scratch-page.html',
  styleUrl: './scratch-page.scss',
})
export class ScratchPage implements OnInit {
  protected readonly game = inject(ScratchGameService);
  protected readonly RoundStatus = RoundStatus;
  protected readonly maxAttempts = SCRATCH_MAX_ATTEMPTS;
  protected readonly maxScore = SCRATCH_MAX_SCORE;

  private readonly route = inject(ActivatedRoute);
  private readonly countries = inject(CountryService);

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
    return this.game.status() === RoundStatus.Won
      ? `Recognised it with ${scratched}% rubbed away.`
      : `The cover is off — you had rubbed ${scratched}% of it.`;
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
  [GuessRejection.NotReady]: 'Still loading the flag…',
};
