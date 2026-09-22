/**
 * The playfield: the real flag artwork, revealed through a soft mask.
 *
 * Rendering is deliberately decoupled from matching. The game logic works on a
 * 128 × 96 cell grid, but the board never paints those cells: it draws the
 * flag's own SVG at full canvas resolution and then punches it through the
 * mask, scaled up with interpolation. The result is a crisp, smooth flag with
 * softly feathered reveal edges instead of a mosaic.
 *
 * Three canvases are involved per frame:
 *
 *   1. `maskCanvas`   — 128 × 96, one alpha value per cell (the animation).
 *   2. `flagCanvas`   — full size; the SVG, then `destination-in` the mask.
 *   3. the visible canvas — the cover, then the masked flag on top.
 *
 * The component owns no game rules: it renders what it is handed and reports
 * where the pointer went so Scratch mode can rub.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { GRID_HEIGHT, GRID_WIDTH } from '../../core/services/flag-grid.service';
import { Mask, emptyMask } from '../../core/util/board-mask';

/** Where the pointer is, in board cell coordinates (fractional). */
export interface BoardPoint {
  readonly col: number;
  readonly row: number;
}

/** How the not-yet-revealed part of the board looks. */
export type CoverStyle = 'grid' | 'foil';

/** How long a cell takes to fade in. */
const FADE_DURATION_MS = 280;

