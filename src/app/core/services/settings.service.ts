/**
 * Player settings, persisted to localStorage.
 *
 * Currently just hard mode, which tightens two screws at once:
 *
 *   1. **No flag previews in the autocomplete.** This is the big one. With
 *      thumbnails you can type a letter and match pictures against the board
 *      without ever recalling which flag belongs to which country — the game
 *      becomes spot-the-difference. Without them you have to know the name.
 *   2. **Every country in the answer pool**, not just the well-known tiers.
 *
 * Storage is best-effort: if localStorage is unavailable the setting simply
 * does not persist between sessions.
 */

import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'flag-reveal.settings.v1';

interface StoredSettings {
  readonly hardMode: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly hardModeState = signal(readStored().hardMode);

  readonly hardMode = this.hardModeState.asReadonly();

  setHardMode(enabled: boolean): void {
    this.hardModeState.set(enabled);
    writeStored({ hardMode: enabled });
  }

  toggleHardMode(): void {
    this.setHardMode(!this.hardModeState());
  }
}

function readStored(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { hardMode: !!(JSON.parse(raw) as StoredSettings).hardMode } : { hardMode: false };
  } catch {
    return { hardMode: false };
  }
}

function writeStored(settings: StoredSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — the setting still applies for this session.
  }
}
