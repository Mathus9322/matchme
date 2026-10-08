import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { Observable } from 'rxjs';
import QRCode from 'qrcode';
import { ApiService, errorMessage } from '../core/api.service';
import { BuzzerRefereeState, BuzzerState, Game } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { DialogService } from './dialog';
import { Icon } from './icon';

/**
 * Multibuzzer, côté arbitre (manager du match) : code et QR code pour les téléphones des joueurs,
 * ouverture des buzzers, jugement de la réponse du joueur qui a la main.
 * Le public et les coachs ne voient pas ce panneau.
 */
@Component({
  selector: 'app-buzzer-panel',
  imports: [Icon],
  template: `
    @if (state(); as s) {
      <section class="card buzzer" [class.open]="s.status === 'open'" [class.locked]="s.status === 'locked'">
        <header class="head">
          <div>
            <p class="eyebrow" style="margin: 0">Multibuzzer <span class="rt" [class.on]="realtime.connected()">{{ realtime.connected() ? 'instantané' : 'rafraîchi chaque seconde' }}</span></p>
            <h2 class="section-title" style="margin: 2px 0 0">{{ title() }}</h2>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" (click)="showJoin.set(!showJoin())" [attr.aria-expanded]="showJoin()">
            <app-icon name="users" [size]="14" /> {{ connectedCount() }}/{{ s.players.length }} connectés
          </button>
        </header>

        @if (showJoin()) {
          <div class="join">
            @if (qr()) { <img class="qr" [src]="qr()" alt="QR code pour rejoindre le buzzer" width="148" height="148" /> }
            <div class="join-text">
              <span class="muted small">Les joueurs ouvrent</span>
              <strong class="url">{{ joinUrl() }}</strong>
              <span class="muted small">ou {{ origin }}/buzzer avec le code</span>
              <strong class="code">{{ s.code.slice(0, 3) }} {{ s.code.slice(3) }}</strong>
              <button class="btn btn-ghost btn-sm" type="button" (click)="regenerate()" [disabled]="busy()">Nouveau code</button>
            </div>
            <ul class="phones">
              @for (p of s.players; track p.id) {
                <li [class.bench]="!p.on_field">
                  <span class="dot" [class.on]="p.online" [class.idle]="p.connected && !p.online"></span>
                  <span class="pname">{{ p.name }}</span>
                  <span class="muted small">{{ teamName(p.team_id) }}{{ p.on_field ? '' : ' · banc' }}</span>
                  @if (p.connected) { <button class="link" type="button" (click)="release(p.id, p.name)">Libérer</button> }
                </li>
              }
            </ul>
          </div>
        }

        <div class="control">
          @switch (s.status) {
            @case ('closed') {
              <button class="btn big" type="button" (click)="run(api.buzzerAction(game().id, 'open'))" [disabled]="busy() || !s.in_play" [title]="s.in_play ? '' : 'Les buzzers s’ouvrent pendant le jeu'">
                <app-icon name="zap" [size]="18" /> Ouvrir les buzzers
              </button>
              @if (s.last; as l) { <span class="muted small">Dernière main : {{ l.name }} · {{ resultLabels[l.result] }}</span> }
            }
            @case ('open') {
              <span class="waiting"><span class="pulse-dot"></span> {{ s.excluded_team_id ? 'Ouvert pour ' + otherTeamName(s.excluded_team_id) + ' uniquement' : 'Buzzers ouverts : en attente d’un buzz…' }}</span>
              <button class="btn btn-ghost btn-sm" type="button" (click)="run(api.buzzerAction(game().id, 'close'))" [disabled]="busy()" title="Personne ne répond : on passe à la question suivante">Passer la question</button>
            }
            @case ('locked') {
              @if (s.winner; as w) {
                <div class="winner">
                  <span class="muted small">A la main</span>
                  <strong>{{ w.name }}</strong>
                  <span class="muted small">{{ w.team }}</span>
                </div>
                <div class="verdict">
                  <span class="scale muted small">Barème · {{ rubricName() || 'par défaut' }}</span>
                  @for (v of positives(); track v) {
                    <button class="btn btn-sm ok" type="button" (click)="correct(w.team_id, w.player_id, v)" [disabled]="busy()">Bonne réponse +{{ v }}</button>
                  }
                  @for (v of penalties(); track v) {
                    <button class="btn btn-sm wrong" type="button" (click)="wrong(w.team_id, w.player_id, v)" [disabled]="busy()">Mauvaise réponse {{ v }}</button>
                  } @empty {
                    <button class="btn btn-sm wrong" type="button" (click)="wrong(w.team_id, w.player_id, 0)" [disabled]="busy()">Mauvaise réponse</button>
                  }
                  <button class="btn btn-ghost btn-sm" type="button" (click)="run(api.judgeBuzz(game().id, 'passed'))" [disabled]="busy()" title="Le joueur ne répond pas : aucun point, la main passe à l’équipe adverse">Passer</button>
                </div>
              }
            }
          }
        </div>
        @if (error()) { <p class="alert" role="alert" style="margin: 10px 0 0">{{ error() }}</p> }
      </section>
    }
  `,
  styles: `
    .buzzer { display: grid; gap: 14px; margin-top: 16px; border-width: 2px; }
    .buzzer.open { border-color: var(--rust); }
    .buzzer.locked { border-color: var(--gold); box-shadow: 0 0 0 4px rgba(240, 205, 135, .35); }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
    .rt { margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: rgba(190, 189, 177, .35); font-size: 9px; }
    .rt.on { background: rgba(111, 207, 122, .3); }
    .join { display: grid; grid-template-columns: auto 1fr; gap: 14px 18px; padding: 14px; border-radius: 12px; background: var(--paper); }
    .qr { border-radius: 10px; background: white; }
    .join-text { display: grid; align-content: center; gap: 4px; }
    .url { font-family: var(--mono); font-size: 13px; overflow-wrap: anywhere; }
    .code { font-family: var(--mono); font-size: 38px; letter-spacing: .12em; line-height: 1.1; }
    .join-text .btn { justify-self: start; margin-top: 6px; }
    .phones { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
    .phones li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 13px; }
    .phones li.bench { opacity: .75; }
    .pname { font-weight: 600; }
    .dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--sand); }
    .dot.on { background: #3d9a4a; }
    .dot.idle { background: var(--ochre); }
    .link { margin-left: auto; border: 0; background: transparent; color: var(--rust); font: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; }
    .control { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; min-height: 54px; }
    .big { padding: 12px 20px; font-size: 16px; }
    .waiting { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; }
    .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--rust); animation: beat 1s ease-in-out infinite; }
    .winner { display: grid; padding: 10px 16px; border-radius: 12px; background: var(--ink); color: var(--paper); animation: pop .35s cubic-bezier(.2, .9, .3, 1.4); }
    .winner strong { font-family: var(--display); font-size: 26px; }
    .winner .muted { color: var(--gold-light); }
    .verdict { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .scale { flex-basis: 100%; }
    .ok { background: #3d7a3f; border-color: transparent; color: white; }
    .wrong { background: var(--rust); border-color: transparent; color: white; }
    @keyframes beat { 50% { transform: scale(1.5); opacity: .5; } }
    @keyframes pop { from { transform: scale(.8); opacity: 0; } }
    @media (max-width: 600px) { .join { grid-template-columns: 1fr; justify-items: center; text-align: center; } .join-text .btn { justify-self: center; } }
  `,
})
export class BuzzerPanel {
  protected readonly api = inject(ApiService);
  protected readonly realtime = inject(RealtimeService);
  private readonly dialog = inject(DialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly game = input.required<Game>();
  /** Barème de la rubrique en cours (valeurs positives = bonnes réponses, négatives = pénalités). */
  readonly values = input<number[]>([]);
  readonly rubricId = input<number | null>(null);
  readonly rubricName = input<string | null>(null);
  /** Match mis à jour après l'attribution des points. */
  readonly changed = output<Game>();

  protected readonly state = signal<BuzzerRefereeState | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showJoin = signal(true);
  protected readonly qr = signal('');
  protected readonly origin = location.origin;
  private unlisten: () => void = () => undefined;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private listening = '';

  protected readonly positives = computed(() => this.values().filter((v) => v > 0));
  /** Pénalités du barème de la rubrique, de la plus légère à la plus lourde. */
  protected readonly penalties = computed(() => this.values().filter((v) => v < 0).sort((a, b) => b - a));
  protected readonly resultLabels = { correct: 'bonne réponse', wrong: 'mauvaise réponse', passed: 'a passé' };
  protected readonly connectedCount = computed(() => this.state()?.players.filter((p) => p.connected).length ?? 0);
  protected readonly joinUrl = computed(() => `${this.origin}/buzzer/${this.state()?.code ?? ''}`);
  protected readonly title = computed(() => {
    const s = this.state();
    if (!s) return '';
    if (!s.in_play) return s.phase === 'halftime' ? 'Mi-temps : buzzers en pause' : 'Les joueurs peuvent se connecter';
    return { closed: 'Buzzers fermés', open: 'Buzzers ouverts', locked: 'Un joueur a la main' }[s.status];
  });

  constructor() {
    effect(() => {
      const id = this.game().id;
      if (this.state()?.game_id !== id) this.load();
    });
    // Le match change de phase (coup d'envoi, mi-temps…) : l'état du buzzer suit.
    effect(() => {
      const g = this.game();
      const s = this.state();
      if (s && (s.game_status !== g.status || s.phase !== (g.phase ?? null))) this.load();
    });
    effect(() => {
      const code = this.state()?.code;
      if (code) QRCode.toDataURL(`${this.origin}/buzzer/${code}`, { margin: 1, width: 296 }).then((url) => this.qr.set(url)).catch(() => this.qr.set(''));
    });
    this.destroyRef.onDestroy(() => {
      this.unlisten();
      clearTimeout(this.pollTimer);
    });
  }

  protected teamName(teamId: number): string {
    const g = this.game();
    return teamId === g.team_a.id ? g.team_a.name : g.team_b.name;
  }

  protected otherTeamName(excludedTeamId: number): string {
    const g = this.game();
    return excludedTeamId === g.team_a.id ? g.team_b.name : g.team_a.name;
  }

  /** Bonne réponse : les points vont au joueur qui a buzzé, puis la manche se ferme. */
  protected correct(teamId: number, playerId: number, points: number): void {
    this.busy.set(true);
    this.api.score(this.game().id, teamId, playerId, points, this.rubricId()).subscribe({
      next: (game) => {
        this.changed.emit(game);
        this.run(this.api.judgeBuzz(this.game().id, 'correct'));
      },
      error: (e) => this.fail(e),
    });
  }

  /** Mauvaise réponse (avec la pénalité choisie dans le barème, s'il y en a) : la main passe à l'équipe adverse. */
  protected wrong(teamId: number, playerId: number, penalty: number): void {
    this.busy.set(true);
    if (!penalty) {
      this.run(this.api.judgeBuzz(this.game().id, 'wrong'));
      return;
    }
    this.api.score(this.game().id, teamId, playerId, penalty, this.rubricId()).subscribe({
      next: (game) => {
        this.changed.emit(game);
        this.run(this.api.judgeBuzz(this.game().id, 'wrong'));
      },
      error: (e) => this.fail(e),
    });
  }

  protected async regenerate(): Promise<void> {
    if (!(await this.dialog.confirm('Tous les téléphones seront déconnectés et devront rejoindre le match avec le nouveau code.', { title: 'Nouveau code ?', confirmLabel: 'Changer le code' }))) return;
    this.run(this.api.buzzerAction(this.game().id, 'code'));
  }

  protected async release(playerId: number, name: string): Promise<void> {
    if (!(await this.dialog.confirm(`Le téléphone de ${name} sera déconnecté ; son nom pourra être choisi sur un autre appareil.`, { title: 'Libérer ce nom ?', confirmLabel: 'Libérer' }))) return;
    this.run(this.api.releaseBuzzer(this.game().id, playerId));
  }

  protected run(request: Observable<BuzzerRefereeState>): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (state) => {
        this.apply(state);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  private load(): void {
    this.api.buzzer(this.game().id).subscribe({
      next: (state) => {
        this.apply(state);
        this.schedulePoll();
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  /** Secours sans Reverb : interrogation chaque seconde ; avec Reverb, rafraîchissement lent (téléphones connectés). */
  private schedulePoll(): void {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.load(), this.realtime.connected() ? 5000 : 1000);
  }

  private apply(update: BuzzerState | BuzzerRefereeState): void {
    const current = this.state();
    if (current && update.round < current.round) return;
    const next = { ...(current ?? {}), ...update } as BuzzerRefereeState;
    this.state.set(next);
    const rt = next.realtime;
    if (rt && this.listening !== rt.channel) {
      this.unlisten();
      this.listening = rt.channel;
      this.unlisten = this.realtime.listen<BuzzerState>(rt.key, rt.channel, rt.event, (payload) => this.apply(payload));
    }
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.error.set(errorMessage(e));
  }
}
