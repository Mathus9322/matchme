import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, Observable, of, switchMap } from 'rxjs';
import { ApiService, CompetitionPayload, errorMessage } from '../core/api.service';
import { Competition, COMPETITION_STATUS_LABELS } from '../core/models';
import { Icon } from '../shared/icon';
import { ImagePicker } from '../shared/image-picker';

@Component({
  selector: 'app-competition-form',
  imports: [Icon, FormsModule, RouterLink, ImagePicker],
  template: `
    <div class="medium">
      <p class="eyebrow">{{ id() ? 'Modification' : 'Nouvelle compétition' }}</p>
      <h1 class="page-title">{{ id() ? 'Modifier la compétition' : 'Créer une compétition' }}</h1>

      <form class="card form" style="margin-top: 24px" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <label class="field"><span>Nom</span>
          <input name="name" [(ngModel)]="form.name" maxlength="120" placeholder="Ex. Coupe régionale 2026" required />
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
            <input type="date" name="ends_on" [(ngModel)]="form.ends_on" />
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
        <label class="field"><span>Statut</span>
          <select name="status" [(ngModel)]="form.status">
            @for (entry of statuses; track entry[0]) {
              <option [value]="entry[0]">{{ entry[1] }}</option>
            }
          </select>
        </label>
        <p class="muted small" style="margin: 0">« Inscriptions ouvertes » permet aux capitaines d’inscrire eux-mêmes leur équipe.</p>
        <div class="form-actions">
          <a class="btn btn-ghost" [routerLink]="id() ? ['/gestion/competitions', id()] : ['/gestion/competitions']">Annuler</a>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class CompetitionFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly id = input<string>();
  protected readonly statuses = Object.entries(COMPETITION_STATUS_LABELS);
  protected form: CompetitionPayload = { name: '', description: '', starts_on: null, ends_on: null, status: 'open', format: 'groups' };
  /** Couverture choisie : envoyée une fois la compétition enregistrée. */
  protected cover: { preview: string | null; file?: File; remove?: boolean } = { preview: null };
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const id = this.id();
    if (id) {
      this.api.competition(+id).subscribe(({ competition: c }) => {
        this.form = { name: c.name, description: c.description, starts_on: c.starts_on, ends_on: c.ends_on, status: c.status, format: c.format };
        this.cover = { preview: c.cover_url ?? null };
      });
    }
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
    const id = this.id();
    const request = id ? this.api.updateCompetition(+id, payload) : this.api.createCompetition(payload);
    const cover = (c: Competition): Observable<unknown> =>
      this.cover.file ? this.api.uploadCover(c.id, this.cover.file) : this.cover.remove ? this.api.removeCover(c.id) : of(null);
    request.pipe(switchMap((c) => cover(c).pipe(map(() => c)))).subscribe({
      next: (c) => this.router.navigate(['/gestion/competitions', c.id]),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }
}
