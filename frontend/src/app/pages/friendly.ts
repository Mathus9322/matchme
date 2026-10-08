import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage, FriendlySide } from '../core/api.service';
import { Avatar } from '../shared/avatar';
import { AuthService } from '../core/auth.service';
import { fromLocalInput } from '../core/dates';
import { FRIENDLY_REQUEST_STATUS_LABELS, FriendlyRequest, Game, MAX_SUBSTITUTES, PlayerRef, STARTERS, Team, TeamStats } from '../core/models';
import { GameRow } from '../shared/game-row';
import { Icon } from '../shared/icon';
import { DialogService } from '../shared/dialog';

interface SideForm {
  mode: 'quick' | 'existing';
  teamId: number | null;
  /** Effectif de l'équipe existante, dans l'ordre choisi : 4 titulaires, 2 remplaçants, puis les non retenus. */
  lineup: PlayerRef[];
  loading: boolean;
  name: string;
  players: { name: string }[];
  /** Indice du capitaine de l'équipe rapide. */
  captain: number;
}

@Component({
  selector: 'app-friendly',
  imports: [Icon, FormsModule, RouterLink, GameRow, Avatar, DatePipe],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow"><span class="live-dot"></span> Hors compétition</p>
        <h1 class="page-title">Match <em>amical</em></h1>
        <p class="lead">Deux équipes, un arbitre, un score. Défiez l’équipe d’un autre coach, ou lancez directement une rencontre et notez chaque point en direct.</p>
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
      @if (requests().length) {
        <section class="section" style="margin-top: 0">
          <h2 class="section-title" style="margin-bottom: 14px">Propositions de match</h2>
          <div class="stack">
            @for (r of requests(); track r.id) {
              <article class="card request" [class.pending]="r.status === 'pending'" [class.incoming]="r.direction === 'incoming'">
                <div class="request-teams">
                  <span class="row"><app-avatar [src]="r.team.logo_url" [name]="r.team.name" [size]="34" shape="square" /> <strong>{{ r.team.name }}</strong></span>
                  <span class="vs-sm">VS</span>
                  <span class="row"><app-avatar [src]="r.opponent.logo_url" [name]="r.opponent.name" [size]="34" shape="square" /> <strong>{{ r.opponent.name }}</strong></span>
                </div>
                <p class="small muted" style="margin: 8px 0 0">
                  {{ r.direction === 'incoming' ? 'Proposé par ' + r.proposer.name : 'Envoyé à ' + (r.opponent.coach?.name || 'l’équipe') }}
                  · {{ r.scheduled_at ? (r.scheduled_at | date: 'EEEE d MMMM, HH:mm') : 'date à convenir' }}
                  @if (r.round) { · {{ r.round }} }
                </p>
                @if (r.message) { <p class="small request-message">« {{ r.message }} »</p> }
                <div class="row request-actions">
                  <span class="badge" [class]="'badge request-' + r.status">{{ requestLabels[r.status] }}</span>
                  @if (r.can_answer) {
                    <button class="btn btn-sm" type="button" (click)="answer(r, 'accept')" [disabled]="busy()">Accepter</button>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="answer(r, 'decline')" [disabled]="busy()">Refuser</button>
                  }
                  @if (r.can_cancel) { <button class="btn btn-ghost btn-sm" type="button" (click)="answer(r, 'cancel')" [disabled]="busy()">Annuler la proposition</button> }
                  @if (r.game_id) { <a class="btn btn-ghost btn-sm" [routerLink]="['/gestion/matchs', r.game_id]">Voir le match <app-icon name="arrow-right" [size]="14" /></a> }
                </div>
              </article>
            }
          </div>
        </section>
      }

      @if (myTeams().length) {
        <form class="card form challenge" (ngSubmit)="propose()">
          <h2 class="section-title" style="margin: 0">Défier une équipe</h2>
          <p class="muted small" style="margin: 0">Proposez un match à une autre équipe : son coach reçoit une notification et le match est programmé dès qu’il accepte. Chaque coach compose ensuite sa feuille de match.</p>
          @if (challengeError()) { <p class="alert" role="alert">{{ challengeError() }}</p> }
          @if (challengeSent()) { <p class="alert alert-ok" role="status">Proposition envoyée. Vous serez prévenu de la réponse.</p> }
          <div class="form-grid">
            <label class="field"><span>Mon équipe</span>
              <select name="c-team" [(ngModel)]="challenge.teamId" required>
                <option [ngValue]="null" disabled>Sélectionner…</option>
                @for (t of myTeams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
              </select>
            </label>
            <label class="field"><span>Adversaire</span>
              <select name="c-opponent" [(ngModel)]="challenge.opponentId" required>
                <option [ngValue]="null" disabled>Sélectionner…</option>
                @for (t of teams(); track t.id) {
                  @if (t.id !== challenge.teamId) { <option [ngValue]="t.id">{{ t.name }}{{ t.coach ? ' · coach ' + t.coach.name : '' }}</option> }
                }
              </select>
            </label>
            <label class="field"><span>Date et heure proposées (facultatif)</span>
              <input type="datetime-local" name="c-date" [(ngModel)]="challenge.scheduledAt" />
            </label>
            <label class="field"><span>Intitulé (facultatif)</span>
              <input name="c-round" [(ngModel)]="challenge.round" maxlength="60" placeholder="Match amical" />
            </label>
          </div>
          <label class="field"><span>Message au coach (facultatif)</span>
            <textarea name="c-message" [(ngModel)]="challenge.message" maxlength="280" placeholder="Ex. Match de préparation avant la coupe régionale ?"></textarea>
          </label>
          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="busy() || !challenge.teamId || !challenge.opponentId">Envoyer la proposition <app-icon name="arrow-up-right" /></button>
          </div>
        </form>
      }

      @if (auth.canOrganize()) {
      @if (myTeams().length) { <h2 class="section-title" style="margin: 32px 0 14px">Créer directement un match</h2> }
      <form class="card form" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <p class="muted small" style="margin: 0">Avec vos propres équipes, ou des équipes rapides créées ici. Pour affronter l’équipe d’un autre manager, utilisez « Défier une équipe » : son coach devra accepter.</p>

        <div class="sides">
          @for (side of sides; track $index; let b = $odd) {
            <fieldset class="side" [class.side-b]="b">
              <legend><span class="team-index">{{ b ? 'B' : 'A' }}</span> Équipe {{ b ? 'B' : 'A' }}</legend>
              <div class="switch" role="radiogroup">
                <button type="button" [class.active]="side.mode === 'quick'" (click)="side.mode = 'quick'">Équipe rapide</button>
                <button type="button" [class.active]="side.mode === 'existing'" (click)="side.mode = 'existing'" [disabled]="!ownTeams().length" [title]="ownTeams().length ? '' : 'Vous n’avez pas encore d’équipe : créez une équipe rapide ou depuis « Mes équipes »'">Mon équipe</button>
              </div>

              @if (side.mode === 'existing') {
                <label class="field"><span>Choisir une équipe</span>
                  <select [name]="'team' + $index" [(ngModel)]="side.teamId" (ngModelChange)="selectTeam(side, $event)" required>
                    <option [ngValue]="null" disabled>Sélectionner…</option>
                    @for (t of ownTeams(); track t.id) {
                      <option [ngValue]="t.id">{{ t.name }}{{ t.city ? ' (' + t.city + ')' : '' }} · {{ t.players_count }} joueurs</option>
                    }
                  </select>
                </label>
                @if (side.teamId && preview()[side.teamId]; as st) {
                  <div class="preview">
                    <div class="row" style="justify-content: space-between">
                      <span class="small"><strong>{{ st.record.played }}</strong> match(s){{ st.record.friendlies ? ' · dont ' + st.record.friendlies + ' amical(aux)' : '' }}</span>
                      @if (st.form.length) { <span class="streak">@for (r of st.form; track $index) { <span [class]="'res res-' + r">{{ r }}</span> }</span> }
                    </div>
                    <p class="small" style="margin: 6px 0 0">{{ st.record.won }} V · {{ st.record.drawn }} N · {{ st.record.lost }} D · {{ st.record.win_rate }}% de victoires · {{ st.record.average_for }} pts/match</p>
                    @if (st.top_scorer; as top) { <p class="small muted" style="margin: 4px 0 0">Meilleur marqueur : <strong>{{ top.name }}</strong> ({{ top.points }} pts, {{ top.average }}/match)</p> }
                  </div>
                }
                @if (side.loading) {
                  <p class="muted small" style="margin: 0">Chargement des joueurs…</p>
                } @else if (side.teamId) {
                  <ol class="lineup">
                    @for (p of side.lineup; track p.id; let i = $index, first = $first, last = $last) {
                      @if (i === 0) { <li class="group-label">Titulaires</li> }
                      @if (i === starters) { <li class="group-label">Remplaçants</li> }
                      @if (i === starters + maxSubs) { <li class="group-label">Non retenus</li> }
                      <li class="lineup-player" [class.bench]="i >= starters" [class.out]="i >= starters + maxSubs">
                        <span class="num">{{ i < starters + maxSubs ? '0' + (i + 1) : '–' }}</span>
                        <span class="lineup-name">{{ p.name }}@if (p.is_captain) { <span class="captain" title="Capitaine">C</span> }</span>
                        <button class="btn btn-ghost btn-sm" type="button" (click)="move(side, i, -1)" [disabled]="first || p.is_captain || (i === 1 && side.lineup[0].is_captain)" aria-label="Monter"><app-icon name="arrow-up" [size]="14" /></button>
                        <button class="btn btn-ghost btn-sm" type="button" (click)="move(side, i, 1)" [disabled]="last || p.is_captain" aria-label="Descendre"><app-icon name="arrow-down" [size]="14" /></button>
                      </li>
                    }
                  </ol>
                  @if (side.lineup.length < starters) {
                    <p class="alert" style="margin: 0">Cette équipe n’a que {{ side.lineup.length }} joueur(s) : il en faut au moins {{ starters }} pour jouer.</p>
                  } @else {
                    <p class="muted small" style="margin: 0">Classez les joueurs avec les flèches : les 4 premiers sont titulaires, les 2 suivants remplaçants. Le capitaine reste en première position.</p>
                  }
                }
              } @else {
                <label class="field"><span>Nom de l’équipe</span>
                  <input [name]="'name' + $index" [(ngModel)]="side.name" maxlength="80" [placeholder]="b ? 'Ex. Jambaar de Dakar' : 'Ex. Gaïndé de Thiès'" required />
                </label>
                @for (p of side.players; track $index; let i = $index) {
                  <div class="player-line">
                    <span class="num">0{{ i + 1 }}</span>
                    <input class="input" [name]="'p' + $index + '-' + i" [(ngModel)]="p.name" maxlength="60" [placeholder]="'Joueur ' + (i + 1)" required />
                    <button class="captain-pick" type="button" [class.active]="side.captain === i" (click)="setQuickCaptain(side, i)" [attr.aria-pressed]="side.captain === i" [attr.aria-label]="'Capitaine : joueur ' + (i + 1)" title="Désigner capitaine">C</button>
                    <button class="btn btn-danger btn-sm" type="button" (click)="removeQuickPlayer(side, i)" [disabled]="side.players.length <= 4" aria-label="Retirer le joueur"><app-icon name="x" [size]="14" /></button>
                  </div>
                }
                <button class="btn btn-ghost btn-sm" type="button" style="justify-self: start" (click)="side.players.push({ name: '' })" [disabled]="side.players.length >= 6">+ Remplaçant</button>
                <p class="muted small" style="margin: 0">4 titulaires obligatoires, 2 remplaçants au maximum (entrée possible à la mi-temps). Touchez « C » pour désigner le capitaine : il passe en tête et joue toujours en première position. L’équipe sera enregistrée dans « Mes équipes » pour vos prochains matchs.</p>
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

        @if (startNow) {
          <div class="field"><span>Mode d’arbitrage (obligatoire pour démarrer)</span>
            <div class="switch mode-choice" role="radiogroup" aria-label="Mode d’arbitrage">
              <button type="button" role="radio" [class.active]="usesBuzzer === false" [attr.aria-checked]="usesBuzzer === false" (click)="usesBuzzer = false">Barème : boutons de points</button>
              <button type="button" role="radio" [class.active]="usesBuzzer === true" [attr.aria-checked]="usesBuzzer === true" (click)="usesBuzzer = true"><app-icon name="zap" [size]="13" /> Multibuzzer</button>
            </div>
          </div>
        }

        <div class="form-actions" style="align-items: center">
          <label class="row small" style="margin-right: auto"><input type="checkbox" name="start" [(ngModel)]="startNow" /> Démarrer le match immédiatement</label>
          <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Création…' : startNow ? 'Lancer le match' : 'Programmer le match' }} @if (!saving() && startNow) { <app-icon name="arrow-up-right" /> }</button>
        </div>
      </form>
      }

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
    .mode-choice { justify-self: start; }
    .mode-choice button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; padding: 9px 14px; }
    .switch button:disabled { cursor: not-allowed; opacity: .5; }
    .player-line { display: grid; grid-template-columns: 26px 1fr auto auto; align-items: center; gap: 6px; }
    .num { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .preview { padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(240, 205, 135, .18); }
    .streak { display: inline-flex; gap: 3px; }
    .res { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; font-family: var(--mono); font-size: 9px; font-weight: 700; }
    .res-V { background: var(--ochre); color: var(--ink); }
    .res-N { background: var(--sand); color: var(--ink); }
    .res-D { background: var(--rust); color: white; }
    .lineup { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .group-label { margin-top: 6px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .lineup-player { display: grid; grid-template-columns: 26px 1fr auto auto; align-items: center; gap: 6px; padding: 4px 4px 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
    .lineup-player.bench { background: var(--paper); }
    .lineup-player.out { opacity: .55; }
    .lineup-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .vs { align-self: center; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .challenge { margin: 20px 0 8px; }
    .request.pending.incoming { border-color: var(--ochre); box-shadow: inset 4px 0 0 var(--ochre); }
    .request-teams { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .vs-sm { color: var(--muted); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .request-message { margin: 8px 0 0; color: var(--ink); font-style: italic; }
    .request-actions { margin-top: 12px; }
    .request-pending { background: rgba(240, 205, 135, .6); }
    .request-accepted { background: var(--ochre); }
    .request-declined, .request-cancelled { background: rgba(190, 189, 177, .35); }
    @media (max-width: 820px) { .sides { grid-template-columns: 1fr; } .vs { justify-self: center; } }
  `,
})
export class FriendlyPage {
  private readonly dialog = inject(DialogService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly teams = signal<Team[]>([]);
  protected readonly mine = signal<Game[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly requests = signal<FriendlyRequest[]>([]);
  protected readonly requestLabels = FRIENDLY_REQUEST_STATUS_LABELS;
  protected readonly busy = signal(false);
  protected readonly challengeError = signal('');
  protected readonly challengeSent = signal(false);
  protected challenge: { teamId: number | null; opponentId: number | null; scheduledAt: string; round: string; message: string } = { teamId: null, opponentId: null, scheduledAt: '', round: '', message: '' };
  /** Équipes que je gère (manager ou coach) : celles avec lesquelles je peux défier les autres. */
  protected readonly myTeams = computed(() => {
    const me = this.auth.user()?.id;
    return this.teams().filter((t) => t.owner?.id === me || t.coach?.id === me);
  });
  /** Match créé directement : seulement les équipes du manager (l'administrateur voit toutes les équipes). */
  protected readonly ownTeams = computed(() => {
    const me = this.auth.user()?.id;
    return this.auth.isAdmin() ? this.teams() : this.teams().filter((t) => t.owner?.id === me);
  });
  protected readonly starters = STARTERS;
  protected readonly maxSubs = MAX_SUBSTITUTES;
  protected sides: SideForm[] = [this.emptySide(), this.emptySide()];
  protected round = '';
  protected scheduledAt = '';
  protected startNow = true;
  /** Avec ou sans buzzer : à choisir explicitement avant de démarrer (aucun choix par défaut). */
  protected usesBuzzer: boolean | null = null;

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.api.teams().subscribe((teams) => this.teams.set(teams));
      this.api.games({ friendly: true, mine: true }).subscribe((games) => this.mine.set(games));
      this.loadRequests();
    }
  }

  private loadRequests(): void {
    this.api.friendlyRequests().subscribe((requests) => this.requests.set(requests));
  }

  protected propose(): void {
    const c = this.challenge;
    if (!c.teamId || !c.opponentId) return;
    this.busy.set(true);
    this.challengeError.set('');
    this.challengeSent.set(false);
    this.api
      .proposeFriendly({ team_id: c.teamId, opponent_id: c.opponentId, round: c.round.trim() || null, scheduled_at: fromLocalInput(c.scheduledAt), message: c.message.trim() || null })
      .subscribe({
        next: () => {
          this.challenge = { teamId: c.teamId, opponentId: null, scheduledAt: '', round: '', message: '' };
          this.challengeSent.set(true);
          this.busy.set(false);
          this.loadRequests();
        },
        error: (e) => {
          this.challengeError.set(errorMessage(e));
          this.busy.set(false);
        },
      });
  }

  protected async answer(request: FriendlyRequest, answer: 'accept' | 'decline' | 'cancel'): Promise<void> {
    if (answer === 'cancel' && !(await this.dialog.confirm('Annuler cette proposition de match ?', { confirmLabel: 'Annuler la proposition', cancelLabel: 'Garder' }))) return;
    this.busy.set(true);
    this.api.answerFriendly(request.id, answer).subscribe({
      next: (updated) => {
        this.requests.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        this.busy.set(false);
        if (updated.game_id) this.api.games({ friendly: true, mine: true }).subscribe((games) => this.mine.set(games));
      },
      error: (e) => {
        void this.dialog.alert(errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  protected submit(): void {
    const [a, b] = this.sides.map((side) => this.toPayload(side));
    if (!a || !b) {
      this.error.set('Complétez les deux équipes : au moins 4 joueurs chacune, capitaine compris.');
      return;
    }
    if (this.startNow && this.usesBuzzer === null) {
      this.error.set('Choisissez de jouer avec ou sans buzzer avant de démarrer le match.');
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
        ...(this.startNow ? { uses_buzzer: this.usesBuzzer! } : {}),
      })
      .subscribe({
        next: (game) => this.router.navigate(['/gestion/matchs', game.id]),
        error: (e) => {
          this.error.set(errorMessage(e));
          this.saving.set(false);
        },
      });
  }

  /** Bilan importé de l'équipe choisie, affiché sous la sélection. */
  protected readonly preview = signal<Record<number, TeamStats>>({});

  /** Charge l'effectif de l'équipe choisie (ordre de la fiche équipe) et son bilan. */
  protected selectTeam(side: SideForm, teamId: number | null): void {
    side.lineup = [];
    if (!teamId) return;
    side.loading = true;
    this.api.team(teamId).subscribe({
      next: (team) => {
        if (side.teamId !== teamId) return;
        // Le capitaine en tête : il est toujours titulaire, en première position.
        const players = team.players ?? [];
        side.lineup = [...players.filter((p) => p.is_captain), ...players.filter((p) => !p.is_captain)];
        side.loading = false;
      },
      error: () => (side.loading = false),
    });
    if (!this.preview()[teamId]) {
      this.api.teamStats(teamId).subscribe((stats) => this.preview.update((p) => ({ ...p, [teamId]: stats })));
    }
  }

  protected setQuickCaptain(side: SideForm, index: number): void {
    side.players.unshift(...side.players.splice(index, 1));
    side.captain = 0;
  }

  protected removeQuickPlayer(side: SideForm, index: number): void {
    side.players.splice(index, 1);
    if (side.captain > index || side.captain >= side.players.length) side.captain = Math.max(0, side.captain - 1);
  }

  protected move(side: SideForm, index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= side.lineup.length) return;
    [side.lineup[index], side.lineup[target]] = [side.lineup[target], side.lineup[index]];
  }

  private toPayload(side: SideForm): FriendlySide | null {
    if (side.mode === 'existing') {
      if (!side.teamId || side.lineup.length < STARTERS) return null;
      const ids = side.lineup.map((p) => p.id!);
      return { id: side.teamId, starters: ids.slice(0, STARTERS), substitutes: ids.slice(STARTERS, STARTERS + MAX_SUBSTITUTES) };
    }
    const players = side.players.map((p) => p.name.trim()).filter(Boolean);
    if (!side.name.trim() || !players.length || !side.players[side.captain]?.name.trim()) return null;
    // Indice du capitaine parmi les joueurs réellement envoyés (lignes vides ignorées).
    const captain = side.players.slice(0, side.captain).filter((p) => p.name.trim()).length;
    return { name: side.name.trim(), players, captain };
  }

  private emptySide(): SideForm {
    return { mode: 'quick', teamId: null, lineup: [], loading: false, name: '', captain: 0, players: Array.from({ length: 4 }, () => ({ name: '' })) };
  }
}
