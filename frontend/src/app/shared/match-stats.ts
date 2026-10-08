import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { Matchup } from '../core/models';
import { Avatar } from './avatar';
import { GameRow } from './game-row';
import { Icon } from './icon';
import { PlayerStatsModal } from './player-stats-modal';

/** Statistiques importées dans un match (amical ou de compétition) : bilans, joueurs, face-à-face. */
@Component({
  selector: 'app-match-stats',
  imports: [RouterLink, Avatar, GameRow, Icon, PlayerStatsModal],
  template: `
    <details class="fold section" [open]="open()">
      <summary><app-icon name="arrow-down" [size]="14" /> Statistiques des équipes et des joueurs</summary>
      @if (data(); as d) {
        <div class="body">
          <div class="sides">
            @for (t of [d.team_a, d.team_b]; track t.id; let b = $odd) {
              <section class="side" [class.side-b]="b">
                <header>
                  <app-avatar [src]="t.logo_url" [name]="t.name" [size]="44" shape="square" />
                  <div>
                    <a class="team-link" [routerLink]="area.link('equipes', t.id)"><strong>{{ t.name }}</strong></a>
                    <span class="muted small">{{ t.record.played }} match(s) joué(s){{ t.record.friendlies ? ' · dont ' + t.record.friendlies + ' amical(aux)' : '' }}</span>
                  </div>
                  @if (t.form.length) {
                    <span class="form">@for (r of t.form; track $index) { <span [class]="'res res-' + r">{{ r }}</span> }</span>
                  }
                </header>
                <dl class="record">
                  <div><dt>V</dt><dd>{{ t.record.won }}</dd></div>
                  <div><dt>N</dt><dd>{{ t.record.drawn }}</dd></div>
                  <div><dt>D</dt><dd>{{ t.record.lost }}</dd></div>
                  <div><dt>Victoires</dt><dd>{{ t.record.win_rate }}%</dd></div>
                  <div><dt>Moy. marqués</dt><dd>{{ t.record.average_for }}</dd></div>
                  <div><dt>Moy. encaissés</dt><dd>{{ t.record.average_against }}</dd></div>
                </dl>
                <table class="players">
                  <thead><tr><th>Joueur</th><th class="num">M</th><th class="num">Pts</th><th class="num">Moy.</th><th class="num opt">Rép.</th><th class="num opt">Pén.</th></tr></thead>
                  <tbody>
                    @for (p of t.players; track p.id; let i = $index) {
                      <tr tabindex="0" role="button" (click)="playerId.set(p.id)" (keydown.enter)="playerId.set(p.id)" [attr.aria-label]="'Fiche de ' + p.name">
                        <td><span class="who"><app-avatar [src]="p.photo_url" [name]="p.name" [size]="24" /> {{ p.name }}@if (p.is_captain) { <span class="captain" title="Capitaine">C</span> }@if (i === 0 && p.points > 0) { <app-icon name="star" [size]="12" label="Meilleur marqueur" /> }</span></td>
                        <td class="num">{{ p.appearances }}</td>
                        <td class="num"><strong>{{ p.points }}</strong></td>
                        <td class="num">{{ p.average }}</td>
                        <td class="num opt">{{ p.answers }}</td>
                        <td class="num opt">{{ p.penalties }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
          </div>

          <section class="h2h">
            <h3>Face-à-face</h3>
            @if (d.head_to_head.played) {
              <div class="h2h-bar" role="img" [attr.aria-label]="d.head_to_head.wins_a + ' victoires de ' + d.team_a.name + ', ' + d.head_to_head.draws + ' nuls, ' + d.head_to_head.wins_b + ' victoires de ' + d.team_b.name">
                <span class="a" [style.flex]="d.head_to_head.wins_a || 0.0001">{{ d.head_to_head.wins_a }}</span>
                <span class="n" [style.flex]="d.head_to_head.draws || 0.0001">{{ d.head_to_head.draws }}</span>
                <span class="b" [style.flex]="d.head_to_head.wins_b || 0.0001">{{ d.head_to_head.wins_b }}</span>
              </div>
              <p class="legend small muted"><span>{{ d.team_a.name }}</span><span>Nuls</span><span>{{ d.team_b.name }}</span></p>
              <div class="stack">@for (g of d.head_to_head.meetings; track g.id) { <app-game-row [game]="g" [showCompetition]="true" /> }</div>
            } @else {
              <p class="muted small" style="margin: 0">Première rencontre entre ces deux équipes.</p>
            }
          </section>
        </div>
      } @else {
        <p class="muted small body">Chargement des statistiques…</p>
      }
    </details>
    <app-player-stats-modal [playerId]="playerId()" (closed)="playerId.set(null)" />
  `,
  styles: `
    .fold { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .fold > summary { display: flex; align-items: center; gap: 8px; padding: 14px 18px; font-size: 15px; font-weight: 700; cursor: pointer; list-style: none; user-select: none; }
    .fold > summary::-webkit-details-marker { display: none; }
    .fold > summary app-icon { transition: transform .2s ease; transform: rotate(-90deg); }
    .fold[open] > summary app-icon { transform: none; }
    .body { padding: 0 18px 18px; }
    .sides { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .side { min-width: 0; padding: 14px; border: 1px solid var(--line); border-top: 4px solid var(--ochre); border-radius: 12px; }
    .side-b { border-top-color: var(--rust); }
    .side header { display: flex; align-items: center; gap: 12px; }
    .side header > div { display: grid; flex: 1; min-width: 0; gap: 2px; }
    .team-link { color: inherit; text-decoration: none; }
    .team-link:hover { color: var(--rust); text-decoration: underline; }
    .form { display: inline-flex; gap: 3px; }
    .res { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 5px; font-family: var(--mono); font-size: 10px; font-weight: 700; }
    .res-V { background: var(--ochre); color: var(--ink); }
    .res-N { background: var(--sand); color: var(--ink); }
    .res-D { background: var(--rust); color: white; }
    .record { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 12px 0; }
    .record div { padding: 8px; border-radius: 8px; background: rgba(240, 205, 135, .2); text-align: center; }
    .record dt { color: var(--muted); font-family: var(--mono); font-size: 9px; text-transform: uppercase; }
    .record dd { margin: 2px 0 0; font-family: var(--display); font-size: 20px; font-weight: 600; }
    .players { font-size: 12px; }
    .players th, .players td { padding: 6px 8px; }
    .players tbody tr { cursor: pointer; }
    .players tbody tr:hover, .players tbody tr:focus-visible { background: rgba(240, 205, 135, .22); outline: none; }
    .who { display: inline-flex; align-items: center; gap: 8px; }
    .who app-icon { color: var(--ochre); }
    .h2h { margin-top: 16px; }
    .h2h h3 { margin: 0 0 10px; font-size: 14px; }
    .h2h-bar { display: flex; overflow: hidden; height: 28px; border-radius: 99px; font-family: var(--mono); font-size: 12px; font-weight: 700; }
    .h2h-bar span { display: grid; place-items: center; min-width: 28px; }
    .h2h-bar .a { background: var(--ochre); color: var(--ink); }
    .h2h-bar .n { background: var(--sand); color: var(--ink); }
    .h2h-bar .b { background: var(--rust); color: white; }
    .legend { display: flex; justify-content: space-between; margin: 6px 0 12px; }
    @media (max-width: 1000px) { .sides { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .record { grid-template-columns: repeat(3, 1fr); } .players .opt { display: none; } }
  `,
})
export class MatchStats {
  private readonly api = inject(ApiService);
  protected readonly area = inject(AreaService);
  readonly gameId = input.required<number>();
  /** Recharger quand le statut change (un match terminé enrichit les statistiques). */
  readonly status = input<string>('');
  readonly open = input(false);
  protected readonly data = signal<Matchup | null>(null);
  protected readonly playerId = signal<number | null>(null);
  private loadedKey = '';

  constructor() {
    effect(() => {
      const key = `${this.gameId()}:${this.status()}`;
      if (key === this.loadedKey) return;
      this.loadedKey = key;
      this.api.matchup(this.gameId()).subscribe((d) => this.data.set(d));
    });
  }
}
