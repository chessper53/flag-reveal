/**
 * The mode registry.
 *
 * The menu renders this array and nothing else, so a new mode becomes visible
 * by adding an entry here plus a lazy route in `app.routes.ts`. Modes that are
 * designed but not built yet can ship with `available: false` and show up as a
 * disabled card.
 */

import { GameModeDescriptor, GameModeId } from '../models/game.model';

export const GAME_MODES: readonly GameModeDescriptor[] = [
  {
    id: GameModeId.Reveal,
    title: 'Colour Reveal',
    tagline: '5 guesses',
    description:
      'The flag starts blank. Every guess paints in the pixels where its colours match the hidden flag — guess Switzerland against France and the red stripe lights up.',
    icon: 'grid',
    route: '/play/reveal',
    available: true,
    accent: '#4f9cf9',
  },
  {
    id: GameModeId.Scratch,
    title: 'Scratch & Guess',
    tagline: 'Score 1000',
    description:
      'Rub the cover away to peek at the flag underneath. Every pixel you uncover costs you points, so guess as early as your nerve allows.',
    icon: 'brush',
    route: '/play/scratch',
    available: true,
    accent: '#f5b544',
  },
  {
    id: GameModeId.Mosaic,
    title: 'Mosaic Ladder',
    tagline: 'Hard · 5 guesses',
    description:
      'The flag is drawn as two enormous blocks and sharpens one rung with every wrong guess — but never enough to be readable. Every country in the world is in play.',
    icon: 'mosaic',
    route: '/play/mosaic',
    available: true,
    accent: '#9b7bf0',
  },
];
