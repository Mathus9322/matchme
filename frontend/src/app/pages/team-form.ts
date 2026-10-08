import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of, switchMap } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Owner, Team } from '../core/models';
import { Avatar } from '../shared/avatar';
import { ImagePicker } from '../shared/image-picker';
import { Icon } from '../shared/icon';
import { DialogService } from '../shared/dialog';

/** Image en attente d'envoi : aperçu affiché, fichier envoyé à l'enregistrement. */
interface ImageState {
  preview: string | null;
  file?: File;
  remove?: boolean;
}

interface PlayerForm extends ImageState {
  id?: number;
  name: string;
  captain?: boolean;
}

@Component({
  selector: 'app-team-form',
  imports: [Icon, FormsModule, RouterLink, ImagePicker, Avatar],
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

        <div class="field"><span>Coach de l’équipe</span>
          @if (coach(); as c) {
            <div class="coach card">
              <app-avatar [src]="c.avatar_url" [name]="c.name" [size]="36" />
              <span class="coach-name"><strong>{{ c.name }}</strong>@if (c.email) { <span class="muted small">{{ c.email }}</span> }</span>
              @if (canChooseCoach()) { <button class="btn btn-ghost btn-sm" type="button" (click)="coach.set(null)">Changer</button> }
            </div>
          } @else {
            <input class="input" type="search" name="coachSearch" [(ngModel)]="coachQuery" (ngModelChange)="searchCoach($event)" placeholder="Rechercher un utilisateur inscrit (nom ou e-mail)…" autocomplete="off" />
            @if (coachResults().length) {
              <ul class="coach-results">
                @for (u of coachResults(); track u.id) {
                  <li><button type="button" (click)="pickCoach(u)"><app-avatar [src]="u.avatar_url" [name]="u.name" [size]="28" /> <strong>{{ u.name }}</strong> <span class="muted small">{{ u.email }}</span></button></li>
                }
              </ul>
            } @else if (coachQuery.trim().length >= 2) {
              <p class="muted small" style="margin: 0">Aucun utilisateur trouvé. Le coach doit d’abord créer son compte MatchMe.</p>
            }
          }
          <p class="muted small" style="margin: 0">Le coach gère l’effectif (ajout et retrait des joueurs, capitaine) et peut proposer des matchs amicaux aux autres coachs.</p>
        </div>

        <fieldset class="players">
          <legend class="row" style="justify-content: space-between; width: 100%">
            <span class="section-title">Joueurs</span>
            <span class="muted small">{{ form.players.length }} / 12</span>
          </legend>
          <p class="muted small" style="margin: 0 0 6px">Au moins 4 joueurs. Pour chaque match, la feuille compte 4 titulaires et jusqu’à 2 remplaçants : par défaut les 4 premiers de la liste sont titulaires, les 5e et 6e remplaçants. Glissez un joueur sur un autre pour échanger leurs positions. Touchez « C » pour désigner le capitaine (obligatoire) : il passe en tête et joue toujours en première position.</p>
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
              <button class="captain-pick" type="button" [class.active]="player.captain" (click)="setCaptain(player)" [attr.aria-pressed]="!!player.captain" [attr.aria-label]="'Capitaine : joueur ' + ($index + 1)" title="Désigner capitaine">C</button>
              <button class="btn btn-ghost btn-sm" type="button" (click)="move($index, -1)" [disabled]="$index === 0 || player.captain || ($index === 1 && form.players[0].captain)" aria-label="Monter"><app-icon name="arrow-up" [size]="14" /></button>
              <button class="btn btn-ghost btn-sm" type="button" (click)="move($index, 1)" [disabled]="$index === form.players.length - 1 || player.captain" aria-label="Descendre"><app-icon name="arrow-down" [size]="14" /></button>
              <button class="btn btn-danger btn-sm" type="button" (click)="removePlayer($index)" [disabled]="form.players.length <= 4" aria-label="Retirer le joueur"><app-icon name="x" [size]="14" /></button>
            </div>
          }
          <button class="btn btn-gold btn-sm" type="button" style="justify-self: start" (click)="addPlayer()" [disabled]="form.players.length >= 12">+ Ajouter un joueur</button>
        </fieldset>

        <div class="form-actions">
          @if (id() && canChooseCoach()) {
            <button class="btn btn-danger" type="button" style="margin-right: auto" (click)="remove()">Supprimer l’équipe</button>
          }
          <a class="btn btn-ghost" routerLink="/gestion/equipes">Annuler</a>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .players { display: grid; gap: 8px; margin: 0; padding: 16px 0 0; border: 0; border-top: 1px solid var(--line); }
    .player-line { display: grid; grid-template-columns: 14px 26px 38px 22px 1fr auto auto auto auto; align-items: center; gap: 6px; padding: 2px; border-radius: 8px; }
    .grip { display: inline-flex; color: var(--sand); cursor: grab; }
    .dragging { opacity: .45; }
    .drop-target { background: rgba(240, 205, 135, .45); box-shadow: inset 0 0 0 2px var(--ochre); }
    .photo-x { min-height: 22px; width: 22px; padding: 0; }
    .num { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .coach { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
    .coach-name { display: grid; flex: 1; min-width: 0; }
    .coach-results { display: grid; gap: 2px; margin: 0; padding: 4px; list-style: none; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
    .coach-results button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
    .coach-results button:hover { background: rgba(240, 205, 135, .3); }
  `,
})
export class TeamFormPage implements OnInit {
  private readonly dialog = inject(DialogService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly id = input<string>();
  /** Coach désigné ; seul le manager de l'équipe (ou un administrateur) peut le changer. */
  protected readonly coach = signal<(Owner & { email?: string }) | null>(null);
  protected readonly coachResults = signal<(Owner & { email: string })[]>([]);
  protected coachQuery = '';
  private ownerId: number | null = null;
  protected form: { name: string; city: string | null; players: PlayerForm[] } = {
    name: '',
    city: '',
    players: Array.from({ length: 4 }, (_, i) => ({ name: '', preview: null, captain: i === 0 })),
  };
  protected logo: ImageState = { preview: null };
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const id = this.id();
    if (id) {
      this.api.team(+id).subscribe((team) => {
        this.form = { name: team.name, city: team.city, players: (team.players ?? []).map((p) => ({ id: p.id, name: p.name, preview: p.photo_url ?? null, captain: !!p.is_captain })) };
        this.ensureCaptain();
        this.pinCaptain();
        this.logo = { preview: team.logo_url ?? null };
        this.coach.set(team.coach ?? null);
        this.ownerId = team.owner?.id ?? null;
      });
    }
  }

  protected canChooseCoach(): boolean {
    const user = this.auth.user();
    return !this.id() || !!user && (user.role === 'admin' || user.id === this.ownerId);
  }

  protected searchCoach(term: string): void {
    if (term.trim().length < 2) {
      this.coachResults.set([]);
      return;
    }
    this.api.searchUsers(term.trim()).subscribe((users) => {
      if (term === this.coachQuery) this.coachResults.set(users);
    });
  }

  protected pickCoach(user: Owner & { email: string }): void {
    this.coach.set(user);
    this.coachQuery = '';
    this.coachResults.set([]);
  }

  protected addPlayer(): void {
    this.form.players.push({ name: '', preview: null });
  }

  protected removePlayer(index: number): void {
    this.form.players.splice(index, 1);
    this.ensureCaptain();
  }

  /** Le capitaine est placé en tête de l'effectif : il joue toujours en première position. */
  protected setCaptain(player: PlayerForm): void {
    this.form.players.forEach((p) => (p.captain = p === player));
    this.pinCaptain();
  }

  private pinCaptain(): void {
    const players = this.form.players;
    const index = players.findIndex((p) => p.captain);
    if (index > 0) players.unshift(...players.splice(index, 1));
  }

  /** Une équipe a toujours un capitaine : à défaut, le premier joueur. */
  private ensureCaptain(): void {
    const players = this.form.players;
    if (players.length && !players.some((p) => p.captain)) players[0].captain = true;
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
    this.pinCaptain();
  }

  protected move(index: number, delta: number): void {
    const players = this.form.players;
    [players[index], players[index + delta]] = [players[index + delta], players[index]];
    this.pinCaptain();
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
    if (!this.coach()) {
      this.error.set('Désignez le coach de l’équipe.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      coach_id: this.coach()!.id,
      name: this.form.name,
      city: this.form.city || null,
      players: this.form.players.map((p) => ({ id: p.id, name: p.name.trim() })),
      captain: Math.max(0, this.form.players.findIndex((p) => p.captain)),
    };
    const id = this.id();
    (id ? this.api.updateTeam(+id, payload) : this.api.createTeam(payload)).pipe(switchMap((team) => this.saveImages(team))).subscribe({
      next: () => this.router.navigateByUrl('/gestion/equipes'),
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

  protected async remove(): Promise<void> {
    const id = this.id();
    if (id && (await this.dialog.confirm('Elle sera retirée de toutes les compétitions.', { title: 'Supprimer cette équipe ?', confirmLabel: 'Supprimer', danger: true }))) {
      this.api.deleteTeam(+id).subscribe({
        next: () => this.router.navigateByUrl('/gestion/equipes'),
        error: (e) => this.error.set(errorMessage(e)),
      });
    }
  }
}
