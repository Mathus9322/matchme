import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Game } from '../../core/models';
import { AdminInsights } from '../../shared/admin-insights';
import { GameRow } from '../../shared/game-row';
import { Icon } from '../../shared/icon';

interface Overview {
  stats: { competitions: number; ongoing_competitions: number; teams: number; live_games: number; scheduled_games: number; finished_games: number };
  live: Game[];
  upcoming: Game[];
  recent: Game[];
}

/** Tableau de bord de l'espace de gestion. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, GameRow, Icon, AdminInsights],
  template: `
    <p class="eyebrow">{{ auth.isAdmin() ? 'Administration' : auth.canOrganize() ? 'Espace manager' : 'Espace coach' }}</p>
    <h1 class="page-title">Bonjour, <em>{{ firstName() }}</em></h1>
    <p class="lead">{{ auth.isAdmin() ? 'Vue d’ensemble de toute la plateforme.' : auth.canOrganize() ? 'Vos compétitions, vos équipes et vos matchs en un coup d’œil.' : 'Vos équipes, leurs effectifs et vos matchs amicaux.' }}</p>

    <div class="actions">
      @if (auth.canOrganize()) {
        <a class="action" routerLink="/gestion/competitions/nouvelle"><app-icon name="trophy" [size]="20" /> <span><strong>Nouvelle compétition</strong><span>Poules ou championnat</span></span></a>
        <a class="action" routerLink="/gestion/equipes/nouvelle"><app-icon name="users" [size]="20" /> <span><strong>Nouvelle équipe</strong><span>Joueurs, logo, coach</span></span></a>
      } @else {
        <a class="action" routerLink="/gestion/equipes"><app-icon name="users" [size]="20" /> <span><strong>Mes équipes</strong><span>Ajouter ou retirer des joueurs</span></span></a>
      }
      <a class="action" routerLink="/gestion/amical"><app-icon name="zap" [size]="20" /> <span><strong>Match amical</strong><span>{{ auth.isCoach() ? 'Défier un autre coach' : 'Hors compétition' }}</span></span></a>
    </div>

    @if (data(); as d) {
      <div class="stats">
        <div class="stat stat-accent"><strong>{{ d.stats.live_games }}</strong><span>Matchs en direct</span></div>
        @if (auth.canOrganize()) {
          <a class="stat" routerLink="/gestion/competitions"><strong>{{ d.stats.competitions }}</strong><span>Compétitions · {{ d.stats.ongoing_competitions }} en cours</span></a>
        }
        <a class="stat" routerLink="/gestion/equipes"><strong>{{ d.stats.teams }}</strong><span>Équipes</span></a>
        <div class="stat"><strong>{{ d.stats.scheduled_games }}</strong><span>Matchs à jouer</span></div>
        <div class="stat"><strong>{{ d.stats.finished_games }}</strong><span>Matchs terminés</span></div>
      </div>

      @if (auth.isAdmin()) {
        <section class="section">
          <h2 class="section-title" style="margin-bottom: 12px">Statistiques de la plateforme</h2>
          <app-admin-insights />
        </section>
      }

      <section class="section">
        <h2 class="section-title" style="margin-bottom: 12px"><span class="live-dot"></span>&nbsp; En direct</h2>
        <div class="stack">
          @for (g of d.live; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> } @empty { <p class="empty">Aucun de vos matchs n’est en cours.</p> }
        </div>
      </section>
      <div class="two-cols games-cols section">
        <section>
          <h2 class="section-title" style="margin-bottom: 12px">Prochains matchs</h2>
          <div class="stack">
            @for (g of d.upcoming; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> } @empty { <p class="empty">Aucun match programmé.</p> }
          </div>
        </section>
        <section>
          <h2 class="section-title" style="margin-bottom: 12px">Derniers résultats</h2>
          <div class="stack">
            @for (g of d.recent; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> } @empty { <p class="empty">Aucun résultat pour l’instant.</p> }
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
    .action { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); text-decoration: none; transition: border-color .15s ease, transform .15s ease; }
    .action:hover { border-color: var(--ochre); transform: translateY(-2px); }
    .action app-icon { color: var(--rust); }
    .action > span { display: grid; gap: 2px; font-size: 14px; }
    .action > span span { color: var(--muted); font-size: 12px; }
    /* Côte à côte seulement si chaque colonne garde assez de place pour les noms d'équipes. */
    .games-cols { grid-template-columns: repeat(auto-fit, minmax(min(440px, 100%), 1fr)); }
    a.stat { color: inherit; text-decoration: none; }
    a.stat:hover { border-color: var(--ochre); }
    @media (max-width: 760px) { .actions { grid-template-columns: 1fr; } }
  `,
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly data = signal<Overview | null>(null);

  constructor() {
    this.api.manageOverview().subscribe((d) => this.data.set(d as Overview));
  }

  protected firstName(): string {
    return (this.auth.user()?.name ?? '').split(' ')[0];
  }
}
