import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { Competition, Rubric, Scale, scaleValues } from '../core/models';
import { Modal } from './modal';
import { ScaleEditor } from './scale-editor';
import { Icon } from './icon';
import { DialogService } from './dialog';

type Mode = 'scale' | 'catalog' | 'custom' | null;

/** Section « Barème & rubriques » d'une compétition. */
@Component({
  selector: 'app-competition-rubrics',
  imports: [Icon, FormsModule, Modal, ScaleEditor],
  template: `
    @let c = competition();
    <section class="section">
      <header class="row" style="justify-content: space-between; margin-bottom: 14px">
        <h2 class="section-title">Barème & rubriques</h2>
        @if (c.can_manage) {
          <div class="row">
            <button class="btn btn-ghost btn-sm" type="button" (click)="openScale()">Barème par défaut</button>
            <button class="btn btn-gold btn-sm" type="button" (click)="openCatalog()">+ Ajouter des rubriques</button>
          </div>
        }
      </header>

      @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 12px">{{ m.text }}</p> }

      @if (c.rubrics?.length) {
        <ol class="rubrics">
          @for (r of c.rubrics; track r.id; let i = $index, first = $first, last = $last) {
            <li class="rubric card">
              <span class="rubric-num">{{ i + 1 }}</span>
              <div class="rubric-body">
                <div class="row" style="justify-content: space-between">
                  <h3>{{ r.name }}</h3>
                  <span class="values">
                    @for (v of r.points; track v) { <span class="pt">+{{ v }}</span> }
                    @if (r.penalties) { <span class="pt neg">pénalités</span> }
                  </span>
                </div>
                @if (r.description) { <p class="muted small">{{ r.description }}</p> }
              </div>
              @if (c.can_manage) {
                <div class="rubric-actions">
                  <button class="icon" type="button" (click)="run(api.moveRubric(r.id, 'up'))" [disabled]="first" aria-label="Monter"><app-icon name="arrow-up" [size]="15" /></button>
                  <button class="icon" type="button" (click)="run(api.moveRubric(r.id, 'down'))" [disabled]="last" aria-label="Descendre"><app-icon name="arrow-down" [size]="15" /></button>
                  <button class="icon" type="button" (click)="openEdit(r)" aria-label="Modifier la rubrique"><app-icon name="pencil" [size]="15" /></button>
                  <button class="icon danger" type="button" (click)="remove(r)" aria-label="Supprimer la rubrique"><app-icon name="x" [size]="15" /></button>
                </div>
              }
            </li>
          }
        </ol>
      } @else {
        <div class="card default-scale">
          <div>
            <strong>Barème unique</strong>
            <p class="muted small" style="margin: 4px 0 0">Aucune rubrique : les arbitres utilisent ce barème pendant tout le match.</p>
          </div>
          <span class="values">@for (v of values(c.scoring); track v) { <span class="pt" [class.neg]="v < 0">{{ v > 0 ? '+' : '' }}{{ v }}</span> }</span>
        </div>
      }
    </section>

    <!-- Barème par défaut -->
    <app-modal [open]="mode() === 'scale'" title="Barème par défaut" eyebrow="Utilisé sans rubrique" (closed)="close()">
      <form class="form" (ngSubmit)="saveScale()">
        <p class="muted small" style="margin: 0">Valeurs proposées aux arbitres quand la compétition n’a pas de rubriques.</p>
        <app-scale-editor [(scale)]="scale" />
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" (click)="close()">Annuler</button>
          <button class="btn" type="submit" [disabled]="busy()">Enregistrer</button>
        </div>
      </form>
    </app-modal>

    <!-- Catalogue de rubriques prédéfinies -->
    <app-modal [open]="mode() === 'catalog'" [wide]="true" title="Ajouter des rubriques" eyebrow="Catalogue prédéfini" (closed)="close()">
      <p class="muted small" style="margin: 0 0 12px">Cochez des rubriques pour les ajouter telles quelles, ou cliquez sur « Personnaliser » pour adapter la description et le barème.</p>
      <ul class="catalog">
        @for (p of presets(); track p.id) {
          <li [class.checked]="picked().has(p.id)">
            <label>
              <input type="checkbox" [checked]="picked().has(p.id)" (change)="togglePreset(p.id)" />
              <span>
                <strong>{{ p.name }}</strong>
                <span class="values">@for (v of p.points; track v) { <span class="pt">+{{ v }}</span> }@if (p.penalties) { <span class="pt neg">pénalités</span> }</span>
                <span class="muted small desc">{{ p.description }}</span>
              </span>
            </label>
            <button class="btn btn-ghost btn-sm" type="button" (click)="customize(p)">Personnaliser</button>
          </li>
        }
      </ul>
      <footer class="modal-foot">
        <button class="btn btn-ghost" type="button" (click)="customize(null)">Créer une rubrique vierge</button>
        <button class="btn" type="button" (click)="addPicked()" [disabled]="!picked().size || busy()">Ajouter {{ picked().size || '' }} rubrique{{ picked().size > 1 ? 's' : '' }}</button>
      </footer>
    </app-modal>

    <!-- Rubrique personnalisée (création ou modification) -->
    <app-modal [open]="mode() === 'custom'" [title]="editingId ? 'Modifier la rubrique' : 'Nouvelle rubrique'" [eyebrow]="fromPreset ? 'Basée sur « ' + fromPreset + ' »' : ''" (closed)="close()">
      <form class="form" (ngSubmit)="saveRubric()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <label class="field"><span>Nom de la rubrique</span>
          <input name="name" [(ngModel)]="form.name" maxlength="80" required placeholder="Ex. Questions éclair" />
        </label>
        <label class="field"><span>Description (règles, déroulement…)</span>
          <textarea name="description" [(ngModel)]="form.description" maxlength="2000" rows="4" placeholder="Expliquez comment se joue cette rubrique."></textarea>
        </label>
        <div class="field"><span>Barème de la rubrique</span>
          <app-scale-editor [(scale)]="formScale" />
        </div>
        <div class="form-actions">
          @if (!editingId) { <button class="btn btn-ghost" type="button" style="margin-right: auto" (click)="openCatalog()"><app-icon name="arrow-left" [size]="14" /> Catalogue</button> }
          <button class="btn btn-ghost" type="button" (click)="close()">Annuler</button>
          <button class="btn" type="submit" [disabled]="busy()">{{ editingId ? 'Enregistrer' : 'Ajouter la rubrique' }}</button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .rubrics { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .rubric { display: grid; grid-template-columns: 34px 1fr auto; align-items: start; gap: 14px; padding: 16px; }
    .rubric-num { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-weight: 700; }
    .rubric-body h3 { font-size: 15px; }
    .rubric-body p { margin: 6px 0 0; line-height: 1.5; }
    .rubric-actions { display: flex; gap: 4px; }
    .values { display: inline-flex; flex-wrap: wrap; gap: 4px; }
    .pt { padding: 2px 8px; border-radius: 6px; background: rgba(240, 205, 135, .55); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .pt.neg { background: rgba(172, 99, 39, .12); color: var(--rust); }
    .default-scale { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .icon { width: 30px; height: 30px; display: inline-grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); cursor: pointer; }
    .icon:hover:not(:disabled) { border-color: var(--ochre); background: rgba(240, 205, 135, .35); }
    .icon.danger:hover { border-color: var(--danger); color: var(--danger); }
    .icon:disabled { opacity: .4; cursor: not-allowed; }
    .catalog { display: grid; gap: 8px; max-height: 50dvh; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
    .catalog li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
    .catalog li.checked { border-color: var(--ochre); background: rgba(240, 205, 135, .25); }
    .catalog label { flex: 1; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
    .catalog label > span { display: grid; gap: 4px; }
    .catalog input { width: 17px; height: 17px; margin-top: 2px; accent-color: var(--rust); }
    .desc { line-height: 1.45; }
    .modal-foot { position: sticky; bottom: -24px; display: flex; justify-content: space-between; gap: 10px; margin: 16px -24px -24px; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface); }
    @media (max-width: 600px) { .rubric { grid-template-columns: 1fr; } .catalog li { flex-direction: column; align-items: stretch; } }
  `,
})
export class CompetitionRubrics {
  private readonly dialog = inject(DialogService);
  protected readonly api = inject(ApiService);
  readonly competition = input.required<Competition>();
  readonly changed = output<void>();
  protected readonly mode = signal<Mode>(null);
  protected readonly presets = signal<Rubric[]>([]);
  protected readonly picked = signal(new Set<number>());
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected readonly values = scaleValues;
  protected scale: Scale = { points: [10, 20, 30, 40], penalties: true };
  protected form = { name: '', description: '' as string | null };
  protected formScale: Scale = { points: [10, 20, 30, 40], penalties: true };
  protected editingId: number | null = null;
  protected fromPreset = '';