@Component({
  selector: 'app-flag-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board" [class.board--interactive]="interactive()">
      <canvas
        #canvas
        class="board__canvas"
        [attr.aria-label]="label()"
        role="img"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        (pointerleave)="onPointerUp($event)"
      ></canvas>
      @if (!flagUrl()) {
        <div class="board__loading" role="status">Loading flag…</div>
      }
    </div>
  `,
  styleUrl: './flag-board.scss',
})
export class FlagBoard {
  /** The flag artwork to reveal, or `null` while the round loads. */
  readonly flagUrl = input<string | null>(null);
  /** Which cells are visible. */
  readonly mask = input<Mask>(emptyMask());
  readonly coverStyle = input<CoverStyle>('grid');
  /** When true, pointer drags emit {@link scratch} events. */
  readonly interactive = input(false);
  /** Accessible description of the board's current state. */
  readonly label = input('Hidden flag');

  /** Emitted on pointer down and while dragging, in cell coordinates. */
  readonly scratch = output<BoardPoint>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /** Per-cell opacity, animated towards the mask. Not a signal: it is hot. */
  private alpha = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
  private animationHandle = 0;
  private lastFrameTime = 0;
  private pointerActive = false;

  private image: HTMLImageElement | null = null;
  private coverPattern: CanvasPattern | null = null;
  /** The canvas only exists after the first render; guards early draws. */
  private viewReady = false;

  /** Cell-resolution alpha mask, upscaled onto the flag each frame. */
  private readonly maskCanvas = createCanvas(GRID_WIDTH, GRID_HEIGHT);
  private readonly maskData = this.maskCanvas
    .getContext('2d')
    ?.createImageData(GRID_WIDTH, GRID_HEIGHT);
  /** Full-size scratch canvas where the flag gets masked before compositing. */
  private readonly flagCanvas = createCanvas(1, 1);

  private readonly reducedMotion = signal(
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    // Loading the artwork is independent of the render loop: the board keeps
    // showing the cover until the image is decoded.
    effect(() => {
      const url = this.flagUrl();
      this.image = null;
      // A finished round leaves every cell at full opacity. Clear that before
      // the next flag arrives, or the new artwork would be painted visible for
      // the frames before its mask is applied. Repaint at once so the previous
      // round's flag does not linger on the canvas for a frame either.
      this.alpha.fill(0);
      if (this.viewReady) {
        this.draw();
      }
      if (!url) {
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (this.flagUrl() === url) {
          this.image = image;
          this.draw();
        }
      };
      image.src = url;
    });

    afterRenderEffect(() => {
      this.mask();
      this.coverStyle();
      this.flagUrl();
      this.viewReady = true;
      this.resizeCanvas();
      this.startAnimation();
    });

    effect((onCleanup) => {
      const element = this.host.nativeElement as HTMLElement;
      const observer = new ResizeObserver(() => {
        this.resizeCanvas();
        this.draw();
      });
      observer.observe(element);
      onCleanup(() => {
        observer.disconnect();
        cancelAnimationFrame(this.animationHandle);
      });
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.interactive()) {
      return;
    }
    this.pointerActive = true;
    // Capture keeps the stroke alive if the pointer leaves the canvas. It can
    // throw for pointer ids the browser no longer tracks, which must not stop
    // the stroke itself.
    try {
      (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    } catch {
      // Not capturable — the stroke still works while the pointer stays put.
    }
    this.emitPoint(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.interactive() || !this.pointerActive) {
      return;
    }
    this.emitPoint(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.pointerActive) {
      return;
    }
    this.pointerActive = false;
    const canvas = event.target as HTMLCanvasElement;
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Already released.
    }
  }

  private emitPoint(event: PointerEvent): void {
    const canvas = this.canvasRef().nativeElement;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }
    this.scratch.emit({
      col: ((event.clientX - bounds.left) / bounds.width) * GRID_WIDTH,
      row: ((event.clientY - bounds.top) / bounds.height) * GRID_HEIGHT,
    });
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round((canvas.clientWidth || 640) * ratio);
    const height = Math.round((width * GRID_HEIGHT) / GRID_WIDTH);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.flagCanvas.width = width;
      this.flagCanvas.height = height;
      this.coverPattern = null;
    }
  }

  private startAnimation(): void {
    cancelAnimationFrame(this.animationHandle);
    this.lastFrameTime = performance.now();
    const step = (now: number) => {
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;
      const settled = this.advance(delta);
      this.draw();
      if (!settled) {
        this.animationHandle = requestAnimationFrame(step);
      }
    };
    this.animationHandle = requestAnimationFrame(step);
  }

  /**
   * Moves cell opacities towards the mask. Returns true once nothing moves.
   *
   * Revealing fades in; hiding is instant. Animating a cell *out* would mean
   * showing the flag underneath while it faded, which is exactly what must
   * never happen — a new round hides everything at once, so any fade-out would
   * flash the next answer.
   */
  private advance(deltaMs: number): boolean {
    const mask = this.mask();
    const stepSize = this.reducedMotion() ? 1 : Math.min(1, deltaMs / FADE_DURATION_MS);
    let settled = true;

    for (let i = 0; i < this.alpha.length; i++) {
      const target = mask[i] ?? 0;
      const current = this.alpha[i];
      if (current === target) {
        continue;
      }
      if (target < current) {
        this.alpha[i] = target;
        settled = false;
        continue;
      }
      const next = current + stepSize;
      this.alpha[i] = next >= target - 0.02 ? target : next;
      settled = false;
    }
    return settled;
  }

  private draw(): void {
    const canvas = this.canvasRef().nativeElement;
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0) {
      return;
    }

    this.paintCover(context, canvas);

    const image = this.image;
    if (!image) {
      return;
    }

    const masked = this.paintMaskedFlag(image, canvas.width, canvas.height);
    if (masked) {
      context.drawImage(masked, 0, 0);
    }
  }

  /**
   * Draws the flag at full resolution and keeps only the revealed parts.
   *
   * Scaling the small mask up with smoothing on is what softens the reveal
   * edges: a hard cell boundary becomes a one-cell gradient, so the flag looks
   * like it is being wiped clean rather than assembled from blocks.
   */
  private paintMaskedFlag(
    image: HTMLImageElement,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    const maskContext = this.maskCanvas.getContext('2d');
    const flagContext = this.flagCanvas.getContext('2d');
    const data = this.maskData;
    if (!maskContext || !flagContext || !data) {
      return null;
    }

    for (let i = 0; i < this.alpha.length; i++) {
      data.data[i * 4 + 3] = Math.round(this.alpha[i] * 255);
    }
    maskContext.putImageData(data, 0, 0);

    flagContext.clearRect(0, 0, width, height);
    flagContext.imageSmoothingEnabled = true;
    flagContext.imageSmoothingQuality = 'high';
    flagContext.drawImage(image, 0, 0, width, height);
    flagContext.globalCompositeOperation = 'destination-in';
    flagContext.drawImage(this.maskCanvas, 0, 0, width, height);
    flagContext.globalCompositeOperation = 'source-over';

    return this.flagCanvas;
  }

  private paintCover(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (this.coverStyle() === 'foil') {
      context.fillStyle = this.foilPattern(context, canvas) ?? '#39415a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    context.fillStyle = '#161b26';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // A faint chequerboard so the empty field reads as a board, not a void.
    const square = canvas.width / 24;
    context.fillStyle = '#1b2130';
    for (let row = 0; row * square < canvas.height; row++) {
      for (let col = row % 2; col * square < canvas.width; col += 2) {
        context.fillRect(col * square, row * square, square, square);
      }
    }
  }

  /** Brushed-metal cover for Scratch mode, built once per canvas size. */
  private foilPattern(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
  ): CanvasPattern | null {
    if (this.coverPattern) {
      return this.coverPattern;
    }
    const tileSize = Math.max(8, Math.round(canvas.width / 24));
    const tile = createCanvas(tileSize, tileSize);
    const tileContext = tile.getContext('2d');
    if (!tileContext) {
      return null;
    }

    tileContext.fillStyle = '#39415a';
    tileContext.fillRect(0, 0, tileSize, tileSize);
    tileContext.strokeStyle = 'rgba(255,255,255,0.05)';
    tileContext.lineWidth = Math.max(1, tileSize / 10);
    for (let offset = -tileSize; offset < tileSize * 2; offset += tileSize / 3) {
      tileContext.beginPath();
      tileContext.moveTo(offset, 0);
      tileContext.lineTo(offset + tileSize, tileSize);
      tileContext.stroke();
    }

    this.coverPattern = context.createPattern(tile, 'repeat');
    return this.coverPattern;
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
