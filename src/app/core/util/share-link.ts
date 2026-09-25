/**
 * Building and copying "play this exact challenge" links.
 *
 * A link carries three things: the seed, the position in that seed's sequence,
 * and whether hard mode was on. The last one matters more than it looks —
 * hard mode widens the answer pool, so without it the recipient would deal a
 * different flag from the same seed and the challenge would silently not be
 * the same one.
 */

/** Query parameter names, shared by the builder and the pages that read them. */
export const SEED_PARAM = 'seed';
export const ROUND_PARAM = 'r';
export const HARD_PARAM = 'hard';

/**
 * Absolute URL for a challenge. `route` is relative to the app's base href, so
 * this works unchanged under a project-site sub-path like `/flag-reveal/`.
 */
export function buildShareLink(
  route: string,
  seed: string,
  index: number,
  hardMode: boolean,
): string {
  const url = new URL(route, document.baseURI);
  url.searchParams.set(SEED_PARAM, seed);
  if (index > 0) {
    url.searchParams.set(ROUND_PARAM, String(index));
  }
  if (hardMode) {
    url.searchParams.set(HARD_PARAM, '1');
  }
  return url.toString();
}

/**
 * Copies text to the clipboard, falling back to a hidden textarea.
 *
 * The async clipboard API needs a secure context, which rules it out when the
 * game is served over plain HTTP on a local network — exactly the case where
 * people are most likely to be sharing links with someone in the room.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
