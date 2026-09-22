/**
 * The visibility mask shared by every mode.
 *
 * One byte per board cell: 0 hidden, 1 visible. Both modes differ only in what
 * causes a cell to flip — a matching colour family in Reveal, the cursor in
 * Scratch — so the bookkeeping lives here once.
 *
 * Mutations always produce a new array. Signals compare by reference, and a
 * 3 kB copy per guess is far cheaper than the alternatives.
 */

import { GRID_CELLS } from '../services/flag-grid.service';

export type Mask = Uint8Array;

export function emptyMask(): Mask {
  return new Uint8Array(GRID_CELLS);
}

export function fullMask(): Mask {
  return new Uint8Array(GRID_CELLS).fill(1);
}

/** Share of the board currently visible, 0..1. */
export function maskRatio(mask: Mask): number {
  let visible = 0;
  for (let i = 0; i < mask.length; i++) {
    visible += mask[i];
  }
  return visible / mask.length;
}

/** Number of cells visible in `next` that were hidden in `previous`. */
export function newlyVisible(previous: Mask, next: Mask): number {
  let count = 0;
  for (let i = 0; i < next.length; i++) {
    if (next[i] === 1 && previous[i] === 0) {
      count++;
    }
  }
  return count;
}
