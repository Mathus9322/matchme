import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { AuthService } from '../core/auth.service';
import { Team } from '../core/models';
import { Avatar } from '../shared/avatar';

@Component({
  selector: 'app-teams',
  imports: [RouterLink, FormsModule, Avatar],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">{{ area.inManage() ? 'Espace gestion' : 'Effectifs' }}</p>
        <h1 class="page-title">{{ area.inManage() && !auth.isAdmin() ? 'Mes équipes' : 'Équipes' }}</h1>
      </div>
      @if (area.inManage()) {
        <a class="btn" routerLink="/gestion/equipes/nouvelle">+ Nouvelle équipe</a>
      }
    </div>

    <div class="row" style="margin-bottom: 20px">
      <input class="input" style="max-width: 320px" type="search" placeholder="Rechercher une équipe…" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Rechercher une équipe" />
      @if (area.inManage() && auth.isAdmin()) {
        <label class="row small muted"><input type="checkbox" [ngModel]="mineOnly()" (ngModelChange)="mineOnly.set($event)" /> Mes équipes uniquement</label>
      }
    </div>

    <div class="grid">
      @for (team of filtered(); track team.id) {
        <article class="card team-card">
          <div class="row" style="flex-wrap: nowrap">
            <app-avatar [src]="team.logo_url" [name]="team.name" [size]="48" shape="square" />
            <div style="flex: 1; min-width: 0">
              <h3 style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"><a class="stretched" [routerLink]="area.link('equipes', team.id)">{{ team.name }}</a></h3>
              <span class="badge">{{ team.players_count }} joueurs</span>
            </div>
          </div>
          <p class="meta">{{ team.city || 'Ville non renseignée' }} · capitaine {{ team.owner?.name }}</p>
          @if (team.can_manage && area.inManage()) {
            <div class="row edit-row" style="margin-top: 14px">
              <a class="btn btn-ghost btn-sm" [routerLink]="area.manage('equipes', team.id, 'modifier')">Modifier l’effectif</a>
            </div>
          }
        </article>
      } @empty {
        <p class="empty" style="grid-column: 1 / -1">Aucune équipe trouvée.</p>
      }
    </div>
  `,
  styles: `
    .team-card { position: relative; transition: border-color .15s ease, transform .15s ease; }
    .team-card:hover { border-color: var(--ochre); transform: translateY(-2px); }
    .stretched { color: inherit; text-decoration: none; }
    .stretched::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
    .edit-row { position: relative; z-index: 1; }
  `,
})
export class TeamsPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly area = inject(AreaService);
  protected readonly teams = signal<Team[]>([]);
  protected readonly search = signal('');
  protected readonly mineOnly = signal(false);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    // Espace gestion : un manager ne voit que ses équipes (l'admin peut filtrer les siennes).
    const mine = this.area.inManage() && (!this.auth.isAdmin() || this.mineOnly());
    return this.teams().filter((t) => (!mine || t.owner?.id === this.auth.user()?.id) && (!term || t.name.toLowerCase().includes(term)));
  });

  constructor() {
    this.api.teams().subscribe((teams) => this.teams.set(teams));
  }
}
