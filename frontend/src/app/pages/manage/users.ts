import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ManagedTeam, ManagedUser, ManagedUsers, Owner } from '../../core/models';
import { Avatar } from '../../shared/avatar';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { DialogService } from '../../shared/dialog';

type CoachForm = { id: number | null; name: string; email: string; password: string; teamId: number | null };

/**
 * Utilisateurs sous la gestion du manager : les coachs de ses équipes et des équipes inscrites à ses compétitions.
 * Création de comptes coach, modification, suppression et changement du coach de chaque équipe.
 */
@Component({
  selector: 'app-managed-users',
  imports: [FormsModule, RouterLink, Avatar, Icon, Modal],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Espace gestion</p>
        <h1 class="page-title">Mes <em>coachs</em></h1>
        <p class="lead">Les coachs de vos équipes et des équipes inscrites à vos compétitions : créez leurs comptes, corrigez-les, changez le coach d’une équipe.</p>
      </div>
      <button class="btn" type="button" (click)="openCreate()" [disabled]="!teams().length"><app-icon name="plus" [size]="16" /> Nouveau coach</button>
    </div>

    @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 16px">{{ m.text }}</p> }

    <section class="section" style="margin-top: 0">
      <h2 class="section-title" style="margin-bottom: 12px">Coachs ({{ users().length }})</h2>
      <div class="stack">
        @for (u of users(); track u.id) {
          <article class="card user">
            <app-avatar [src]="u.avatar_url" [name]="u.name" [size]="44" />
            <div class="user-main">
              <strong>{{ u.name }}</strong>
              <span class="muted small">{{ u.email }}</span>
              <span class="chips">
                @for (t of u.teams; track t.id) { <a class="badge" [routerLink]="['/gestion/equipes', t.id]">{{ t.name }}</a> }
                @if (u.other_teams) { <span class="badge muted-badge" title="Équipes d’autres managers">+ {{ u.other_teams }} ailleurs</span> }
                @if (u.role !== 'user') { <span class="badge badge-admin">{{ u.role === 'admin' ? 'Administrateur' : 'Manager' }}</span> }
              </span>
            </div>
            @if (u.can_edit) {
              <div class="row user-actions">
                <button class="btn btn-ghost btn-sm" type="button" (click)="openEdit(u)"><app-icon name="pencil" [size]="14" /> Modifier</button>
                <button class="btn btn-danger btn-sm" type="button" (click)="remove(u)" [disabled]="busy()">Supprimer</button>
              </div>
            } @else {
              <span class="muted small">Compte géré par son titulaire</span>
            }
          </article>
        } @empty {
          <p class="empty">Aucun coach pour l’instant. Créez une équipe puis désignez son coach.</p>
        }
      </div>
    </section>

    <section class="section">
      <h2 class="section-title" style="margin-bottom: 6px">Coach de chaque équipe</h2>
      <p class="muted small" style="margin: 0 0 12px">Choisissez un de vos coachs ou cherchez un autre utilisateur inscrit. Une équipe a toujours un coach.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Équipe</th><th>Coach actuel</th><th>Changer de coach</th></tr></thead>
          <tbody>
            @for (t of teams(); track t.id) {
              <tr>
                <td>
                  <span class="row" style="flex-wrap: nowrap"><app-avatar [src]="t.logo_url" [name]="t.name" [size]="30" shape="square" /> <a [routerLink]="['/gestion/equipes', t.id]"><strong>{{ t.name }}</strong></a></span>
                  @if (t.external) { <span class="muted small">Équipe de {{ t.owner?.name }}, inscrite à votre compétition</span> }
                </td>
                <td>
                  @if (t.coach; as c) { <span class="row" style="flex-wrap: nowrap"><app-avatar [src]="c.avatar_url" [name]="c.name" [size]="26" /> {{ c.name }}</span> }
                  @else { <span class="muted">Aucun</span> }
                </td>
                <td>
                  <select class="input" [ngModel]="t.coach?.id ?? null" (ngModelChange)="assign(t, $event)" [name]="'coach' + t.id" [disabled]="busy()" aria-label="Coach de l’équipe">
                    @if (t.coach && !isListed(t.coach.id)) { <option [ngValue]="t.coach.id">{{ t.coach.name }}</option> }
                    @for (u of users(); track u.id) { <option [ngValue]="u.id">{{ u.name }}</option> }
                    @for (u of extraCandidates(); track u.id) { <option [ngValue]="u.id">{{ u.name }} (nouveau)</option> }
                  </select>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="muted">Aucune équipe sous votre gestion.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="search">
        <input class="input" type="search" [(ngModel)]="searchTerm" (ngModelChange)="search($event)" placeholder="Ajouter à la liste un utilisateur inscrit (nom ou e-mail)…" aria-label="Rechercher un utilisateur" />
        @if (results().length) {
          <ul class="results">
            @for (r of results(); track r.id) {
              <li><button type="button" (click)="addCandidate(r)"><app-avatar [src]="r.avatar_url" [name]="r.name" [size]="26" /> <strong>{{ r.name }}</strong> <span class="muted small">{{ r.email }}</span></button></li>
            }
          </ul>
        }
      </div>
    </section>

    <app-modal [open]="!!form()" [title]="form()?.id ? 'Modifier le coach' : 'Nouveau coach'" eyebrow="Compte coach" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="form" (ngSubmit)="save(f)">
          @if (formError()) { <p class="alert" role="alert">{{ formError() }}</p> }
          <label class="field"><span>Nom</span><input name="name" [(ngModel)]="f.name" maxlength="80" required /></label>
          <label class="field"><span>E-mail</span><input type="email" name="email" [(ngModel)]="f.email" maxlength="120" required /></label>
          <label class="field"><span>{{ f.id ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe provisoire' }}</span>
            <input type="password" name="password" [(ngModel)]="f.password" minlength="8" [required]="!f.id" autocomplete="new-password" [placeholder]="f.id ? 'Inchangé' : '8 caractères minimum'" />
          </label>
          @if (!f.id) {
            <label class="field"><span>Équipe confiée</span>
              <select name="team" [(ngModel)]="f.teamId" required>
                <option [ngValue]="null" disabled>Sélectionner…</option>
                @for (t of teams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}{{ t.coach ? ' · remplace ' + t.coach.name : '' }}</option> }
              </select>
            </label>
            <p class="muted small" style="margin: 0">Communiquez l’e-mail et le mot de passe provisoire au coach : il pourra se connecter et gérer son effectif.</p>
          }
          <div class="form-actions">
            <button class="btn btn-ghost" type="button" (click)="form.set(null)">Annuler</button>
            <button class="btn" type="submit" [disabled]="busy()">{{ f.id ? 'Enregistrer' : 'Créer le compte' }}</button>
          </div>
        </form>
      }
    </app-modal>
  `,
  styles: `
    .user { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .user-main { display: grid; flex: 1; gap: 2px; min-width: 200px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chips a.badge { text-decoration: none; }
    .muted-badge { color: var(--muted); }
    .search { position: relative; max-width: 460px; margin-top: 14px; }
    .results { position: absolute; z-index: 5; left: 0; right: 0; display: grid; gap: 2px; margin: 4px 0 0; padding: 4px; list-style: none; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 16px 40px -18px rgba(43, 34, 25, .45); }
    .results button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
    .results button:hover { background: rgba(240, 205, 135, .3); }
  `,
})
export class ManagedUsersPage {
  private readonly dialog = inject(DialogService);
  protected readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly users = signal<ManagedUser[]>([]);
  protected readonly teams = signal<ManagedTeam[]>([]);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected readonly form = signal<CoachForm | null>(null);
  protected readonly formError = signal('');
  /** Utilisateurs inscrits ajoutés à la liste des choix de coach (recherche). */
  protected readonly extraCandidates = signal<(Owner & { email: string })[]>([]);
  protected readonly results = signal<(Owner & { email: string })[]>([]);
  protected searchTerm = '';

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.managedUsers().subscribe((r) => this.apply(r));
  }

  private apply(r: ManagedUsers): void {
    this.users.set(r.data);
    this.teams.set(r.teams);
    this.extraCandidates.update((list) => list.filter((c) => !r.data.some((u) => u.id === c.id)));
  }

  protected isListed(id: number): boolean {
    return this.users().some((u) => u.id === id) || this.extraCandidates().some((u) => u.id === id);
  }

  protected openCreate(): void {
    this.formError.set('');
    this.form.set({ id: null, name: '', email: '', password: '', teamId: this.teams().find((t) => !t.coach)?.id ?? null });
  }

  protected openEdit(user: ManagedUser): void {
    this.formError.set('');
    this.form.set({ id: user.id, name: user.name, email: user.email, password: '', teamId: null });
  }

  protected save(f: CoachForm): void {
    const request: Observable<unknown> = f.id
      ? this.api.updateManagedUser(f.id, { name: f.name.trim(), email: f.email.trim(), password: f.password || null })
      : this.api.createCoach({ name: f.name.trim(), email: f.email.trim(), password: f.password, team_id: f.teamId! });
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.form.set(null);
        this.message.set({ text: f.id ? 'Compte du coach mis à jour.' : `Compte créé : ${f.name} est maintenant coach.`, ok: true });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.formError.set(errorMessage(e));
      },
    });
  }

  protected async remove(user: ManagedUser): Promise<void> {
    if (!(await this.dialog.confirm('Ses équipes reviendront à leur manager, qui en redeviendra le coach.', { title: `Supprimer le compte de ${user.name} ?`, confirmLabel: 'Supprimer', danger: true }))) return;
    this.run(this.api.deleteManagedUser(user.id), `Compte de ${user.name} supprimé.`);
  }

  protected assign(team: ManagedTeam, coachId: number): void {
    if (!coachId || coachId === team.coach?.id) return;
    this.busy.set(true);
    this.api.assignCoach(team.id, coachId).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.apply(r);
        this.message.set({ text: `Coach de ${team.name} mis à jour.`, ok: true });
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
        this.load();
      },
    });
  }

  protected search(term: string): void {
    if (term.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.api.searchUsers(term.trim()).subscribe((users) => {
      if (term === this.searchTerm) this.results.set(users.filter((u) => !this.isListed(u.id)));
    });
  }

  protected addCandidate(user: Owner & { email: string }): void {
    this.extraCandidates.update((list) => [...list, user]);
    this.results.set([]);
    this.searchTerm = '';
    this.message.set({ text: `${user.name} est ajouté aux choix de coach : sélectionnez-le pour une équipe.`, ok: true });
  }

  private run(request: Observable<unknown>, success: string): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set({ text: success, ok: true });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
      },
    });
  }
}
