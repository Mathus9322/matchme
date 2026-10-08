import { Component, DestroyRef, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { BuzzerJoin, BuzzerPlayerState, BuzzerState } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { DialogService } from '../shared/dialog';
import { Icon } from '../shared/icon';
import { Logo } from '../shared/logo';

const TOKEN_KEY = 'matchme.buzzer';

/**
 * Buzzer d'un joueur, sur son téléphone : il rejoint le match avec le code affiché par l'arbitre,
 * choisit son nom, puis buzze. Aucun compte n'est nécessaire ; le public ne voit pas cette page.
 */
@Component({
  selector: 'app-buzzer',
  imports: [FormsModule, Icon, Logo],
  template: `
    <main class="screen" [class]="'screen tone-' + tone()">
      <header class="top">
        <span class="bz-brand"><app-logo class="bz-mark" [size]="26" /><span>match<b>me</b><i>.</i><small>buzzer</small></span></span>
        @if (state(); as s) {
          <span class="live" [class.on]="realtime.connected()" [title]="realtime.connected() ? 'Connexion instantanée' : 'Connexion de secours (rafraîchissement régulier)'"></span>
        }
      </header>

      @switch (step()) {
        @case ('code') {
          <form class="panel" (ngSubmit)="join()">
            <h1>Rejoindre le match</h1>
            <p class="hint">Saisissez le code à 6 chiffres affiché par l’arbitre.</p>
            <input class="code-input" name="code" [(ngModel)]="codeValue" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" aria-label="Code du match" required />
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <button class="wide" type="submit" [disabled]="busy() || digits(codeValue).length !== 6">Continuer</button>
          </form>
        }

        @case ('pick') {
          @if (joinData(); as j) {
            <section class="panel">
              <p class="hint">{{ j.game.title }}{{ j.game.round ? ' · ' + j.game.round : '' }}</p>
              <h1>Qui êtes-vous ?</h1>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              @for (t of j.teams; track t.id) {
                <h2>{{ t.name }}</h2>
                <div class="names">
                  @for (p of t.players; track p.id) {
                    <button type="button" (click)="claim(p.id)" [disabled]="busy() || p.taken">
                      {{ p.name }}
                      @if (p.taken) { <small>déjà connecté</small> } @else if (!p.on_field) { <small>remplaçant</small> }
                    </button>
                  }
                </div>
              }
              <button class="link" type="button" (click)="reset()">Changer de code</button>
            </section>
          }
        }

        @case ('buzz') {
          @if (state(); as s) {
            <section class="play">
              <div class="who">
                <strong>{{ s.me.name }}</strong>
                <span>{{ s.me.team }}</span>
              </div>

              <button class="buzz" type="button" (pointerdown)="press()" (keydown.enter)="press()" (keydown.space)="$event.preventDefault(); press()" [disabled]="!canBuzz()" [attr.aria-label]="label()">
                <span>{{ label() }}</span>
              </button>

              <p class="status" aria-live="assertive">{{ message() }}</p>
              @if (s.last; as l) {
                @if (s.status !== 'locked') {
                  <p class="last" [class.ok]="l.result === 'correct'">
                    <app-icon [name]="l.result === 'correct' ? 'check' : 'x'" [size]="16" />
                    {{ l.player_id === s.me.player_id ? 'Vous' : l.name }} · {{ l.result === 'correct' ? 'bonne réponse' : l.result === 'passed' ? 'a passé' : 'mauvaise réponse' }}
                  </p>
                }
              }
              <p class="match">{{ s.game.title }}</p>
              <button class="link" type="button" (click)="leave()">Quitter le buzzer</button>
            </section>
          }
        }
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .screen { --bg: var(--ink); min-height: 100dvh; display: flex; flex-direction: column; padding: 16px; background: var(--bg); color: var(--paper); transition: background .25s ease; }
    .tone-open { --bg: #3a1d0c; }
    .tone-mine { --bg: #6b4a12; }
    .tone-other { --bg: #241c15; }
    .top { display: flex; justify-content: space-between; align-items: center; }
    .bz-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--paper); font-size: 20px; font-weight: 500; }
    .bz-mark { border-radius: 7px; box-shadow: 0 0 0 1.5px rgba(240, 205, 135, .55); }
    .bz-brand b { font-weight: 800; }
    .bz-brand i { color: var(--gold); font-style: normal; }
    .bz-brand small { margin-left: 6px; color: var(--gold-light); font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
    .live { width: 10px; height: 10px; border-radius: 50%; background: var(--sand); }
    .live.on { background: #6fcf7a; box-shadow: 0 0 0 4px rgba(111, 207, 122, .2); }
    .panel { display: grid; gap: 14px; width: min(440px, 100%); margin: auto; padding: 24px 0; }
    h1 { margin: 0; font-family: var(--display); font-size: 34px; font-weight: 600; }
    h2 { margin: 10px 0 0; color: var(--gold-light); font-size: 14px; text-transform: uppercase; letter-spacing: .06em; }
    .hint { margin: 0; color: rgba(246, 244, 238, .7); }
    .code-input { padding: 16px; border: 2px solid rgba(240, 205, 135, .4); border-radius: 14px; background: rgba(255, 255, 255, .06); color: var(--paper); font-family: var(--mono); font-size: 34px; letter-spacing: .3em; text-align: center; }
    .code-input:focus { outline: none; border-color: var(--gold); }
    .wide, .names button { padding: 16px; border: 0; border-radius: 14px; background: var(--gold); color: var(--ink); font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; }
    .wide:disabled, .names button:disabled { opacity: .45; cursor: not-allowed; }
    .names { display: grid; gap: 8px; }
    .names button { display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, .08); color: var(--paper); text-align: left; }
    .names button:not(:disabled):hover { background: rgba(240, 205, 135, .2); }
    .names small { color: var(--gold-light); font-size: 12px; font-weight: 500; }
    .error { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(172, 99, 39, .35); }
    .link { justify-self: center; border: 0; background: transparent; color: rgba(246, 244, 238, .65); font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; }
    .play { display: grid; flex: 1; justify-items: center; align-content: space-evenly; gap: 18px; text-align: center; }
    .who { display: grid; gap: 2px; }
    .who strong { font-family: var(--display); font-size: 30px; }
    .who span { color: var(--gold-light); }
    .buzz { width: min(72vw, 340px); aspect-ratio: 1; border: 0; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #f0a473, var(--rust) 55%, #6e3412); color: white; font-family: var(--display); font-size: clamp(30px, 9vw, 52px); font-weight: 700; box-shadow: 0 14px 0 #4d250c, 0 30px 60px -20px rgba(0, 0, 0, .7); cursor: pointer; touch-action: manipulation; user-select: none; -webkit-tap-highlight-color: transparent; transition: transform .06s ease, box-shadow .06s ease, filter .2s ease; }
    .buzz:not(:disabled) { animation: ready 1.2s ease-in-out infinite; }
    .buzz:active:not(:disabled) { transform: translateY(10px); box-shadow: 0 4px 0 #4d250c, 0 16px 30px -16px rgba(0, 0, 0, .7); }
    .buzz:disabled { filter: grayscale(.85) brightness(.6); cursor: default; }
    .tone-mine .buzz { filter: none; background: radial-gradient(circle at 35% 30%, #fff1c9, var(--gold) 55%, #8a6114); color: var(--ink); animation: win .6s ease-in-out infinite alternate; }
    .buzz span { display: block; padding: 0 18px; line-height: 1.05; }
    .status { min-height: 1.4em; margin: 0; font-size: 20px; font-weight: 700; }
    .last { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 6px 12px; border-radius: 999px; background: rgba(172, 99, 39, .35); font-size: 14px; }
    .last.ok { background: rgba(111, 207, 122, .25); }
    .match { margin: 0; color: rgba(246, 244, 238, .55); font-size: 13px; }
    @keyframes ready { 50% { box-shadow: 0 14px 0 #4d250c, 0 0 0 18px rgba(240, 164, 115, .18), 0 30px 60px -20px rgba(0, 0, 0, .7); } }
    @keyframes win { to { transform: scale(1.04); } }
    @media (prefers-reduced-motion: reduce) { .buzz { animation: none !important; } }
  `,
})
export class BuzzerPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);
  protected readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  /** Code passé dans l'adresse (/buzzer/123456), par exemple depuis le QR code de l'arbitre. */
  readonly code = input<string>();

  protected readonly step = signal<'code' | 'pick' | 'buzz'>('code');
  protected readonly joinData = signal<BuzzerJoin | null>(null);
  protected readonly state = signal<BuzzerPlayerState | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected codeValue = '';
  private token: string | null = this.readToken();
  private unlisten: () => void = () => undefined;
  private pollTimer?: ReturnType<typeof setTimeout>;

  protected readonly mine = computed(() => {
    const s = this.state();
    return !!s && s.status === 'locked' && s.winner?.player_id === s.me.player_id;
  });

  protected readonly canBuzz = computed(() => {
    const s = this.state();
    return !!s && !this.busy() && s.in_play && s.status === 'open' && s.excluded_team_id !== s.me.team_id;
  });

  protected readonly tone = computed(() => {
    const s = this.state();
    if (this.step() !== 'buzz' || !s) return 'idle';
    if (this.mine()) return 'mine';
    if (s.status === 'locked') return 'other';
    return this.canBuzz() ? 'open' : 'idle';
  });

  protected readonly label = computed(() => {
    const s = this.state();
    if (!s) return '';
    if (this.mine()) return 'À vous !';
    if (this.canBuzz()) return 'BUZZ';
    return s.status === 'locked' ? 'Main prise' : 'Attente';
  });

  protected readonly message = computed(() => {
    const s = this.state();
    if (!s) return '';
    if (s.game_status === 'scheduled') return 'Le match n’a pas encore commencé.';
    if (s.game_status === 'finished') return 'Le match est terminé. Merci !';
    if (s.phase === 'halftime') return 'Mi-temps : les buzzers reprendront après la pause.';
    if (this.mine()) return 'Vous avez la main : répondez à l’arbitre.';
    if (s.status === 'locked' && s.winner) return `${s.winner.name} (${s.winner.team}) a la main.`;
    if (s.status === 'open' && s.excluded_team_id === s.me.team_id) return 'La main est à l’équipe adverse.';
    if (s.status === 'open') return s.excluded_team_id ? 'À vous de jouer : l’équipe adverse s’est trompée !' : 'Buzzers ouverts !';
    return 'Attendez que l’arbitre ouvre les buzzers.';
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.unlisten();
      clearTimeout(this.pollTimer);
    });
    // Vibration quand le joueur obtient la main.
    effect(() => {
      if (this.mine()) navigator.vibrate?.([120, 60, 120]);
    });
  }

  ngOnInit(): void {
    const code = this.digits(this.code() ?? '');
    if (this.token) {
      this.refresh(true);
    } else if (code.length === 6) {
      this.codeValue = code;
      this.join();
    }
  }

  protected digits(value: string): string {
    return (value ?? '').replace(/\D/g, '');
  }

  protected join(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.joinBuzzer(this.digits(this.codeValue)).subscribe({
      next: (data) => {
        this.joinData.set(data);
        this.step.set('pick');
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  protected claim(playerId: number): void {
    this.busy.set(true);
    this.error.set('');
    this.api.claimBuzzer(this.digits(this.codeValue), playerId).subscribe({
      next: ({ token, data }) => {
        this.storeToken(token);
        this.apply(data);
        this.step.set('buzz');
        this.busy.set(false);
        this.listen(data);
        this.schedulePoll();
      },
      error: (e) => {
        this.fail(e);
        if (e instanceof HttpErrorResponse && e.status === 409) this.join();
      },
    });
  }

  protected press(): void {
    if (!this.canBuzz() || !this.token) return;
    this.busy.set(true);
    this.api.buzz(this.token).subscribe({
      next: ({ data }) => {
        this.apply(data);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  protected async leave(): Promise<void> {
    if (!(await this.dialog.confirm('Votre nom sera libéré pour un autre téléphone.', { title: 'Quitter le buzzer ?', confirmLabel: 'Quitter' }))) return;
    if (this.token) this.api.leaveBuzzer(this.token).subscribe({ error: () => undefined });
    this.reset();
  }

  protected reset(): void {
    this.unlisten();
    clearTimeout(this.pollTimer);
    this.storeToken(null);
    this.state.set(null);
    this.joinData.set(null);
    this.error.set('');
    this.step.set('code');
  }

  /** Rafraîchissement : instantané par Reverb, avec une interrogation de secours (plus rapide sans Reverb). */
  private refresh(first = false): void {
    if (!this.token) return;
    this.api.buzzerState(this.token).subscribe({
      next: (data) => {
        this.apply(data);
        if (first) {
          this.step.set('buzz');
          this.listen(data);
        }
        this.schedulePoll();
      },
      error: (e) => {
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.reset();
          this.error.set(errorMessage(e));
        } else {
          this.schedulePoll();
        }
      },
    });
  }

  private schedulePoll(): void {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.refresh(), this.realtime.connected() ? 10000 : 1500);
  }

  private listen(data: BuzzerPlayerState): void {
    this.unlisten();
    const rt = data.realtime;
    if (rt) this.unlisten = this.realtime.listen<BuzzerState>(rt.key, rt.channel, rt.event, (payload) => this.apply(payload));
  }

  /** Les messages temps réel ne contiennent que l'état partagé : on garde « me » et le match. */
  private apply(update: BuzzerState | BuzzerPlayerState): void {
    const current = this.state();
    if (current && update.round < current.round) return;
    this.state.set({ ...(current ?? {}), ...update } as BuzzerPlayerState);
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.error.set(errorMessage(e));
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private storeToken(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Stockage indisponible : le jeton reste valable tant que la page est ouverte.
    }
  }
}
