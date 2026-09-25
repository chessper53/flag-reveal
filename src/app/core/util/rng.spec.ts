import { describe, expect, it } from 'vitest';
import { normalizeSeed, randomSeed, rngFor } from './rng';

describe('rngFor', () => {
  it('is deterministic for the same seed and index', () => {
    const a = rngFor('abc123', 4);
    const b = rngFor('abc123', 4);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between indexes of the same seed', () => {
    expect(rngFor('abc123', 0)()).not.toBe(rngFor('abc123', 1)());
  });

  it('differs between seeds at the same index', () => {
    expect(rngFor('abc123', 0)()).not.toBe(rngFor('xyz789', 0)());
  });

  it('produces values in [0, 1)', () => {
    const rng = rngFor('spread', 0);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads roughly evenly across buckets', () => {
    // A badly mixed hash would clump, which would make shared rounds boring.
    const counts = new Array(10).fill(0);
    for (let index = 0; index < 2000; index++) {
      counts[Math.floor(rngFor('spread', index)() * 10)]++;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(120);
    }
  });
});

describe('seed handling', () => {
  it('generates seeds from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomSeed()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
    }
  });

  it('normalises case and punctuation so a mangled paste still plays', () => {
    expect(normalizeSeed('ABC-123')).toBe('abc123');
    expect(normalizeSeed('  k3m9x2  ')).toBe('k3m9x2');
  });

  it('falls back to a fresh seed when nothing usable is left', () => {
    expect(normalizeSeed('!!!')).toMatch(/^[a-z0-9]{6}$/);
  });
});
