import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { map, Observable, of, switchMap } from 'rxjs';
import { ApiService, CompetitionPayload, errorMessage } from '../core/api.service';
import { Competition, COMPETITION_STATUS_LABELS } from '../core/models';
import { Modal } from './modal';
import { Icon } from './icon';
import { ImagePicker } from './image-picker';

@Component({
  selector: 'app-competition-edit-modal',
  imports: [Icon, FormsModule, Modal, ImagePicker],
  template: `
    <app-modal [open]="open()" title="Modifier la compétition" [eyebrow]="competition().name" (closed)="closed.emit()">
      <form class="form" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <label class="field"><span>Nom</span>
          <input name="name" [(ngModel)]="form.name" maxlength="120" required />
        </label>
        <div class="field"><span>Image de couverture</span>
          <app-image-picker [src]="cover.preview" [name]="form.name || 'Compétition'" what="l’image" shape="square" [size]="80" (picked)="pickCover($event)" (removed)="removeCover()" />
        </div>
        <label class="field"><span>Description</span>
          <textarea name="description" [(ngModel)]="form.description" maxlength="2000"></textarea>
        </label>
        <div class="form-grid">
          <label class="field"><span>Date de début</span>
            <input type="date" name="starts_on" [(ngModel)]="form.starts_on" />
          </label>
          <label class="field"><span>Date de fin</span>
            <input type="date" name="ends_on" [(ngModel)]="form.ends_on" [min]="form.starts_on ?? ''" />
          </label>
        </div>
        <fieldset class="format-picker">
          <legend class="small muted">Format</legend>
          <label [class.active]="form.format === 'groups'">
            <input type="radio" name="format" value="groups" [(ngModel)]="form.format" />
            <span><strong class="row" style="gap: 6px"><app-icon name="layout-grid" /> Poules</strong><span class="muted small">Groupes A, B, C… puis phase finale</span></span>
          </label>
          <label [class.active]="form.format === 'league'">
            <input type="radio" name="format" value="league" [(ngModel)]="form.format" />
            <span><strong class="row" style="gap: 6px"><app-icon name="trophy" /> Championnat</strong><span class="muted small">Tous contre tous, classement unique</span></span>
          </label>
        </fieldset>
        <fieldset class="status-picker">
          <legend class="small muted">Statut</legend>
          @for (entry of statuses; track entry[0]) {
            <label [class.active]="form.status === entry[0]">
              <input type="radio" name="status" [value]="entry[0]" [(ngModel)]="form.status" />
              {{ entry[1] }}
            </label>
          }
        </fieldset>
        <p class="muted small" style="margin: 0">« Inscriptions ouvertes » permet aux capitaines d’inscrire eux-mêmes leur équipe.</p>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" (click)="closed.emit()">Annuler</button>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .status-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; padding: 0; border: 0; }
    .status-picker legend { margin-bottom: 6px; font-weight: 600; }
    .status-picker label { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; font-size: 13px; cursor: pointer; }
    .status-picker label.active { border-color: var(--ochre); background: rgba(240, 205, 135, .35); font-weight: 600; }
    .status-picker input { accent-color: var(--rust); }
  `,
})
export class CompetitionEditModal {
  private readonly api = inject(ApiService);
  readonly competition = input.required<Competition>();
  readonly open = input(false);
  readonly saved = output<Competition>();
  readonly closed = output<void>();
  protected readonly statuses = Object.entries(COMPETITION_STATUS_LABELS);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  /** Couverture choisie : envoyée après l'enregistrement du formulaire. */
  protected cover: { preview: string | null; file?: File; remove?: boolean } = { preview: null };
  protected form: CompetitionPayload = { name: '', description: '', starts_on: null, ends_on: null, status: 'open' };

  constructor() {
    // Réinitialise le formulaire à chaque ouverture.
    effect(() => {
      if (this.open()) {
        const c = this.competition();
        this.form = { name: c.name, description: c.description, starts_on: c.starts_on, ends_on: c.ends_on, status: c.status, format: c.format };
        this.cover = { preview: c.cover_url ?? null };
        this.error.set('');
      }
    });
  }

  protected pickCover(file: File): void {
    this.cover = { preview: URL.createObjectURL(file), file };
  }

  protected removeCover(): void {
    this.cover = { preview: null, remove: true };
  }

  protected submit(): void {
    this.saving.set(true);
    this.error.set('');
    const payload = { ...this.form, starts_on: this.form.starts_on || null, ends_on: this.form.ends_on || null };
    const id = this.competition().id;
    const cover = (): Observable<Competition | null> =>
      this.cover.file ? this.api.uploadCover(id, this.cover.file) : this.cover.remove ? this.api.removeCover(id) : of(null);
    this.api.updateCompetition(id, payload).pipe(
      switchMap((competition) => cover().pipe(map((updated) => ({ ...competition, cover_url: updated ? updated.cover_url : competition.cover_url })))),
    ).subscribe({
      next: (competition) => {
        this.saving.set(false);
        this.saved.emit(competition);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }
}
