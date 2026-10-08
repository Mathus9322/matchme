import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Competition, COMPETITION_STATUS_LABELS, ROLE_LABELS, Game, GAME_STATUS_LABELS, GameStatus, Stats, Team, User } from '../core/models';

type Tab = 'dashboard' | 'users' | 'competitions' | 'teams' | 'games';

interface EditableUser extends User {
  password?: string;
}

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Espace administrateur</p>
        <h1 class="page-title">Gestion des <em>données</em></h1>
      </div>
    </div>

    <div class="tabs" role="tablist">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}</button>
      }
    </div>

    @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 16px">{{ m.text }}</p> }

    @switch (tab()) {
      @case ('dashboard') {
        @if (stats(); as s) {
          <div class="stats">
            <div class="stat stat-accent"><strong>{{ s.live_games }}</strong><span>Matchs en direct</span></div>
            <div class="stat"><strong>{{ s.users }}</strong><span>Utilisateurs</span></div>
            <div class="stat"><strong>{{ s.managers }}</strong><span>Managers</span></div>
            <div class="stat"><strong>{{ s.competitions }}</strong><span>Compétitions</span></div>
            <div class="stat"><strong>{{ s.teams }}</strong><span>Équipes</span></div>
            <div class="stat"><strong>{{ s.players }}</strong><span>Joueurs</span></div>
            <div class="stat"><strong>{{ s.games }}</strong><span>Matchs</span></div>
          </div>
        }
      }

      @case ('users') {
        <div class="row" style="margin-bottom: 14px">
          <input class="input" style="max-width: 320px" type="search" placeholder="Nom ou e-mail…" [(ngModel)]="userSearch" (ngModelChange)="loadUsers()" aria-label="Rechercher un utilisateur" />
          <select class="input" style="max-width: 200px" [(ngModel)]="roleFilter" (ngModelChange)="loadUsers()" aria-label="Filtrer par rôle">
            <option value="">Tous les rôles</option>
            @for (r of roles; track r[0]) { <option [value]="r[0]">{{ r[1] }}s</option> }
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Nouveau mot de passe</th><th class="num">Équipes</th><th class="num">Compét.</th><th>Inscrit le</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td><input class="input" [(ngModel)]="u.name" [name]="'name' + u.id" aria-label="Nom" /></td>
                  <td><input class="input" type="email" [(ngModel)]="u.email" [name]="'email' + u.id" aria-label="E-mail" /></td>
                  <td>
                    <select class="input" [(ngModel)]="u.role" [name]="'role' + u.id" [disabled]="u.id === auth.user()?.id" aria-label="Rôle">
                      @for (r of roles; track r[0]) { <option [value]="r[0]">{{ r[1] }}</option> }
                    </select>
                  </td>
                  <td><input class="input" type="password" [(ngModel)]="u.password" [name]="'pw' + u.id" placeholder="Inchangé" autocomplete="new-password" aria-label="Nouveau mot de passe" /></td>
                  <td class="num">{{ u.teams_count }}</td>
                  <td class="num">{{ u.competitions_count }}</td>
                  <td class="small muted">{{ u.created_at | date: 'd MMM y' }}</td>
                  <td>
                    <div class="row" style="flex-wrap: nowrap">
                      <button class="btn btn-gold btn-sm" type="button" (click)="saveUser(u)">Enregistrer</button>
                      @if (u.id !== auth.user()?.id) {
                        <button class="btn btn-danger btn-sm" type="button" (click)="confirmRun('Supprimer ' + u.name + ' et toutes ses données ?', api.deleteUser(u.id), 'Utilisateur supprimé.')">Supprimer</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @case ('competitions') {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Organisateur</th><th>Statut</th><th class="num">Équipes</th><th class="num">Matchs</th><th></th></tr></thead>
            <tbody>
              @for (c of competitions(); track c.id) {
                <tr>
                  <td><a [routerLink]="['/competitions', c.id]"><strong>{{ c.name }}</strong></a></td>
                  <td>{{ c.owner?.name }}</td>
                  <td>
                    <select class="input" [ngModel]="c.status" (ngModelChange)="setCompetitionStatus(c, $event)" [name]="'cs' + c.id" aria-label="Statut">
                      @for (s of competitionStatuses; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
                    </select>
                  </td>
                  <td class="num">{{ c.teams_count }}</td>
                  <td class="num">{{ c.games_count }}</td>
                  <td>
                    <div class="row" style="flex-wrap: nowrap">
                      <a class="btn btn-ghost btn-sm" [routerLink]="['/competitions', c.id, 'modifier']">Modifier</a>
                      <button class="btn btn-danger btn-sm" type="button" (click)="confirmRun('Supprimer « ' + c.name + ' » ?', api.deleteCompetition(c.id), 'Compétition supprimée.')">Supprimer</button>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="6" class="muted">Aucune compétition.</td></tr> }
            </tbody>
          </table>
        </div>
      }

      @case ('teams') {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Équipe</th><th>Ville</th><th>Capitaine</th><th class="num">Joueurs</th><th></th></tr></thead>
            <tbody>
              @for (t of teams(); track t.id) {
                <tr>
                  <td><strong>{{ t.name }}</strong></td>
                  <td>{{ t.city }}</td>
                  <td>{{ t.owner?.name }}</td>
                  <td class="num">{{ t.players_count }}</td>
                  <td>
                    <div class="row" style="flex-wrap: nowrap">
                      <a class="btn btn-ghost btn-sm" [routerLink]="['/equipes', t.id, 'modifier']">Joueurs</a>
                      <button class="btn btn-danger btn-sm" type="button" (click)="confirmRun('Supprimer l’équipe ' + t.name + ' ?', api.deleteTeam(t.id), 'Équipe supprimée.')">Supprimer</button>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="5" class="muted">Aucune équipe.</td></tr> }
            </tbody>
          </table>
        </div>
      }

      @case ('games') {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Match</th><th>Compétition</th><th>Date</th><th class="num">Score</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              @for (g of games(); track g.id) {
                <tr>
                  <td><a [routerLink]="['/matchs', g.id]"><strong>{{ g.team_a.name }} – {{ g.team_b.name }}</strong></a><br /><span class="small muted">{{ g.round }}</span></td>
                  <td>{{ g.competition?.name ?? 'Match amical' }}</td>
                  <td class="small">{{ g.scheduled_at | date: 'd MMM y, HH:mm' }}</td>
                  <td class="num">{{ g.team_a.score }} – {{ g.team_b.score }}</td>
                  <td>
                    <select class="input" [ngModel]="g.status" (ngModelChange)="setGameStatus(g, $event)" [name]="'gs' + g.id" aria-label="Statut">
                      @for (s of gameStatuses; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
                    </select>
                  </td>
                  <td><button class="btn btn-danger btn-sm" type="button" (click)="confirmRun('Supprimer ce match et ses points ?', api.deleteGame(g.id), 'Match supprimé.')">Supprimer</button></td>
                </tr>
              } @empty { <tr><td colspan="6" class="muted">Aucun match.</td></tr> }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class AdminPage {
  protected readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Tableau de bord' },
    { id: 'users', label: 'Utilisateurs' },
    { id: 'competitions', label: 'Compétitions' },
    { id: 'teams', label: 'Équipes' },
    { id: 'games', label: 'Matchs' },
  ];
  protected readonly competitionStatuses = Object.entries(COMPETITION_STATUS_LABELS);
  protected readonly gameStatuses = Object.entries(GAME_STATUS_LABELS);
  protected readonly tab = signal<Tab>('dashboard');
  protected readonly stats = signal<Stats | null>(null);
  protected readonly users = signal<EditableUser[]>([]);
  protected readonly competitions = signal<Competition[]>([]);
  protected readonly teams = signal<Team[]>([]);
  protected readonly games = signal<Game[]>([]);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected userSearch = '';
  protected roleFilter = '';
  protected readonly roles = Object.entries(ROLE_LABELS);

  constructor() {
    this.open('dashboard');
  }

  protected open(tab: Tab): void {
    this.tab.set(tab);
    this.message.set(null);
    this.reload();
  }

  protected loadUsers(): void {
    this.api.users(this.userSearch, this.roleFilter).subscribe((users) => this.users.set(users));
  }

  protected saveUser(user: EditableUser): void {
    const { name, email, role, password } = user;
    this.run(this.api.updateUser(user.id, { name, email, role, password: password || null }), 'Utilisateur mis à jour.');
  }

  protected setCompetitionStatus(c: Competition, status: Competition['status']): void {
    const { name, description, starts_on, ends_on, format } = c;
    this.run(this.api.updateCompetition(c.id, { name, description, starts_on, ends_on, status, format }), 'Statut mis à jour.');
  }

  protected setGameStatus(g: Game, status: GameStatus): void {
    const payload = { team_a_id: g.team_a.id, team_b_id: g.team_b.id, round: g.round, scheduled_at: g.scheduled_at, status };
    this.run(this.api.updateGame(g.id, payload), 'Statut du match mis à jour.');
  }

  protected confirmRun(question: string, request: Observable<unknown>, success: string): void {
    if (confirm(question)) {
      this.run(request, success);
    }
  }

  private run(request: Observable<unknown>, success: string): void {
    request.subscribe({
      next: () => {
        this.message.set({ text: success, ok: true });
        this.reload();
      },
      error: (e) => {
        this.message.set({ text: errorMessage(e), ok: false });
        this.reload();
      },
    });
  }

  private reload(): void {
    switch (this.tab()) {
      case 'dashboard':
        this.api.stats().subscribe((s) => this.stats.set(s));
        break;
      case 'users':
        this.loadUsers();
        break;
      case 'competitions':
        this.api.competitions().subscribe((list) => this.competitions.set(list));
        break;
      case 'teams':
        this.api.teams().subscribe((list) => this.teams.set(list));
        break;
      case 'games':
        this.api.games({ limit: 500 }).subscribe((list) => this.games.set(list));
        break;
    }
  }
}
