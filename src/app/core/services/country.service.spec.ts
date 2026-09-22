import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Tier } from '../models/flag.model';
import { CountryService } from './country.service';

describe('CountryService', () => {
  let service: CountryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CountryService);
  });

  it('ships the full country catalogue', () => {
    expect(service.all.length).toBeGreaterThan(180);
    expect(service.find('CH')?.name).toBe('Switzerland');
  });

  it('ranks prefix matches above substring matches', () => {
    const names = service.search('ni').map((match) => match.country.name);
    expect(names[0]).toMatch(/^Ni/);
  });

  it('folds accents and case', () => {
    expect(service.search('turkiye')[0]?.country.code).toBe('TR');
    expect(service.search('cote')[0]?.country.code).toBe('CI');
  });

  it('matches aliases and ISO codes', () => {
    expect(service.resolve('USA')?.code).toBe('US');
    expect(service.resolve('Holland')?.code).toBe('NL');
    expect(service.resolve('de')?.code).toBe('DE');
  });

  it('resolves an unambiguous partial name but refuses an ambiguous one', () => {
    expect(service.resolve('switzerl')?.code).toBe('CH');
    // "United" hits several countries, so Enter must not pick one at random.
    expect(service.resolve('united')).toBeUndefined();
  });

  it('returns nothing for gibberish', () => {
    expect(service.resolve('zzzzz')).toBeUndefined();
    expect(service.search('zzzzz')).toHaveLength(0);
  });

  it('avoids answers that were already used', () => {
    const pool = service.all.filter((country) => country.tier === Tier.Easy);
    const exclude = pool.slice(0, pool.length - 1).map((country) => country.code);
    const answer = service.randomAnswer([Tier.Easy], exclude);
    expect(answer.code).toBe(pool[pool.length - 1].code);
  });

  it('falls back to the full pool once everything has been seen', () => {
    const all = service.all.map((country) => country.code);
    expect(service.randomAnswer([Tier.Easy], all)).toBeDefined();
  });
});