  protected openScale(): void {
    this.scale = structuredClone(this.competition().scoring);
    this.mode.set('scale');
  }

  protected openCatalog(): void {
    this.picked.set(new Set());
    this.mode.set('catalog');
    if (!this.presets().length) {
      this.api.rubricPresets().subscribe((list) => this.presets.set(list));
    }
  }

  protected togglePreset(id: number): void {
    this.picked.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** Ouvre le formulaire, prérempli avec une rubrique du catalogue (ou vierge). */
  protected customize(preset: Rubric | null): void {
    this.editingId = null;
    this.fromPreset = preset?.name ?? '';
    this.form = { name: preset?.name ?? '', description: preset?.description ?? '' };
    this.formScale = preset ? { points: [...preset.points], penalties: preset.penalties } : structuredClone(this.competition().scoring);
    this.error.set('');
    this.mode.set('custom');
  }

  protected openEdit(rubric: Rubric): void {
    this.editingId = rubric.id;
    this.fromPreset = '';
    this.form = { name: rubric.name, description: rubric.description };
    this.formScale = { points: [...rubric.points], penalties: rubric.penalties };
    this.error.set('');
    this.mode.set('custom');
  }

  protected close(): void {
    this.mode.set(null);
  }

  protected saveScale(): void {
    this.run(this.api.updateScoring(this.competition().id, this.scale), 'Barème par défaut mis à jour.');
  }

  protected addPicked(): void {
    const count = this.picked().size;
    this.run(this.api.addPresetRubrics(this.competition().id, [...this.picked()]), `${count} rubrique${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''}.`);
  }

  protected saveRubric(): void {
    const payload = { name: this.form.name.trim(), description: this.form.description?.trim() || null, ...this.formScale };
    const request = this.editingId ? this.api.updateRubric(this.editingId, payload) : this.api.addRubric(this.competition().id, payload);
    this.run(request, this.editingId ? 'Rubrique modifiée.' : 'Rubrique ajoutée.', true);
  }

  protected async remove(rubric: Rubric): Promise<void> {
    if (await this.dialog.confirm('Les points déjà marqués restent acquis.', { title: `Supprimer la rubrique « ${rubric.name} » ?`, confirmLabel: 'Supprimer', danger: true })) {
      this.run(this.api.deleteRubric(rubric.id), 'Rubrique supprimée.');
    }
  }

  protected run(request: Observable<unknown>, success?: string, inForm = false): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.mode.set(null);
        this.message.set(success ? { text: success, ok: true } : null);
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        if (inForm) {
          this.error.set(errorMessage(e));
        } else {
          this.mode.set(null);
          this.message.set({ text: errorMessage(e), ok: false });
        }
      },
    });
  }
}
