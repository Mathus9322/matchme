import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of, switchMap } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { Team } from '../core/models';
import { ImagePicker } from '../shared/image-picker';
import { Icon } from '../shared/icon';

/** Image en attente d'envoi : aperçu affiché, fichier envoyé à l'enregistrement. */
interface ImageState {
  preview: string | null;
  file?: File;
  remove?: boolean;
}

interface PlayerForm extends ImageState {
  id?: number;
  name: string;
}

@Component({
  selector: 'app-team-form',
  imports: [Icon, FormsModule, RouterLink, ImagePicker],
  template: `
    <div class="medium">
      <p class="eyebrow">{{ id() ? 'Modification' : 'Nouvelle équipe' }}</p>
      <h1 class="page-title">{{ id() ? 'Modifier l’équipe' : 'Créer une équipe' }}</h1>

      <form class="card form" style="margin-top: 24px" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <div class="field"><span>Logo de l’équipe</span>
          <app-image-picker [src]="logo.preview" [name]="form.name || 'Équipe'" what="le logo" shape="square" [size]="80" (picked)="pickLogo($event)" (removed)="removeLogo()" />
        </div>
        <div class="form-grid">
          <label class="field"><span>Nom de l’équipe</span>
            <input name="name" [(ngModel)]="form.name" maxlength="80" placeholder="Ex. Gaïndé de Thiès" required />
          </label>
          <label class="field"><span>Ville / établissement</span>
            <input name="city" [(ngModel)]="form.city" maxlength="80" placeholder="Ex. Thiès" />
          </label>
        </div>

        <fieldset class="players">
          <legend class="row" style="justify-content: space-between; width: 100%">
            <span class="section-title">Joueurs</span>
            <span class="muted small">{{ form.players.length }} / 12</span>
          </legend>
          <p class="muted small" style="margin: 0 0 6px">Au moins 4 joueurs. Pour chaque match, la feuille compte 4 titulaires et jusqu’à 2 remplaçants : par défaut les 4 premiers de la liste sont titulaires, les 5e et 6e remplaçants. Glissez un joueur sur un autre pour échanger leurs positions.</p>
          @for (player of form.players; track $index) {
            <div class="player-line" draggable="true" [class.dragging]="dragIndex === $index" [class.drop-target]="overIndex === $index && dragIndex !== $index"
              (dragstart)="dragIndex = $index; $event.dataTransfer?.setData('text/plain', '' + $index)" (dragend)="dragIndex = null; overIndex = null"
              (dragover)="$event.preventDefault(); overIndex = $index" (dragleave)="overIndex = null" (drop)="$event.preventDefault(); swap($index)"
              [attr.aria-label]="'Joueur ' + ($index + 1) + ', glisser sur un autre joueur pour échanger leurs positions'">
              <span class="grip"><app-icon name="grip-vertical" [size]="14" /></span>
              <span class="num">{{ ($index + 1).toString().padStart(2, '0') }}</span>
              <app-image-picker [src]="player.preview" [name]="player.name || 'Joueur ' + ($index + 1)" [compact]="true" [size]="38" (picked)="pickPhoto(player, $event)" />
              @if (player.preview) { <button class="btn btn-danger btn-sm photo-x" type="button" (click)="removePhoto(player)" aria-label="Retirer la photo"><app-icon name="x" [size]="12" /></button> } @else { <span></span> }
              <input class="input" [name]="'player' + $index" [(ngModel)]="player.name" maxlength="60" [placeholder]="'Joueur ' + ($index + 1)" required />
              <button class="btn btn-ghost btn-sm" type="button" (click)="move($index, -1)" [disabled]="$index === 0" aria-label="Monter"><app-icon name="arrow-up" [size]="14" /></button>
              <button class="btn btn-ghost btn-sm" type="button" (click)="move($index, 1)" [disabled]="$index === form.players.length - 1" aria-label="Descendre"><app-icon name="arrow-down" [size]="14" /></button>
              <button class="btn btn-danger btn-sm" type="button" (click)="removePlayer($index)" [disabled]="form.players.length <= 4" aria-label="Retirer le joueur"><app-icon name="x" [size]="14" /></button>
            </div>
          }
          <button class="btn btn-gold btn-sm" type="button" style="justify-self: start" (click)="addPlayer()" [disabled]="form.players.length >= 12">+ Ajouter un joueur</button>
        </fieldset>

        <div class="form-actions">
          @if (id()) {
            <button class="btn btn-danger" type="button" style="margin-right: auto" (click)="remove()">Supprimer l’équipe</button>
          }
          <a class="btn btn-ghost" routerLink="/equipes">Annuler</a>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .players { display: grid; gap: 8px; margin: 0; padding: 16px 0 0; border: 0; border-top: 1px solid var(--line); }
    .player-line { display: grid; grid-template-columns: 14px 26px 38px 22px 1fr auto auto auto; align-items: center; gap: 6px; padding: 2px; border-radius: 8px; }
    .grip { display: inline-flex; color: var(--sand); cursor: grab; }
    .dragging { opacity: .45; }
    .drop-target { background: rgba(240, 205, 135, .45); box-shadow: inset 0 0 0 2px var(--ochre); }
    .photo-x { min-height: 22px; width: 22px; padding: 0; }
    .num { color: var(--muted); font-family: var(--mono); font-size: 11px; }
  `,
})
export class TeamFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly id = input<string>();
  protected form: { name: string; city: string | null; players: PlayerForm[] } = {
    name: '',
    city: '',
    players: Array.from({ length: 4 }, () => ({ name: '', preview: null })),
  };
  protected logo: ImageState = { preview: null };
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const id = this.id();
    if (id) {
      this.api.team(+id).subscribe((team) => {
        this.form = { name: team.name, city: team.city, players: (team.players ?? []).map((p) => ({ id: p.id, name: p.name, preview: p.photo_url ?? null })) };
        this.logo = { preview: team.logo_url ?? null };
      });
    }
  }

  protected addPlayer(): void {
    this.form.players.push({ name: '', preview: null });
  }

  protected removePlayer(index: number): void {
    this.form.players.splice(index, 1);
  }

  protected dragIndex: number | null = null;
  protected overIndex: number | null = null;

  /** Échange la position du joueur glissé avec celle du joueur survolé. */
  protected swap(target: number): void {
    const source = this.dragIndex;
    this.dragIndex = this.overIndex = null;
    if (source === null || source === target) return;
    const players = this.form.players;
    [players[source], players[target]] = [players[target], players[source]];
  }

  protected move(index: number, delta: number): void {
    const players = this.form.players;
    [players[index], players[index + delta]] = [players[index + delta], players[index]];
  }

  protected pickLogo(file: File): void {
    this.logo = { preview: URL.createObjectURL(file), file };
  }

  protected removeLogo(): void {
    this.logo = { preview: null, remove: true };
  }

  protected pickPhoto(player: PlayerForm, file: File): void {
    Object.assign(player, { preview: URL.createObjectURL(file), file, remove: false });
  }

  protected removePhoto(player: PlayerForm): void {
    Object.assign(player, { preview: null, file: undefined, remove: true });
  }

  protected submit(): void {
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.form.name,
      city: this.form.city || null,
      players: this.form.players.map((p) => ({ id: p.id, name: p.name.trim() })),
    };
    const id = this.id();
    (id ? this.api.updateTeam(+id, payload) : this.api.createTeam(payload)).pipe(switchMap((team) => this.saveImages(team))).subscribe({
      next: () => this.router.navigateByUrl('/equipes'),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }

  /** Envoie les images en attente ; les joueurs enregistrés sont dans l'ordre du formulaire. */
  private saveImages(team: Team): Observable<unknown> {
    const requests: Observable<unknown>[] = [];
    if (this.logo.file) requests.push(this.api.uploadLogo(team.id, this.logo.file));
    else if (this.logo.remove) requests.push(this.api.removeLogo(team.id));

    this.form.players.forEach((player, index) => {
      const saved = team.players?.[index];
      if (!saved?.id) return;
      if (player.file) requests.push(this.api.uploadPlayerPhoto(saved.id, player.file));
      else if (player.remove && player.id) requests.push(this.api.removePlayerPhoto(saved.id));
    });

    return requests.length ? forkJoin(requests) : of(null);
  }

  protected remove(): void {
    const id = this.id();
    if (id && confirm('Supprimer cette équipe ? Elle sera retirée de toutes les compétitions.')) {
      this.api.deleteTeam(+id).subscribe({
        next: () => this.router.navigateByUrl('/equipes'),
        error: (e) => this.error.set(errorMessage(e)),
      });
    }
  }
}
