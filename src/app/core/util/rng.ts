/**
 * Deterministic random numbers, so a round can be shared.
 *
 * Every round is dealt from a seed plus an index rather than `Math.random()`,
 * which means two players opening the same link get the same flags in the same
 * order. The seed is short and typeable because it ends up in a URL people
 * paste to each other.
 */

/** Characters used in generated seeds: unambiguous when read aloud or typed. */
const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Length of a generated seed. 31^6 ≈ 887 million, plenty for sharing. */
const SEED_LENGTH = 6;

/** Creates a fresh random seed for a player who has not opened a shared link. */
export function randomSeed(): string {
  let seed = '';
  for (let i = 0; i < SEED_LENGTH; i++) {
    seed += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  }
  return seed;
}

/**
 * Normalises whatever arrived in the URL. Seeds are compared as lowercase and
 * stripped of anything outside the alphabet, so "ABC-123" and "abc123" are the
 * same challenge and a mangled paste still plays.
 */
export function normalizeSeed(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.slice(0, 16) || randomSeed();
}

/** xmur3: string → 32-bit hash, used to turn a seed into RNG state. */
function hashString(value: string): number {
  let h = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: small, fast, good enough for dealing flags. */
export function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generator for one specific round of one specific seed.
 *
 * Mixing the index into the hash rather than advancing a shared stream means
 * round 7 can be dealt without dealing rounds 1–6 first — which is what lets a
 * share link jump straight to the round being shared.
 */
export function rngFor(seed: string, index: number): () => number {
  return mulberry32(hashString(`${seed}:${index}`));
}
