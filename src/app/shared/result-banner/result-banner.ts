/**
 * End-of-round panel, shared by both modes.
 *
 * Shows what the flag was and how it went, and owns the "play again" affordance
 * — including the Enter hint, since both modes bind Enter to a fresh round.
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Country, flagAssetUrl } from '../../core/models/flag.model';
import { RoundStatus } from '../../core/models/game.model';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-result-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <section
      class="result"
      [class.result--won]="status() === RoundStatus.Won"
      [class.result--lost]="status() === RoundStatus.Lost"
      role="status"
      aria-live="polite"
    >
      <img class="result__flag" [src]="flagUrl()" [alt]="'Flag of ' + answer().name" />

      <div class="result__body">
        <span class="result__headline">
          @if (status() === RoundStatus.Won) {
            <app-icon name="trophy" /> {{ headline() }}
          } @else {
            {{ headline() }}
          }
        </span>
        <h2 class="result__answer">{{ answer().name }}</h2>
        <p class="result__detail">{{ detail() }}</p>
      </div>

      <div class="result__actions">
        <button class="btn result__share" type="button" (click)="share.emit()">
          {{ shareLabel() }}
        </button>
        <button
          class="btn btn--primary result__again"
          type="button"
          [disabled]="!ready()"
          (click)="playAgain.emit()"
        >
          {{ actionLabel() }}
          <kbd class="result__kbd">Enter</kbd>
        </button>
      </div>
    </section>
  `,
  styleUrl: './result-banner.scss',
})
export class ResultBanner {
  readonly status = input.required<RoundStatus>();
  readonly answer = input.required<Country>();
  /** Short verdict, e.g. "Solved in 3". */
  readonly headline = input('');
  /** Supporting line, e.g. the score breakdown. */
  readonly detail = input('');
  /**
   * False while the board is still playing its final reveal. The button stays
   * disabled so the answer cannot be skipped past before it is visible.
   */
  readonly ready = input(true);
  /** Button text; modes played in sessions say "Next flag" instead. */
  readonly actionLabel = input('Play again');
  /** Share button text, so the page can flip it to a confirmation. */
  readonly shareLabel = input('Share');

  readonly playAgain = output<void>();
  /** Asks the page to build and copy a link to this exact challenge. */
  readonly share = output<void>();

  protected readonly RoundStatus = RoundStatus;

  protected flagUrl(): string {
    return flagAssetUrl(this.answer().code);
  }
}
