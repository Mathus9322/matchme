import { Component, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Scale } from '../core/models';
import { Icon } from './icon';

/** Édite un barème : liste de valeurs de points et autorisation des pénalités. */
@Component({
  selector: 'app-scale-editor',
  imports: [Icon, FormsModule],
  template: `
    <div class="scale">
      <div class="chips">
        @for (p of scale().points; track p) {
          <span class="chip">+{{ p }}<button type="button" (click)="remove(p)" [disabled]="scale().points.length === 1" [attr.aria-label]="'Retirer ' + p"><app-icon name="x" [size]="10" /></button></span>
        }
        <span class="add">
          <input class="input" type="number" min="1" max="500" placeholder="Valeur" [(ngModel)]="draft" (keydown.enter)="$event.preventDefault(); add()" aria-label="Nouvelle valeur de points" />
          <button class="btn btn-ghost btn-sm" type="button" (click)="add()" [disabled]="scale().points.length >= 8">+ Ajouter</button>
        </span>
      </div>
      <div class="quick">
        <span class="small muted">Préréglages :</span>
        @for (preset of presets; track preset.join()) {
          <button type="button" class="link" (click)="set(preset)">{{ preset.join(' / ') }}</button>
        }
      </div>
      <label class="row small toggle">
        <input type="checkbox" [ngModel]="scale().penalties" (ngModelChange)="scale.set({ points: scale().points, penalties: $event })" />
        Autoriser les pénalités (mauvaise réponse : {{ negatives() }})
      </label>
      @if (error()) { <p class="small" style="color: var(--danger); margin: 0">{{ error() }}</p> }
    </div>
  `,
  styles: `
    .scale { display: grid; gap: 10px; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 6px 5px 11px; border-radius: 999px; background: var(--gold); font-family: var(--mono); font-size: 12px; font-weight: 700; }
    .chip button { width: 20px; height: 20px; display: inline-grid; place-items: center; border: 0; border-radius: 50%; background: rgba(43, 34, 25, .12); font-size: 9px; cursor: pointer; }
    .chip button:disabled { opacity: .35; cursor: not-allowed; }
    .add { display: inline-flex; gap: 6px; }
    .add .input { width: 90px; min-height: 32px; padding: 4px 8px; }
    .quick { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .link { padding: 2px 8px; border: 1px dashed var(--sand); border-radius: 6px; background: transparent; font-family: var(--mono); font-size: 11px; cursor: pointer; }
    .link:hover { border-color: var(--ochre); background: rgba(240, 205, 135, .3); }
    .toggle input { width: 16px; height: 16px; accent-color: var(--rust); }
  `,
})
export class ScaleEditor {
  readonly scale = model.required<Scale>();
  protected readonly presets = [[10], [10, 20], [10, 20, 30, 40], [40, 30, 20, 10], [5, 10, 15]];
  protected readonly error = signal('');
  protected draft: number | null = null;

  protected negatives(): string {
    return this.scale().penalties ? this.scale().points.map((p) => -p).join(', ') : 'aucun point retiré';
  }

  protected add(): void {
    const value = Math.round(Number(this.draft));
    if (!value || value < 1 || value > 500) {
      this.error.set('Entrez une valeur entre 1 et 500.');
      return;
    }
    if (this.scale().points.includes(value)) {
      this.error.set('Cette valeur existe déjà.');
      return;
    }
    this.error.set('');
    this.draft = null;
    this.scale.set({ ...this.scale(), points: [...this.scale().points, value] });
  }

  protected remove(value: number): void {
    this.scale.set({ ...this.scale(), points: this.scale().points.filter((p) => p !== value) });
  }

  protected set(points: number[]): void {
    this.error.set('');
    this.scale.set({ ...this.scale(), points: [...points] });
  }
}
