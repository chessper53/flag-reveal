/**
 * Routes. Each mode is lazily loaded, so the menu ships on its own and a mode's
 * code only arrives when it is played.
 */

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/menu/menu-page').then((m) => m.MenuPage),
    title: 'FlagReveal — guess the flag',
  },
  {
    path: 'play/reveal',
    loadComponent: () => import('./features/reveal/reveal-page').then((m) => m.RevealPage),
    title: 'Colour Reveal — FlagReveal',
  },
  {
    path: 'play/scratch',
    loadComponent: () => import('./features/scratch/scratch-page').then((m) => m.ScratchPage),
    title: 'Scratch & Guess — FlagReveal',
  },
  {
    path: 'play/mosaic',
    loadComponent: () => import('./features/mosaic/mosaic-page').then((m) => m.MosaicPage),
    title: 'Mosaic Ladder — FlagReveal',
  },
  { path: '**', redirectTo: '' },
];
