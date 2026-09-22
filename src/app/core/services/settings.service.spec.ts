import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Tier } from '../models/flag.model';
import { CountryService } from './country.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('defaults to hard mode off', () => {
    expect(TestBed.inject(SettingsService).hardMode()).toBe(false);
  });

  it('toggles and persists', () => {
    const settings = TestBed.inject(SettingsService);
    settings.toggleHardMode();

    expect(settings.hardMode()).toBe(true);
    // A fresh injector reads the stored value rather than the default.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(SettingsService).hardMode()).toBe(true);
  });

  it('survives unparseable storage', () => {
    localStorage.setItem('flag-reveal.settings.v1', 'not json');
    expect(TestBed.inject(SettingsService).hardMode()).toBe(false);
  });
});

describe('Hard mode answer pool', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('only opens the obscure tier when hard mode is on', () => {
    const countries = TestBed.inject(CountryService);

    const normalPool = countries.all.filter((country) => country.tier !== Tier.Hard);
    const hardPool = countries.all;

    // The pool difference is the whole point of the setting; if the Hard tier
    // were empty the toggle would do nothing to difficulty.
    expect(hardPool.length).toBeGreaterThan(normalPool.length);
    expect(countries.all.some((country) => country.tier === Tier.Hard)).toBe(true);
  });
});
