import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { AuthService } from '../core/auth.service';
import { Team } from '../core/models';
import { Avatar } from '../shared/avatar';

const FALLBACKS = [
  'linear-gradient(135deg, #2b2219, #8b4d1c)',
  'linear-gradient(135deg, #8b4d1c, #c7902b)',
  'linear-gradient(135deg, #3d3226, #ac6327)',
  'linear-gradient(135deg, #6b6558, #2b2219)',
];

@Component({
  selector: 'app-teams',
  imports: [RouterLink, FormsModule, Avatar],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">{{ area.inManage() ? 'Espace gestion' : 'Effectifs' }}</p>
        <h1 class="page-title">{{ area.inManage() && !auth.isAdmin() ? 'Mes équipes' : 'Équipes' }}</h1>
      </div>
      @if (area.inManage() && auth.canOrganize()) {
        <a class="btn" routerLink="/gestion/equipes/nouvelle">+ Nouvelle équipe</a>
      }
    </div>

    <div class="row" style="margin-bottom: 20px">
      <input class="input" style="max-width: 320px" type="search" placeholder="Rechercher une équipe…" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Rechercher une équipe" />
      @if (area.inManage() && auth.isAdmin()) {
        <label class="row small muted"><input type="checkbox" [ngModel]="mineOnly()" (ngModelChange)="mineOnly.set($event)" /> Mes équipes uniquement</label>
      }
    </div>

    <div class="grid team-grid">
      @for (team of filtered(); track team.id) {
        <article class="team-card">
          <div class="band" [style.background]="team.logo_url ? null : fallback(team.id)">
            @if (team.logo_url) { <img class="band-img" [src]="team.logo_url" alt="" loading="lazy" /> }
            <span class="count">{{ team.players_count ?? 0 }} joueurs</span>
          </div>
          <div class="panel">
            <svg class="wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 60 V44 Q0 22 30 18 C100 7 150 0 215 0 C295 0 340 10 368 22 Q400 34 400 60 Z" />
            </svg>
            <app-avatar class="logo" [src]="team.logo_url" [name]="team.name" [size]="64" shape="square" />
            <h3><a class="stretched" [routerLink]="area.link('equipes', team.id)">{{ team.name }}</a></h3>
            <p class="meta">{{ team.city || 'Ville non renseignée' }} · coach {{ team.coach?.name || 'à désigner' }}</p>
            @if (team.is_coach || (team.can_manage && area.inManage())) {
              <div class="row foot">
                @if (team.is_coach) { <span class="badge badge-ongoing">Vous êtes coach</span> }
                @if (team.can_manage && area.inManage()) {
                  <a class="btn btn-ghost btn-sm edit" [routerLink]="area.manage('equipes', team.id, 'modifier')">Modifier l’effectif</a>
                }
              </div>
            }
          </div>
        </article>
      } @empty {
        <p class="empty" style="grid-column: 1 / -1">Aucune équipe trouvée.</p>
      }
    </div>
  `,
  styles: `
    .team-grid { grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 22px; }
    .team-card { --cream: #ffe3af; position: relative; display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--cream); transition: border-color .15s ease, transform .15s ease; }
    .team-card:hover { border-color: var(--ochre); transform: translateY(-2px); }
    .band { position: relative; height: 110px; flex: none; overflow: hidden; }
    /* Le logo agrandi et flouté sert de fond au bandeau. */
    .band-img { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); object-fit: cover; filter: blur(14px) saturate(1.2); opacity: .85; }
    .count { position: absolute; top: 14px; right: 14px; padding: 5px 14px; border-radius: 999px; background: var(--rust-dark); color: white; font-size: 12px; }
    .panel { position: relative; flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 6px 22px 20px; background: var(--cream); }
    .wave { position: absolute; left: 0; right: 0; bottom: calc(100% - 1px); width: 100%; height: 34px; fill: var(--cream); }
    .logo { position: relative; margin-top: -44px; border: 3px solid var(--cream); box-sizing: content-box; }
    h3 { margin: 4px 0 0; font-family: 'Anton', Impact, 'Arial Narrow', sans-serif; font-size: 22px; font-weight: 400; line-height: 1.15; overflow-wrap: anywhere; }
    .meta { margin: 0; color: var(--rust-dark); font-size: 12px; }
    .foot { margin-top: auto; padding-top: 12px; gap: 8px; }
    .stretched { color: inherit; text-decoration: none; }
    .stretched::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
    .edit { position: relative; z-index: 1; }
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
    const me = this.auth.user()?.id;
    return this.teams().filter((t) => (!mine || t.owner?.id === me || t.coach?.id === me) && (!term || t.name.toLowerCase().includes(term)));
  });

  /** Fond du bandeau quand l'équipe n'a pas de logo (choisi selon l'id). */
  protected fallback(id: number): string {
    return FALLBACKS[id % FALLBACKS.length];
  }

  constructor() {
    this.api.teams().subscribe((teams) => this.teams.set(teams));
  }
}
