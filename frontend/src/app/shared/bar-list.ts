import { Component, computed, input, signal } from '@angular/core';

export interface BarItem {
  label: string;
  count: number;
}

/** Barres horizontales d'une seule série : libellé, barre, valeur au bout ; part du total au survol. */
@Component({
  selector: 'app-bar-list',
  template: `
    <ul class="bars">
      @for (item of items(); track item.label; let i = $index) {
        <li class="bar-row" tabindex="0" [class.active]="active() === i"
          (pointerenter)="active.set(i)" (pointerleave)="active.set(null)" (focus)="active.set(i)" (blur)="active.set(null)"
          [attr.aria-label]="item.label + ' : ' + item.count + ' (' + share(item.count) + ' %)'">
          <span class="label">{{ item.label }}</span>
          <span class="track">
            <span class="fill" [style.width]="'calc((100% - 40px) * ' + item.count / max() + ')'" [style.background]="color()"></span>
            <span class="value">{{ item.count }}</span>
          </span>
          @if (active() === i) {
            <span class="tip" role="tooltip"><strong>{{ share(item.count) }} %</strong> du total</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .bars { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .bar-row { position: relative; display: grid; grid-template-columns: minmax(80px, 38%) 1fr; align-items: center; gap: 10px; padding: 2px 0; border-radius: 6px; outline: none; cursor: default; }
    .bar-row:focus-visible { outline: 2px solid var(--ochre); outline-offset: 2px; }
    .label { overflow: hidden; color: var(--ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .track { display: flex; align-items: center; gap: 8px; min-width: 0; }
    /* Barre ≤ 24 px, extrémité arrondie, base carrée. */
    .fill { height: 16px; min-width: 2px; border-radius: 0 4px 4px 0; transition: filter .15s ease; }
    .bar-row.active .fill { filter: brightness(1.12); }
    .value { flex: none; color: var(--ink); font-family: var(--mono); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .tip { position: absolute; right: 0; bottom: calc(100% + 4px); z-index: 2; padding: 5px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); box-shadow: 0 4px 14px rgba(43, 34, 25, .1); color: var(--muted); font-size: 11px; white-space: nowrap; pointer-events: none; }
    .tip strong { color: var(--ink); font-size: 12px; }
  `,
})
export class BarList {
  readonly items = input.required<BarItem[]>();
  readonly color = input('#ac6327');
  protected readonly active = signal<number | null>(null);
  private readonly total = computed(() => this.items().reduce((sum, item) => sum + item.count, 0));
  protected readonly max = computed(() => Math.max(1, ...this.items().map((item) => item.count)));

  protected share(count: number): number {
    return this.total() ? Math.round((count / this.total()) * 100) : 0;
  }
}
