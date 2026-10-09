import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { COMPETITION_STATUS_LABELS, GAME_STATUS_LABELS, ROLE_LABELS, Stats } from '../core/models';
import { ActivityChart } from './activity-chart';
import { BarItem, BarList } from './bar-list';

/** Statistiques de toute la plateforme (administrateurs) : chiffres clés, activité par semaine et répartitions. */
@Component({
  selector: 'app-admin-insights',
  imports: [FormsModule, ActivityChart, BarList],
  template: `
    @if (stats(); as s) {
      <div class="stats">
        <div class="stat"><strong>{{ s.users }}</strong><span>Utilisateurs</span></div>
        <div class="stat"><strong>{{ s.managers }}</strong><span>Managers</span></div>
        <div class="stat"><strong>{{ s.players }}</strong><span>Joueurs</span></div>
        <div class="stat"><strong>{{ s.games }}</strong><span>Matchs au total</span></div>
      </div>

      <div class="row charts-filter">
        <label class="row small muted" style="gap: 8px">Période
          <select class="input" style="width: auto" [ngModel]="weeks()" (ngModelChange)="setWeeks($event)" aria-label="Période de l’activité">
            @for (w of periods; track w[0]) { <option [ngValue]="w[0]">{{ w[1] }}</option> }
          </select>
        </label>
      </div>
      <section class="card chart-card" [class.loading]="loading()">
        <h3 class="chart-title">Activité par semaine</h3>
        <p class="chart-sub">Matchs terminés et comptes créés chaque semaine</p>
        <app-activity-chart [points]="s.activity" />
      </section>

      <div class="breakdowns">
        <section class="card chart-card">
          <h3 class="chart-title">Matchs par statut</h3>
          <app-bar-list [items]="labelled(s.games_by_status, gameLabels)" />
        </section>
        <section class="card chart-card">
          <h3 class="chart-title">Compétitions par statut</h3>
          <app-bar-list [items]="labelled(s.competitions_by_status, competitionLabels)" />
        </section>
        <section class="card chart-card">
          <h3 class="chart-title">Utilisateurs par rôle</h3>
          <app-bar-list [items]="labelled(s.users_by_role, roleLabels)" />
        </section>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .charts-filter { margin: 20px 0 12px; }
    .chart-card { padding: 20px 22px; transition: opacity .2s ease; }
    .chart-card.loading { opacity: .55; }
    .chart-title { margin: 0; font-size: 15px; font-weight: 700; }
    .chart-sub { margin: 2px 0 14px; color: var(--muted); font-size: 12px; }
    .breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 16px; margin-top: 16px; }
    .breakdowns .chart-title { margin-bottom: 14px; }
  `,
})
export class AdminInsights {
  private readonly api = inject(ApiService);
  protected readonly stats = signal<Stats | null>(null);
  protected readonly weeks = signal(12);
  protected readonly loading = signal(false);
  protected readonly periods: [number, string][] = [[4, '4 dernières semaines'], [12, '12 dernières semaines'], [26, '6 derniers mois'], [52, '12 derniers mois']];
  protected readonly gameLabels: Record<string, string> = GAME_STATUS_LABELS;
  protected readonly competitionLabels: Record<string, string> = COMPETITION_STATUS_LABELS;
  protected readonly roleLabels: Record<string, string> = ROLE_LABELS;

  constructor() {
    this.load();
  }

  protected setWeeks(weeks: number): void {
    this.weeks.set(weeks);
    this.load();
  }

  protected labelled(rows: { key: string; count: number }[], labels: Record<string, string>): BarItem[] {
    return rows.map((r) => ({ label: labels[r.key] ?? r.key, count: r.count }));
  }

  /** Les graphiques gardent leur tracé (atténué) pendant le rechargement. */
  private load(): void {
    this.loading.set(true);
    this.api.stats(this.weeks()).subscribe({
      next: (s) => {
        this.stats.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
