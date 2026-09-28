/**
 * Inverted Reveal.
 *
 * The rules are Colour Reveal's, unchanged: five guesses, and every cell whose
 * colour family matches the answer stays revealed. The twist is purely in the
 * painting — the board shows the flag's negative, so France's blue arrives as
 * orange and its red as cyan, and recognising what you have uncovered means
 * inverting it in your head.
 *
 * Matching deliberately still happens on the *true* colours. Inverting both
 * sides of a comparison changes nothing, so doing it there would be a no-op
 * that only made the code harder to follow.
 *
 * It subclasses rather than copies so the two modes cannot drift apart, but
 * keeps its own injectable identity — and therefore its own stats, streak and
 * answer sequence.
 */

import { Injectable } from '@angular/core';
import { GameModeId } from '../models/game.model';
import { RevealGameService } from './reveal-game.service';

@Injectable({ providedIn: 'root' })
export class InvertedRevealGameService extends RevealGameService {
  protected override readonly modeId = GameModeId.Inverted;
}
