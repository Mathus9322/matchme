import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, input, OnDestroy, signal } from '@angular/core';

export interface ActivityPoint {
  week: string;
  games: number;
  users: number;
}

interface Series {
  key: 'games' | 'users';
  label: string;
  unit: string;
  color: string;
}

/** Couleurs validées (daltonisme, contraste) sur la surface claire de l'app. */
const SERIES: Series[] = [
  { key: 'games', label: 'Matchs joués', unit: 'matchs', color: '#ac6327' },
  { key: 'users', label: 'Nouveaux comptes', unit: 'comptes', color: '#1f7ab8' },
];

const HEIGHT = 240;
const M = { top: 14, right: 16, bottom: 28, left: 34 };

/** Arrondit le maximum de l'axe à une valeur « propre » (1, 2, 5 × 10ⁿ). */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * pow >= value / 4)! * pow;
  return Math.ceil(value / step) * step;
}

/** Courbes hebdomadaires : matchs terminés et nouveaux comptes, avec réticule au survol et vue tableau. */
@Component({
  selector: 'app-activity-chart',
  imports: [DatePipe],
  template: `
    <div class="legend">
      @for (s of series; track s.key) {
        <span class="key"><i [style.background]="s.color"></i>{{ s.label }}</span>
      }
    </div>
    <div class="plot">
      <svg [attr.width]="width()" [attr.height]="height" role="img" [attr.aria-label]="summary()" tabindex="0"
        (pointermove)="hover($event)" (pointerleave)="active.set(null)" (keydown)="key($event)" (blur)="active.set(null)">
        @for (t of ticks(); track t.value) {
          <line class="grid" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" [attr.x]="m.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.value }}</text>
        }
        <line class="base" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="y(0)" [attr.y2]="y(0)" />
        @for (l of xLabels(); track l.i) {
          <text class="tick" [attr.x]="x(l.i)" [attr.y]="height - 8" text-anchor="middle">{{ l.week | date: 'd MMM' }}</text>
        }
        @if (active(); as a) {
          <line class="cross" [attr.x1]="x(a)" [attr.x2]="x(a)" [attr.y1]="m.top" [attr.y2]="y(0)" />
        }
        @for (s of series; track s.key) {
          <path class="line" [attr.d]="path(s.key)" [attr.stroke]="s.color" />
          <circle class="dot" [attr.cx]="x(dotIndex())" [attr.cy]="y(points()[dotIndex()]?.[s.key] ?? 0)" r="4" [attr.fill]="s.color" />
        }
      </svg>
      @if (active(); as a) {
        <div class="tip" [style.left.px]="x(a)" [class.flip]="x(a) > width() - 170">
          <span class="tip-date">Semaine du {{ points()[a].week | date: 'd MMM y' }}</span>
          @for (s of series; track s.key) {
            <span class="tip-row"><i [style.background]="s.color"></i><strong>{{ points()[a][s.key] }}</strong> {{ s.unit }}</span>
          }
        </div>
      }
    </div>
    <details>
      <summary>Voir le tableau</summary>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Semaine du</th>@for (s of series; track s.key) { <th class="num">{{ s.label }}</th> }</tr></thead>
          <tbody>
            @for (p of points(); track p.week) {
              <tr><td>{{ p.week | date: 'd MMM y' }}</td><td class="num">{{ p.games }}</td><td class="num">{{ p.users }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 10px; color: var(--ink); font-size: 12px; }
    .key { display: inline-flex; align-items: center; gap: 6px; }
    .key i, .tip-row i { display: inline-block; width: 14px; height: 2px; border-radius: 2px; }
    .plot { position: relative; }
    svg { display: block; overflow: visible; outline: none; touch-action: pan-y; }
    svg:focus-visible { outline: 2px solid var(--ochre); outline-offset: 4px; border-radius: 4px; }
    .grid { stroke: #ebe8de; stroke-width: 1; }
    .base { stroke: #cfccbf; stroke-width: 1; }
    .cross { stroke: var(--muted); stroke-width: 1; }
    .tick { fill: var(--muted); font-family: var(--mono); font-size: 10px; font-variant-numeric: tabular-nums; }
    .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
    .dot { stroke: var(--surface); stroke-width: 2; }
    .tip { position: absolute; top: 0; z-index: 2; display: grid; gap: 3px; min-width: 150px; margin-left: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 4px 14px rgba(43, 34, 25, .1); font-size: 12px; pointer-events: none; }
    .tip.flip { transform: translateX(calc(-100% - 24px)); }
    .tip-date { color: var(--muted); font-size: 11px; }
    .tip-row { display: flex; align-items: center; gap: 6px; color: var(--muted); }
    .tip-row strong { color: var(--ink); font-size: 13px; }
    details { margin-top: 12px; }
    summary { color: var(--muted); font-size: 12px; cursor: pointer; }
    .table-wrap { margin-top: 8px; max-height: 260px; overflow: auto; }
  `,
})
export class ActivityChart implements OnDestroy {
  readonly points = input.required<ActivityPoint[]>();
  protected readonly series = SERIES;
  protected readonly height = HEIGHT;
  protected readonly m = M;
  protected readonly width = signal(600);
  protected readonly active = signal<number | null>(null);
  private readonly observer = new ResizeObserver(([entry]) => this.width.set(Math.max(260, Math.floor(entry.contentRect.width))));

