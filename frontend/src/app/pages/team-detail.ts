import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { COMPETITION_STATUS_LABELS, TeamStats } from '../core/models';
import { Avatar } from '../shared/avatar';
import { GameRow } from '../shared/game-row';
import { BackButton } from '../shared/back-button';
import { Icon } from '../shared/icon';
import { PlayerStatsModal } from '../shared/player-stats-modal';

/** Fiche publique d'une équipe : bilan, effectif et statistiques des joueurs. */
@Component({
  selector: 'app-team-detail',
  imports: [BackButton, RouterLink, Avatar, GameRow, Icon, PlayerStatsModal],
  template: `
    <app-back-button [fallback]="area.link('equipes')" />
    @if (stats(); as s) {
      <section class="hero">
        <app-avatar [src]="s.team.logo_url" [name]="s.team.name" [size]="112" shape="square" />
        <div class="hero-text">
          <p class="eyebrow">Fiche équipe{{ s.team.city ? ' · ' + s.team.city : '' }}</p>
          <h1 class="page-title">{{ s.team.name }}</h1>
          <div class="row" style="margin-top: 12px">
            @if (s.team.coach; as c) {
              <span class="row small muted"><app-avatar [src]="c.avatar_url" [name]="c.name" [size]="26" /> Coach <strong style="color: var(--ink)">{{ c.name }}</strong></span>
            }
            @if (s.team.owner; as o) {
              <span class="row small muted"><app-avatar [src]="o.avatar_url" [name]="o.name" [size]="26" /> Manager <strong style="color: var(--ink)">{{ o.name }}</strong></span>
            }
            @if (s.form.length) {
              <span class="form" title="Forme sur les derniers matchs (du plus récent au plus ancien)">
                @for (r of s.form; track $index) { <span class="res" [class]="'res res-' + r">{{ r }}</span> }
              </span>
            }
          </div>
        </div>
        @if (canEdit()) {
          <a class="btn btn-ghost" [routerLink]="area.manage('equipes', s.team.id, 'modifier')"><app-icon name="pencil" /> Modifier l’équipe</a>
        }
      </section>

      <div class="kpis">
        <div class="kpi"><strong>{{ s.record.played }}</strong><span>Matchs joués</span></div>
        <div class="kpi accent"><strong>{{ s.record.won }}</strong><span>Victoires</span></div>
        <div class="kpi"><strong>{{ s.record.drawn }}</strong><span>Nuls</span></div>
        <div class="kpi"><strong>{{ s.record.lost }}</strong><span>Défaites</span></div>
        <div class="kpi"><strong>{{ s.record.win_rate }}<small>%</small></strong><span>Taux de victoire</span></div>
        <div class="kpi"><strong>{{ s.record.points_for }}</strong><span>Points marqués · {{ s.record.average_for }} / match</span></div>
        <div class="kpi"><strong>{{ s.record.points_against }}</strong><span>Points encaissés · {{ s.record.average_against }} / match</span></div>
      </div>

      <div class="layout">
        <section>
          <div class="row" style="justify-content: space-between; margin-bottom: 12px">
            <h2 class="section-title">Effectif et statistiques</h2>
            <span class="muted small">Cliquez sur un joueur pour sa fiche détaillée</span>
          </div>
          <div class="table-wrap">
            <table class="players">
              <thead><tr><th>Joueur</th><th class="num">Matchs</th><th class="num">Points</th><th class="num">Moy.</th><th class="num opt">Bonnes rép.</th><th class="num opt">Pénalités</th></tr></thead>
              <tbody>
                @for (p of s.players; track p.id; let i = $index) {
                  <tr tabindex="0" role="button" (click)="playerId.set(p.id)" (keydown.enter)="playerId.set(p.id)" [attr.aria-label]="'Fiche de ' + p.name">
                    <td>
                      <span class="who">
                        <app-avatar [src]="p.photo_url" [name]="p.name" [size]="36" />
                        <span><strong>{{ p.name }}</strong>@if (p.is_captain) { <span class="captain" title="Capitaine">C</span> }@if (s.top_scorer?.id === p.id) { <span class="badge top"><app-icon name="star" [size]="11" /> Meilleur marqueur</span> }</span>
                      </span>
                    </td>
                    <td class="num">{{ p.appearances }}</td>
                    <td class="num"><strong>{{ p.points }}</strong></td>
                    <td class="num">{{ p.average }}</td>
                    <td class="num opt">{{ p.answers }}</td>
                    <td class="num opt">{{ p.penalties }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted">Aucun joueur.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <aside class="stack">
          @if (s.top_scorer; as t) {
            <button type="button" class="card scorer" (click)="playerId.set(t.id)">
              <app-avatar [src]="t.photo_url" [name]="t.name" [size]="56" />
              <span><span class="eyebrow" style="margin: 0">Meilleur marqueur</span><strong>{{ t.name }}</strong><span class="muted small">{{ t.points }} points · {{ t.average }} / match</span></span>
            </button>
          }
          <section class="card">
            <h3 class="sub">Compétitions</h3>
            @for (c of s.team.competitions; track c.id) {
              <a class="comp" [routerLink]="area.link('competitions', c.id)"><span>{{ c.name }}</span><span [class]="'badge badge-' + c.status">{{ statuses[c.status] }}</span></a>
            } @empty {
              <p class="muted small" style="margin: 0">Aucune compétition.</p>
            }
          </section>
        </aside>
      </div>

      <div class="two-cols section">
        <section>
          <h2 class="section-title" style="margin-bottom: 12px">Derniers résultats</h2>
          <div class="stack">
            @for (g of s.recent; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> } @empty { <p class="empty">Aucun match terminé.</p> }
          </div>
        </section>
        <section>
          <h2 class="section-title" style="margin-bottom: 12px">Prochains matchs</h2>
          <div class="stack">
            @for (g of s.upcoming; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> } @empty { <p class="empty">Aucun match à venir.</p> }
          </div>
        </section>
      </div>

      <app-player-stats-modal [playerId]="playerId()" (closed)="playerId.set(null)" />
    } @else if (notFound()) {
      <p class="empty">Équipe introuvable.</p>
    }
  `,
  styles: `
    .hero { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
    .hero-text { flex: 1; min-width: 240px; }
    .form { display: inline-flex; gap: 3px; }
    .res { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; font-family: var(--mono); font-size: 10px; font-weight: 700; }
    .res-V { background: var(--ochre); color: var(--ink); }
    .res-N { background: var(--sand); color: var(--ink); }
    .res-D { background: var(--rust); color: white; }
    .kpis { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 28px; }
    .kpi { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .kpi strong { display: block; font-family: var(--display); font-size: 30px; line-height: 1.1; }
    .kpi small { font-size: 16px; }
    .kpi span { color: var(--muted); font-size: 11px; }
    .kpi.accent { border-color: var(--ochre); background: var(--gold); }
    .kpi.accent span { color: var(--ink); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
    .players tbody tr { cursor: pointer; transition: background .12s ease; }
    .players tbody tr:hover, .players tbody tr:focus-visible { background: rgba(240, 205, 135, .22); outline: none; }
    .who { display: flex; align-items: center; gap: 12px; }
    .who > span { display: grid; gap: 3px; }
    .top { justify-self: start; background: var(--gold); }
    .scorer { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; cursor: pointer; }
    .scorer:hover { border-color: var(--ochre); }
    .scorer > span { display: grid; gap: 2px; }
    .scorer strong { font-size: 16px; }
    .sub { margin: 0 0 10px; font-size: 14px; }
    .comp { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); color: var(--ink); font-size: 13px; text-decoration: none; }
    .comp:hover span:first-child { color: var(--rust); }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .kpis { grid-template-columns: repeat(2, 1fr); } .players .opt { display: none; } }
  `,
})
export class TeamDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly area = inject(AreaService);
  readonly id = input.required<string>();
  protected readonly stats = signal<TeamStats | null>(null);
  protected readonly notFound = signal(false);
  protected readonly playerId = signal<number | null>(null);
  protected readonly statuses = COMPETITION_STATUS_LABELS;

  ngOnInit(): void {
    this.api.teamStats(+this.id()).subscribe({ next: (s) => this.stats.set(s), error: () => this.notFound.set(true) });
  }

  protected canEdit(): boolean {
    return !!this.stats()?.team.can_manage;
  }
}
