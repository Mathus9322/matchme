import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Game, GAME_STATUS_LABELS } from '../core/models';
import { Avatar } from './avatar';

@Component({
  selector: 'app-game-row',
  imports: [RouterLink, DatePipe, Avatar],
  template: `
    @let g = game();
    <a class="game-row" [routerLink]="['/matchs', g.id]">
      <span class="team team-a"><span class="team-label">{{ g.team_a.name }}</span><app-avatar [src]="g.team_a.logo_url" [name]="g.team_a.name" [size]="28" shape="square" /></span>
      <span class="score">{{ g.status === 'scheduled' ? 'vs' : g.team_a.score + ' – ' + g.team_b.score }}</span>
      <span class="team"><app-avatar [src]="g.team_b.logo_url" [name]="g.team_b.name" [size]="28" shape="square" /><span class="team-label">{{ g.team_b.name }}</span></span>
      <span class="info">
        <span class="badge" [class]="'badge badge-' + g.status">
          @if (g.status === 'live') { <span class="live-dot" style="background:white"></span> }
          {{ labels[g.status] }}
        </span>
        <span>
          @if (showCompetition()) { {{ g.competition?.name ?? 'Amical' }} · }
          {{ g.round }}
          @if (g.scheduled_at) { · {{ g.scheduled_at | date: 'd MMM, HH:mm' }} }
        </span>
      </span>
    </a>
  `,
})
export class GameRow {
  readonly game = input.required<Game>();
  readonly showCompetition = input(false);
  protected readonly labels = GAME_STATUS_LABELS;
}