  constructor() {
    this.observer.observe(inject(ElementRef).nativeElement);
  }

  ngOnDestroy(): void {
    this.observer.disconnect();
  }

  protected readonly max = computed(() => niceMax(Math.max(0, ...this.points().flatMap((p) => [p.games, p.users]))));

  protected readonly ticks = computed(() => {
    const max = this.max();
    return [0, 1, 2, 3, 4].map((i) => ({ value: (max / 4) * i, y: this.y((max / 4) * i) }));
  });

  /** Dates sous l'axe : une sur N pour ne jamais se chevaucher (~70 px par étiquette). */
  protected readonly xLabels = computed(() => {
    const points = this.points();
    const every = Math.max(1, Math.ceil(points.length / Math.floor((this.width() - M.left - M.right) / 70)));
    return points.map((p, i) => ({ i, week: p.week })).filter(({ i }) => (points.length - 1 - i) % every === 0);
  });

  /** Points mis en avant : la semaine survolée, sinon la dernière. */
  protected readonly dotIndex = computed(() => this.active() ?? this.points().length - 1);

  protected readonly summary = computed(() => {
    const last = this.points().at(-1);
    const total = (k: 'games' | 'users') => this.points().reduce((sum, p) => sum + p[k], 0);
    return `Activité sur ${this.points().length} semaines : ${total('games')} matchs joués et ${total('users')} nouveaux comptes.`
      + (last ? ` Dernière semaine : ${last.games} matchs, ${last.users} comptes.` : '');
  });

  protected x(i: number): number {
    const n = this.points().length;
    const span = this.width() - M.left - M.right;
    return M.left + (n <= 1 ? span / 2 : (span * i) / (n - 1));
  }

  protected y(value: number): number {
    return M.top + (HEIGHT - M.top - M.bottom) * (1 - value / this.max());
  }

  protected path(key: 'games' | 'users'): string {
    return this.points().map((p, i) => `${i ? 'L' : 'M'}${this.x(i).toFixed(1)},${this.y(p[key]).toFixed(1)}`).join(' ');
  }

  /** Le réticule s'aligne sur la semaine la plus proche du pointeur. */
  protected hover(event: PointerEvent): void {
    const n = this.points().length;
    if (!n) return;
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const ratio = (event.clientX - box.left - M.left) / (this.width() - M.left - M.right);
    this.active.set(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  }

  protected key(event: KeyboardEvent): void {
    const n = this.points().length;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || !n) return;
    event.preventDefault();
    this.active.set(Math.min(n - 1, Math.max(0, (this.active() ?? n - 1) + step)));
  }
}
