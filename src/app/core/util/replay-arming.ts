/**
 * Keeps a finished round on screen long enough to be seen.
 *
 * When a round ends the board plays its final reveal, and the player is
 * usually still holding the Enter key that submitted the last guess. Without a
 * guard that keystroke — or an eager second one — skips straight past the
 * answer. So "play again" stays disarmed until the reveal has played out, and
 * only then does Enter mean "next round".
 */

import { Signal, effect, signal } from '@angular/core';

/**
 * How long the finished flag holds the screen. Comfortably longer than the
 * board's fade so the flag is fully painted before the next round is offered.
 */
export const REVEAL_GRACE_MS = 1100;

/**
 * Returns a signal that turns true once the finished round has been on screen
 * for {@link REVEAL_GRACE_MS}, and false again as soon as a new round starts.
 *
 * Must be called from an injection context (a component field initialiser).
 */
export function createReplayArming(isOver: Signal<boolean>): Signal<boolean> {
  const armed = signal(false);

  effect((onCleanup) => {
    if (!isOver()) {
      armed.set(false);
      return;
    }
    const handle = setTimeout(() => armed.set(true), REVEAL_GRACE_MS);
    onCleanup(() => clearTimeout(handle));
  });

  return armed.asReadonly();
}
