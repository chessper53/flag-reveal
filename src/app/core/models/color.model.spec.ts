import { describe, expect, it } from 'vitest';
import { ColorFamily, classifyRgb } from './color.model';

/** Helper: classify an `#rrggbb` string. */
function classify(hex: string): ColorFamily {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return classifyRgb((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

describe('classifyRgb', () => {
  it('buckets the reds of different flags together', () => {
    // This is the rule the Reveal mode rests on: Switzerland's red has to
    // match France's red, or guessing one would never uncover the other.
    expect(classify('#FF0000')).toBe(ColorFamily.Red); // Switzerland
    expect(classify('#EF4135')).toBe(ColorFamily.Red); // France
    expect(classify('#C8102E')).toBe(ColorFamily.Red); // Denmark
    expect(classify('#BC002D')).toBe(ColorFamily.Red); // Japan
  });

  it('separates blue from light blue', () => {
    expect(classify('#0055A4')).toBe(ColorFamily.Blue); // France
    expect(classify('#75AADB')).toBe(ColorFamily.Cyan); // Argentina
  });

  it('recognises the neutrals', () => {
    expect(classify('#FFFFFF')).toBe(ColorFamily.White);
    expect(classify('#F4F5F7')).toBe(ColorFamily.White);
    expect(classify('#000000')).toBe(ColorFamily.Black);
    expect(classify('#111318')).toBe(ColorFamily.Black);
  });

  it('keeps the other flag colours apart', () => {
    expect(classify('#009639')).toBe(ColorFamily.Green);
    expect(classify('#FCD116')).toBe(ColorFamily.Yellow);
    expect(classify('#FF6E00')).toBe(ColorFamily.Orange);
    expect(classify('#8A1538')).toBe(ColorFamily.Maroon); // Qatar
  });

  it('never returns Unknown for an opaque colour', () => {
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          expect(classifyRgb(r, g, b)).not.toBe(ColorFamily.Unknown);
        }
      }
    }
  });
});
