import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Team } from '../core/models';
import { Avatar } from '../shared/avatar';

@Component({
  selector: 'app-teams',
  imports: [RouterLink, FormsModule, Avatar],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">Effectifs</p>
        <h1 class="page-title">Équipes</h1>
      </div>
      @if (auth.isLoggedIn()) {
        <a class="btn" routerLink="/equipes/nouvelle">+ Nouvelle équipe</a>
      }
    </div>

    <div class="row" style="margin-bottom: 20px">
      <input class="input" style="max-width: 320px" type="search" placeholder="Rechercher une équipe…" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Rechercher une équipe" />
      @if (auth.isLoggedIn()) {
        <label class="row small muted"><input type="checkbox" [ngModel]="mineOnly()" (ngModelChange)="mineOnly.set($event)" /> Mes équipes uniquement</label>
      }
    </div>

    <div class="grid">
      @for (team of filtered(); track team.id) {
        <article class="card">
          <div class="row" style="flex-wrap: nowrap">
            <app-avatar [src]="team.logo_url" [name]="team.name" [size]="48" shape="square" />
            <div style="flex: 1; min-width: 0">
              <h3 style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ team.name }}</h3>
              <span class="badge">{{ team.players_count }} joueurs</span>
            </div>
          </div>
          <p class="meta">{{ team.city || 'Ville non renseignée' }} · capitaine {{ team.owner?.name }}</p>
          @if (team.can_manage) {
            <div class="row" style="margin-top: 14px">
              <a class="btn btn-ghost btn-sm" [routerLink]="['/equipes', team.id, 'modifier']">Modifier l’effectif</a>
            </div>
          }
        </article>
      } @empty {
        <p class="empty" style="grid-column: 1 / -1">Aucune équipe trouvée.</p>
      }
    </div>
  `,
})
export class TeamsPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly teams = signal<Team[]>([]);
  protected readonly search = signal('');
  protected readonly mineOnly = signal(false);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.teams().filter((t) => (!this.mineOnly() || t.owner?.id === this.auth.user()?.id) && (!term || t.name.toLowerCase().includes(term)));
  });

  constructor() {
    this.api.teams().subscribe((teams) => this.teams.set(teams));
  }
}
