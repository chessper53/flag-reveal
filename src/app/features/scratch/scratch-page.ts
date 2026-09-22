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
    const opener =
      this.game.status() === RoundStatus.Won
        ? `Recognised it with ${scratched}% rubbed away.`
        : `The cover is off — you had rubbed ${scratched}%.`;
    return `${opener} ${this.game.sessionTotal()} points banked.`;
  });

  ngOnInit(): void {
    void this.game.newSession(this.forcedAnswer());
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
    void this.game
      .advance(this.forcedAnswer())
      .then(() => this.focusTick.update((tick) => tick + 1));
  }

  /** Abandons the current session and deals a fresh set of three flags. */
  protected restartSession(): void {
    this.notice.set('');
    void this.game
      .newSession(this.forcedAnswer())
      .then(() => this.focusTick.update((tick) => tick + 1));
  }
}

const REJECTION_MESSAGES: Record<GuessRejection, string> = {
  [GuessRejection.RoundOver]: 'This round is over — press Enter for a new flag.',
  [GuessRejection.UnknownCountry]: 'That country is not in the list.',
  [GuessRejection.AlreadyGuessed]: 'You already guessed that one.',
  [GuessRejection.NotReady]: 'Still loading the flag…',
};
