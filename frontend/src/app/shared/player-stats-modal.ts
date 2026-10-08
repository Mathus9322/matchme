import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AreaService } from '../core/area.service';
import { PlayerStats } from '../core/models';
import { Avatar } from './avatar';
import { Modal } from './modal';

/** Fiche joueur : totaux, points par rubrique et historique match par match. */
@Component({
  selector: 'app-player-stats-modal',
  imports: [Modal, Avatar, DatePipe, RouterLink],
  template: `
    <app-modal [open]="playerId() !== null" [wide]="true" [title]="stats()?.player?.name ?? 'Joueur'" [eyebrow]="stats()?.team?.name ?? ''" (closed)="closed.emit()">
      @if (stats(); as s) {
        <div class="head">
          <app-avatar [src]="s.player.photo_url" [name]="s.player.name" [size]="84" />
          <div class="kpis">
            <div><strong>{{ s.appearances }}</strong><span>Matchs joués</span></div>
            <div class="accent"><strong>{{ s.points }}</strong><span>Points</span></div>
            <div><strong>{{ s.average }}</strong><span>Moyenne / match</span></div>
            <div><strong>{{ s.answers }}</strong><span>Bonnes réponses</span></div>
            <div><strong>{{ s.penalties }}</strong><span>Pénalités</span></div>
          </div>
        </div>

        @if (s.best) {
          <p class="best">Meilleur match : <strong>{{ s.best.points }} points</strong> contre {{ s.best.opponent }} ({{ s.best.competition }}{{ s.best.round ? ' · ' + s.best.round : '' }})</p>
        }

        @if (s.rubrics.length) {
          <h3 class="h">Points par rubrique</h3>
          <ul class="bars">
            @for (r of s.rubrics; track r.name) {
              <li>
                <span class="label">{{ r.name }}</span>
                <span class="bar"><span [style.width.%]="barWidth(s, r.points)" [class.neg]="r.points < 0"></span></span>
                <span class="val">{{ r.points }} pts · {{ r.answers }} rép.</span>
              </li>
            }
          </ul>
        }

        <h3 class="h">Historique des matchs</h3>
        @if (s.matches.length) {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Adversaire</th><th>Compétition</th><th>Score</th><th>Poste</th><th class="num">Points</th><th class="num">Rép.</th><th class="num">Pén.</th></tr></thead>
              <tbody>
                @for (m of s.matches; track m.game_id) {
                  <tr>
                    <td class="small">{{ m.date | date: 'd MMM y' }}</td>
                    <td><a [routerLink]="area.link('matchs', m.game_id)" (click)="closed.emit()">{{ m.opponent }}</a></td>
                    <td class="small muted">{{ m.competition }}{{ m.round ? ' · ' + m.round : '' }}</td>
                    <td class="score"><span class="res" [class]="'res res-' + m.result">{{ m.result }}</span> {{ m.score }}</td>
                    <td class="small">{{ m.role === 'substitute' ? 'Remplaçant' : 'Titulaire' }}</td>
                    <td class="num"><strong>{{ m.points }}</strong></td>
                    <td class="num">{{ m.answers }}</td>
                    <td class="num">{{ m.penalties }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="empty">Aucun match joué pour l’instant.</p>
        }
      } @else {
        <p class="muted small">Chargement…</p>
      }
    </app-modal>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .kpis { display: grid; flex: 1; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .kpis div { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
    .kpis strong { display: block; font-family: var(--display); font-size: 26px; }
    .kpis span { color: var(--muted); font-size: 11px; }
    .kpis .accent { border-color: var(--rust); background: var(--rust); color: white; }
    .kpis .accent span { color: rgba(255, 255, 255, .85); }
    .best { margin: 14px 0 0; padding: 10px 14px; border-radius: 9px; background: rgba(240, 205, 135, .35); font-size: 13px; }
    .h { margin: 20px 0 10px; font-size: 14px; }
    .bars { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .bars li { display: grid; grid-template-columns: minmax(120px, 200px) 1fr auto; align-items: center; gap: 12px; font-size: 12px; }
    .bar { height: 10px; overflow: hidden; border-radius: 99px; background: rgba(190, 189, 177, .35); }
    .bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--gold), var(--ochre)); }
    .bar span.neg { background: var(--rust); }
    .val { color: var(--muted); white-space: nowrap; }
    .score { white-space: nowrap; }
    .res { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 5px; font-family: var(--mono); font-size: 10px; font-weight: 700; }
    .res-V { background: var(--ochre); color: var(--ink); }
    .res-N { background: var(--sand); color: var(--ink); }
    .res-D { background: var(--rust); color: white; }
    @media (max-width: 640px) { .kpis { grid-template-columns: repeat(3, 1fr); } .bars li { grid-template-columns: 1fr auto; } .bar { grid-column: 1 / -1; grid-row: 2; } }
  `,
})
export class PlayerStatsModal {
  private readonly api = inject(ApiService);
  protected readonly area = inject(AreaService);
  readonly playerId = input<number | null>(null);
  readonly closed = output<void>();
  protected readonly stats = signal<PlayerStats | null>(null);

  constructor() {
    effect(() => {
      const id = this.playerId();
      this.stats.set(null);
      if (id !== null) {
        this.api.playerStats(id).subscribe((s) => this.stats.set(s));
      }
    });
  }

  protected barWidth(s: PlayerStats, points: number): number {
    const max = Math.max(...s.rubrics.map((r) => Math.abs(r.points)), 1);
    return (Math.abs(points) / max) * 100;
  }
}
