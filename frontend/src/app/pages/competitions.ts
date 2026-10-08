import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { AuthService } from '../core/auth.service';
import { Competition, COMPETITION_STATUS_LABELS } from '../core/models';

@Component({
  selector: 'app-competitions',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow">{{ area.inManage() ? 'Espace gestion' : 'Tournois' }}</p>
        <h1 class="page-title">{{ area.inManage() && !auth.isAdmin() ? 'Mes compétitions' : 'Compétitions' }}</h1>
      </div>
      @if (area.inManage()) {
        <a class="btn" routerLink="/gestion/competitions/nouvelle">+ Nouvelle compétition</a>
      }
    </div>

    <div class="tabs">
      <button type="button" [class.active]="filter() === ''" (click)="filter.set('')">Toutes</button>
      @for (status of statuses; track status) {
        <button type="button" [class.active]="filter() === status" (click)="filter.set(status)">{{ labels[status] }}</button>
      }
      @if (auth.isLoggedIn() && !area.inManage()) {
        <button type="button" [class.active]="filter() === 'mine'" (click)="filter.set('mine')">Les miennes</button>
      }
    </div>

    <div class="grid">
      @for (competition of filtered(); track competition.id) {
        <a class="card card-link" [routerLink]="area.link('competitions', competition.id)">
          <span [class]="'badge badge-' + competition.status">{{ labels[competition.status] }}</span>
          <h3 style="margin-top: 12px">{{ competition.name }}</h3>
          <p class="meta">
            @if (competition.starts_on) { Du {{ competition.starts_on | date: 'd MMM y' }} }
            @if (competition.ends_on) { au {{ competition.ends_on | date: 'd MMM y' }} }
          </p>
          <p class="meta">{{ competition.teams_count }} équipes · {{ competition.games_count }} matchs · par {{ competition.owner?.name }}</p>
        </a>
      } @empty {
        <p class="empty" style="grid-column: 1 / -1">Aucune compétition pour ce filtre.</p>
      }
    </div>
  `,
})
export class CompetitionsPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly area = inject(AreaService);
  protected readonly labels = COMPETITION_STATUS_LABELS;
  protected readonly statuses = Object.keys(COMPETITION_STATUS_LABELS) as (keyof typeof COMPETITION_STATUS_LABELS)[];
  protected readonly all = signal<Competition[]>([]);
  protected readonly filter = signal('');
  protected readonly filtered = computed(() => {
    const filter = this.filter();
    const userId = this.auth.user()?.id;
    // Espace gestion : un manager ne voit que ses compétitions, l'admin les voit toutes.
    const scoped = this.area.inManage() && !this.auth.isAdmin() ? this.all().filter((c) => c.owner?.id === userId) : this.all();
    return scoped.filter((c) => !filter || (filter === 'mine' ? c.owner?.id === userId : c.status === filter));
  });

  constructor() {
    this.api.competitions().subscribe((list) => this.all.set(list));
  }
}
