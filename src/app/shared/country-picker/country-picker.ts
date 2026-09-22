/**
 * Country autocomplete with flag previews.
 *
 * The whole game is played from this one input, so it is built for keyboard
 * flow: type, arrow to a suggestion, Enter to submit, Enter again to play the
 * next round. Nothing here needs the mouse, and the previews make the list
 * scannable by shape rather than by reading every name.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Country, flagAssetUrl } from '../../core/models/flag.model';
import { CountryService } from '../../core/services/country.service';

/** How many suggestions the dropdown shows at once. */
const MAX_SUGGESTIONS = 7;

@Component({
  selector: 'app-country-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" [class.picker--open]="isOpen()">
      <div class="picker__field">
        <svg class="picker__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          #input
          class="picker__input"
          type="text"
          role="combobox"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          [attr.aria-expanded]="isOpen()"
          aria-autocomplete="list"
          aria-controls="country-options"
          [attr.aria-activedescendant]="activeId()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [value]="query()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (focus)="open()"
          (blur)="onBlur()"
        />
        @if (query()) {
          <button
            type="button"
            class="picker__clear"
            aria-label="Clear"
            (mousedown)="$event.preventDefault()"
            (click)="clear()"
          >
            ✕
          </button>
        }
      </div>

      @if (isOpen() && suggestions().length > 0) {
        <ul class="picker__list" id="country-options" role="listbox">
          @for (match of suggestions(); track match.country.code; let i = $index) {
            <li
              class="picker__option"
              role="option"
              [id]="'country-option-' + i"
              [attr.aria-selected]="i === activeIndex()"
              [class.picker__option--active]="i === activeIndex()"
              (mousedown)="$event.preventDefault()"
              (click)="choose(match.country)"
              (mouseenter)="activeIndex.set(i)"
            >
              @if (showPreviews()) {
                <img
                  class="picker__flag"
                  [src]="flagUrl(match.country)"
                  [alt]="''"
                  loading="lazy"
                  decoding="async"
                />
              } @else {
                <span class="picker__code">{{ match.country.code }}</span>
              }
              <span class="picker__name">{{ match.country.name }}</span>
              <span class="picker__continent">{{ match.country.continent }}</span>
            </li>
          }
        </ul>
      } @else if (isOpen() && query().length > 1) {
        <div class="picker__list picker__empty">No country matches “{{ query() }}”</div>
      }
    </div>
  `,
  styleUrl: './country-picker.scss',
})
export class CountryPicker {
  private readonly countries = inject(CountryService);

  readonly placeholder = input('Guess a country…');
  readonly disabled = input(false);
  /**
   * Flag thumbnails beside each suggestion. Hard mode turns these off: with
   * them, the list can be matched against the board by eye instead of from
   * memory, which is a different (and much easier) game.
   */
  readonly showPreviews = input(true);
  /** Focus the input whenever this value changes (a new round, say). */
  readonly focusTrigger = input<unknown>(null);

  /** A country the player committed to. */
  readonly picked = output<Country>();
  /** Enter pressed with text that matches nothing, so the page can nudge. */
  readonly rejected = output<string>();

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  private readonly openState = signal(false);

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly suggestions = computed(() =>
    this.countries.search(this.query(), MAX_SUGGESTIONS),
  );
  protected readonly isOpen = computed(
    () => this.openState() && !this.disabled() && this.query().length > 0,
  );
  protected readonly activeId = computed(() =>
    this.isOpen() ? `country-option-${this.activeIndex()}` : null,
  );

  constructor() {
    effect(() => {
      this.focusTrigger();
      // Defer so the input exists and is enabled by the time we focus it.
      queueMicrotask(() => this.focus());
    });
  }

  focus(): void {
    if (!this.disabled()) {
      this.inputRef().nativeElement.focus();
    }
  }

  clear(): void {
    this.query.set('');
    this.activeIndex.set(0);
    this.inputRef().nativeElement.value = '';
    this.focus();
  }

  protected flagUrl(country: Country): string {
    return flagAssetUrl(country.code);
  }

  protected open(): void {
    this.openState.set(true);
  }

  protected onBlur(): void {
    this.openState.set(false);
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
    this.openState.set(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Escape':
        this.openState.set(false);
        break;
      case 'Enter':
        event.preventDefault();
        this.commit();
        break;
      case 'Tab':
        // Tab completes to the highlighted suggestion without submitting.
        if (this.isOpen() && this.suggestions().length > 0) {
          event.preventDefault();
          this.query.set(this.suggestions()[this.activeIndex()].country.name);
          this.inputRef().nativeElement.value = this.query();
        }
        break;
    }
  }

  private move(delta: number): void {
    const total = this.suggestions().length;
    if (total === 0) {
      return;
    }
    this.openState.set(true);
    this.activeIndex.update((index) => (index + delta + total) % total);
  }

  /**
   * Enter takes the highlighted suggestion when the list is open, and
   * otherwise tries to resolve whatever was typed — so a player who types
   * "france" and hits Enter fast never has to look at the dropdown.
   */
  private commit(): void {
    const text = this.query().trim();
    if (!text) {
      return;
    }

    const suggestions = this.suggestions();
    if (this.isOpen() && suggestions.length > 0) {
      this.choose(suggestions[this.activeIndex()].country);
      return;
    }

    const resolved = this.countries.resolve(text);
    if (resolved) {
      this.choose(resolved);
    } else {
      this.rejected.emit(text);
    }
  }

  protected choose(country: Country): void {
    this.picked.emit(country);
    this.query.set('');
    this.activeIndex.set(0);
    this.openState.set(false);
    const element = this.inputRef().nativeElement;
    element.value = '';
    element.focus();
  }
}
