/**
 * Inline icon set.
 *
 * Small and hand-rolled rather than a dependency: the app needs six glyphs,
 * and inlining them keeps the bundle free of an icon font and the network free
 * of an extra request. All icons share a 24×24 box and are stroked, so they
 * inherit `currentColor` and line up optically.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName =
  'grid' | 'mosaic' | 'brush' | 'back' | 'refresh' | 'flag' | 'trophy' | 'close' | 'enter';

const PATHS: Record<IconName, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  mosaic: 'M4 4h9v9H4zM15 4h5v5h-5zM15 11h5v9h-5zM4 15h9v5H4z',
  brush: 'M4 20c3 1 5-1 5-3.5M9.5 16.5 19 7a2.1 2.1 0 0 0-3-3L6.5 13.5M4 20a2.5 2.5 0 0 1 2.5-6.5',
  back: 'M15 5l-7 7 7 7',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 14v6',
  close: 'M6 6l12 12M18 6 6 18',
  enter: 'M20 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1.25em;
      height: 1.25em;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => PATHS[this.name()]);
}
