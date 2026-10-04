import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Player {
  name: string;
  score: number;
}

interface Team {
  name: string;
  players: Player[];
  bonus: number;
}

interface MatchResponse {
  data: { id: number };
}

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './matchme.html',
})
export class App {
  private readonly http = inject(HttpClient);
  protected readonly increments = [10, 20, 30, 40, -10, -20, -30, -40];
  protected readonly Math = Math;
  protected teamA: Team = this.createTeam();
  protected teamB: Team = this.createTeam();
  protected started = false;
  protected saving = false;
  protected matchId: number | null = null;
  protected errorMessage = '';

  protected createMatch(): void {
    this.saving = true;
    this.errorMessage = '';
    this.http.post<MatchResponse>('/api/matches', {
      team_a: { name: this.teamA.name.trim(), players: this.teamA.players.map(({ name }) => name.trim()) },
      team_b: { name: this.teamB.name.trim(), players: this.teamB.players.map(({ name }) => name.trim()) },
    }).subscribe({
      next: ({ data }) => {
        this.matchId = data.id;
        this.started = true;
        this.saving = false;
      },
      error: () => {
        this.errorMessage = 'Impossible de créer le match. Vérifiez que l’API Laravel est démarrée.';
        this.saving = false;
      },
    });
  }

  protected teamScore(team: Team): number {
    return team.players.reduce((total, player) => total + player.score, team.bonus);
  }

  protected changePlayerScore(player: Player, team: Team, points: number): void {
    player.score += points;
    team.players = [...team.players];
  }

  protected changeTeamScore(team: Team, points: number): void {
    team.bonus += points;
  }

  protected resetMatch(): void {
    this.teamA = this.createTeam();
    this.teamB = this.createTeam();
    this.matchId = null;
    this.started = false;
  }

  private createTeam(): Team {
    return {
      name: '',
      players: Array.from({ length: 4 }, () => ({ name: '', score: 0 })),
      bonus: 0,
    };
  }
}
