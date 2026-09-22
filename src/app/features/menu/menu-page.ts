/**
 * The main menu: one card per registered mode, plus lifetime stats.
 *
 * It knows nothing about how any mode plays — it renders
 * {@link GAME_MODES} and links to each route.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAME_MODES } from '../../core/data/modes';
import { GameModeDescriptor } from '../../core/models/game.model';
import { StatsService } from '../../core/services/stats.service';
import { Icon, IconName } from '../../shared/icon/icon';

@Component({
  selector: 'app-menu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './menu-page.html',
  styleUrl: './menu-page.scss',
})
export class MenuPage {
  private readonly stats = inject(StatsService);

  protected readonly modes = GAME_MODES;

  /** Per-mode summary shown on each card. */
  protected readonly summaries = computed(() => {
    this.stats.all();
    return new Map(
      GAME_MODES.map((mode) => {
        const stats = this.stats.statsFor(mode.id);
        return [mode.id, stats] as const;
      }),
    );
  });

  protected iconFor(mode: GameModeDescriptor): IconName {
    return mode.icon as IconName;
  }

  protected winRate(played: number, won: number): number {
    return played === 0 ? 0 : Math.round((won / played) * 100);
  }
}
