import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage, FriendlySide } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fromLocalInput } from '../core/dates';
import { Game, Team } from '../core/models';
import { GameRow } from '../shared/game-row';
import { Icon } from '../shared/icon';

interface SideForm {
  mode: 'quick' | 'existing';
  teamId: number | null;
  name: string;
  players: { name: string }[];
}

@Component({
  selector: 'app-friendly',
  imports: [Icon, FormsModule, RouterLink, GameRow],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow"><span class="live-dot"></span> Hors compétition</p>
        <h1 class="page-title">Match <em>amical</em></h1>
        <p class="lead">Deux équipes, un arbitre, un score. Lancez une rencontre en quelques secondes et notez chaque point en direct.</p>
      </div>
    </div>

    @if (!auth.isLoggedIn()) {
      <div class="card row" style="justify-content: space-between">
        <span>Connectez-vous pour créer et arbitrer un match amical.</span>
        <div class="row">
          <a class="btn btn-ghost" routerLink="/connexion" [queryParams]="{ retour: '/amical' }">Connexion</a>
          <a class="btn" routerLink="/inscription">Créer un compte</a>
        </div>
      </div>
    } @else {
      <form class="card form" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }

        <div class="sides">
          @for (side of sides; track $index; let b = $odd) {
            <fieldset class="side" [class.side-b]="b">
              <legend><span class="team-index">{{ b ? 'B' : 'A' }}</span> Équipe {{ b ? 'B' : 'A' }}</legend>
              <div class="switch" role="radiogroup">
                <button type="button" [class.active]="side.mode === 'quick'" (click)="side.mode = 'quick'">Équipe rapide</button>
                <button type="button" [class.active]="side.mode === 'existing'" (click)="side.mode = 'existing'" [disabled]="!teams().length">Équipe existante</button>
              </div>

              @if (side.mode === 'existing') {
                <label class="field"><span>Choisir une équipe</span>
                  <select [name]="'team' + $index" [(ngModel)]="side.teamId" required>
                    <option [ngValue]="null" disabled>Sélectionner…</option>
                    @for (t of teams(); track t.id) {
                      <option [ngValue]="t.id">{{ t.name }}{{ t.city ? ' (' + t.city + ')' : '' }} · {{ t.players_count }} joueurs</option>
                    }
                  </select>
                </label>
              } @else {
                <label class="field"><span>Nom de l’équipe</span>
                  <input [name]="'name' + $index" [(ngModel)]="side.name" maxlength="80" [placeholder]="b ? 'Ex. Jambaar de Dakar' : 'Ex. Gaïndé de Thiès'" required />
                </label>
                @for (p of side.players; track $index; let i = $index) {
                  <div class="player-line">
                    <span class="num">0{{ i + 1 }}</span>
                    <input class="input" [name]="'p' + $index + '-' + i" [(ngModel)]="p.name" maxlength="60" [placeholder]="'Joueur ' + (i + 1)" required />
                    <button class="btn btn-danger btn-sm" type="button" (click)="side.players.splice(i, 1)" [disabled]="side.players.length <= 4" aria-label="Retirer le joueur"><app-icon name="x" [size]="14" /></button>
                  </div>
                }
                <button class="btn btn-ghost btn-sm" type="button" style="justify-self: start" (click)="side.players.push({ name: '' })" [disabled]="side.players.length >= 6">+ Remplaçant</button>
                <p class="muted small" style="margin: 0">4 titulaires obligatoires, 2 remplaçants au maximum (entrée possible à la mi-temps). L’équipe sera enregistrée dans « Mes équipes » pour vos prochains matchs.</p>
              }
            </fieldset>
            @if (!b) { <div class="vs" aria-hidden="true">VS</div> }
          }
        </div>

        <div class="form-grid">
          <label class="field"><span>Intitulé (facultatif)</span>
            <input name="round" [(ngModel)]="round" maxlength="60" placeholder="Match amical" />
          </label>
          <label class="field"><span>Date et heure (facultatif)</span>
            <input type="datetime-local" name="scheduled_at" [(ngModel)]="scheduledAt" [disabled]="startNow" />
          </label>
        </div>

        <div class="form-actions" style="align-items: center">
          <label class="row small" style="margin-right: auto"><input type="checkbox" name="start" [(ngModel)]="startNow" /> Démarrer le match immédiatement</label>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Création…' : startNow ? 'Lancer le match' : 'Programmer le match' }} @if (!saving() && startNow) { <app-icon name="arrow-up-right" /> }</button>
        </div>
      </form>

      <section class="section">
        <h2 class="section-title" style="margin-bottom: 14px">Mes matchs amicaux</h2>
        <div class="stack">
          @for (game of mine(); track game.id) {
            <app-game-row [game]="game" />
          } @empty {
            <p class="empty">Vous n’avez pas encore créé de match amical.</p>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .sides { display: grid; grid-template-columns: 1fr 44px 1fr; gap: 18px; align-items: start; }
    .side { display: grid; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0; }
    .side legend { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-weight: 700; }
    .team-index { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 50%; background: var(--ochre); color: var(--ink); font-family: var(--mono); font-size: 12px; }
    .side-b .team-index { background: var(--rust); color: white; }
    .switch { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); }
    .switch button { padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; }
    .switch button.active { background: var(--gold); color: var(--ink); }
    .switch button:disabled { cursor: not-allowed; opacity: .5; }
    .player-line { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 6px; }
    .num { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .vs { align-self: center; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    @media (max-width: 820px) { .sides { grid-template-columns: 1fr; } .vs { justify-self: center; } }
  `,
})
export class FriendlyPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly teams = signal<Team[]>([]);
  protected readonly mine = signal<Game[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected sides: SideForm[] = [this.emptySide(), this.emptySide()];
  protected round = '';
  protected scheduledAt = '';
  protected startNow = true;

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.api.teams().subscribe((teams) => this.teams.set(teams));
      this.api.games({ friendly: true, mine: true }).subscribe((games) => this.mine.set(games));
    }
  }

  protected submit(): void {
    const [a, b] = this.sides.map((side) => this.toPayload(side));
    if (!a || !b) {
      this.error.set('Complétez les deux équipes.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .createFriendly({
        team_a: a,
        team_b: b,
        round: this.round.trim() || null,
        scheduled_at: this.startNow ? null : fromLocalInput(this.scheduledAt),
        start: this.startNow,
      })
      .subscribe({
        next: (game) => this.router.navigate(['/gestion/matchs', game.id]),
        error: (e) => {
          this.error.set(errorMessage(e));
          this.saving.set(false);
        },
      });
  }

  private toPayload(side: SideForm): FriendlySide | null {
    if (side.mode === 'existing') {
      return side.teamId ? { id: side.teamId } : null;
    }
    const players = side.players.map((p) => p.name.trim()).filter(Boolean);
    return side.name.trim() && players.length ? { name: side.name.trim(), players } : null;
  }

  private emptySide(): SideForm {
    return { mode: 'quick', teamId: null, name: '', players: Array.from({ length: 4 }, () => ({ name: '' })) };
  }
}
