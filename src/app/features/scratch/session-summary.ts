/**
 * End-of-session panel: the three rounds and the combined score.
 *
 * This is the screen players actually compare with each other, so it leads
 * with the total and then accounts for it round by round.
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { flagAssetUrl } from '../../core/models/flag.model';
import { SCRATCH_MAX_SESSION_SCORE, SessionRound } from '../../core/models/game.model';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-session-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <section class="summary" role="status" aria-live="polite">
      <header class="summary__head">
        <span class="summary__eyebrow"><app-icon name="trophy" /> Session complete</span>
        <p class="summary__total">
          {{ total() }}<span class="summary__max">/ {{ maxScore }}</span>
        </p>
      </header>

      <ol class="summary__rounds">
        @for (round of rounds(); track round.index) {
          <li class="summary__round" [class.summary__round--missed]="!round.won">
            <img
              class="summary__flag"
              [src]="flagUrl(round)"
              [alt]="'Flag of ' + round.country.name"
            />
            <span class="summary__name">{{ round.country.name }}</span>
            <span class="summary__rubbed">{{ percent(round.scratchedRatio) }}% rubbed</span>
            <span class="summary__score">{{ round.won ? '+' + round.score : '—' }}</span>
          </li>
        }
      </ol>

      <div class="summary__actions">
        <button class="btn summary__share" type="button" (click)="share.emit()">
          {{ shareLabel() }}
        </button>
        <button
          class="btn btn--primary summary__again"
          type="button"
          [disabled]="!ready()"
          (click)="playAgain.emit()"
        >
          New session
          <kbd class="summary__kbd">Enter</kbd>
        </button>
      </div>
    </section>
  `,
  styleUrl: './session-summary.scss',
})
export class SessionSummary {
  readonly rounds = input.required<readonly SessionRound[]>();
  readonly total = input.required<number>();
  /** False while the last flag is still being revealed. */
  readonly ready = input(true);

  /** Share button text, so the page can flip it to a confirmation. */
  readonly shareLabel = input('Share these 3 flags');

  readonly playAgain = output<void>();
  /** Asks the page to build and copy a link to this exact session. */
  readonly share = output<void>();

  protected readonly maxScore = SCRATCH_MAX_SESSION_SCORE;

  protected flagUrl(round: SessionRound): string {
    return flagAssetUrl(round.country.code);
  }

  protected percent(ratio: number): number {
    return Math.round(ratio * 100);
  }
}
