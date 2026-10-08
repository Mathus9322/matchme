import { Component, effect, input, OnDestroy, signal } from '@angular/core';
import { Game, ScoreEvent, Substitution } from '../core/models';
import { Icon, IconName } from './icon';

interface Announcement {
  id: number;
  icon: IconName;
  title: string;
  detail: string;
}

interface Toast extends Announcement {
  tone: 'point' | 'penalty' | 'sub';
}

const MUTE_KEY = 'matchme.popups.muted';

/**
 * Pop-ups du match en direct, déduites des changements d'état entre deux actualisations :
 * coup d'envoi, mi-temps, 2e mi-temps (avec les remplacements effectués), fin, points et pénalités.
 */
@Component({
  selector: 'app-match-popups',
  imports: [Icon],
  template: `
    <button class="mute" type="button" (click)="toggleMute()" [attr.aria-pressed]="muted()" [title]="muted() ? 'Réactiver les pop-ups du match' : 'Couper les pop-ups du match'">
      <app-icon [name]="muted() ? 'bell-off' : 'bell'" [size]="15" /> {{ muted() ? 'Pop-ups coupées' : 'Pop-ups activées' }}
    </button>

    <div class="sr-only" aria-live="assertive">{{ spoken() }}</div>

    @if (banner(); as b) {
      <div class="overlay" (click)="nextBanner()" role="presentation">
        <div class="banner" role="status">
          <span class="banner-icon"><app-icon [name]="b.icon" [size]="40" [stroke]="1.8" /></span>
          <strong>{{ b.title }}</strong>
          @if (b.detail) { <span class="banner-detail">{{ b.detail }}</span> }
        </div>
      </div>
    }

    <div class="toasts">
      @for (t of toasts(); track t.id) {
        <div class="toast" [class]="'toast toast-' + t.tone" role="status" (click)="dismiss(t.id)">
          <span class="toast-icon"><app-icon [name]="t.icon" [size]="18" /></span>
          <span class="toast-text"><strong>{{ t.title }}</strong>@if (t.detail) { <span>{{ t.detail }}</span> }</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .mute { position: fixed; left: 16px; bottom: 16px; z-index: 40; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 20px -12px rgba(43, 34, 25, .5); }
    .mute:hover { border-color: var(--ochre); color: var(--ink); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    /* Annonces (coup d'envoi, mi-temps, fin…) en haut de la page, sans bloquer l'arbitrage. */
    .overlay { position: fixed; top: 12px; left: 50%; z-index: 60; width: min(560px, calc(100vw - 24px)); transform: translateX(-50%); cursor: pointer; }
    .banner { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 16px; row-gap: 2px; padding: 14px 22px 14px 14px; border-radius: 18px; background: var(--ink); color: var(--paper); box-shadow: 0 24px 60px -20px rgba(0, 0, 0, .65); animation: drop .5s cubic-bezier(.2, .9, .3, 1.2); }
    .banner-icon { grid-row: span 2; width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%; background: var(--gold); color: var(--ink); }
    .banner strong { font-family: var(--display); font-size: clamp(24px, 4vw, 34px); font-weight: 600; line-height: 1.05; }
    .banner-detail { color: var(--gold-light); font-size: 14px; font-weight: 600; }
    .toasts { position: fixed; top: 12px; right: 16px; z-index: 65; display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); }
    .overlay ~ .toasts { top: 110px; }
    .toast { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface); box-shadow: 0 16px 40px -16px rgba(43, 34, 25, .55); border-left: 5px solid var(--ochre); cursor: pointer; animation: slide .35s cubic-bezier(.2, .8, .2, 1); }
    .toast-icon { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--gold); color: var(--ink); }
    .toast-text { display: grid; gap: 2px; font-size: 13px; line-height: 1.35; }
    .toast-text strong { font-size: 15px; }
    .toast-text span { color: var(--muted); }
    .toast-penalty { border-left-color: var(--rust); }
    .toast-penalty .toast-icon { background: var(--rust); color: white; }
    .toast-sub { border-left-color: var(--ink); }
    .toast-sub .toast-icon { background: var(--ink); color: var(--gold-light); }
    @keyframes slide { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: none; } }
    @keyframes drop { from { opacity: 0; transform: translateY(-40px) scale(.9); } to { opacity: 1; transform: none; } }
    @media (max-width: 900px) { .toasts { left: 50%; right: auto; transform: translateX(-50%); } }
    @media (max-width: 560px) { .mute { bottom: auto; top: 12px; left: auto; right: 12px; } }
  `,
})
export class MatchPopups implements OnDestroy {
  readonly game = input.required<Game>();
  protected readonly banner = signal<Announcement | null>(null);
  protected readonly toasts = signal<Toast[]>([]);
  protected readonly spoken = signal('');
  protected readonly muted = signal(this.readMuted());

  private previous: Game | null = null;
  private readonly seenEvents = new Set<number>();
  private readonly announcedSubs = new Set<number>();
  private readonly bannerQueue: Announcement[] = [];
  private bannerTimer?: ReturnType<typeof setTimeout>;
  private readonly toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  constructor() {
    effect(() => this.diff(this.game()));
  }

  ngOnDestroy(): void {
    clearTimeout(this.bannerTimer);
    this.toastTimers.forEach((t) => clearTimeout(t));
  }

  private diff(game: Game): void {
    const prev = this.previous?.id === game.id ? this.previous : null;
    this.previous = game;
    const events = game.events ?? [];
    const subs = game.substitutions ?? [];

    // Premier chargement : on mémorise l'existant sans le rejouer. Les remplacements faits
    // pendant une mi-temps en cours restent à annoncer au début de la 2e mi-temps.
    if (!prev) {
      events.forEach((e) => this.seenEvents.add(e.id));
      if (game.phase !== 'halftime') subs.forEach((s) => this.announcedSubs.add(s.id));
      return;
    }

    const score = `${game.team_a.name} ${game.team_a.score} – ${game.team_b.score} ${game.team_b.name}`;

    if (prev.status === 'scheduled' && game.status === 'live') {
      this.announce('play', 'Coup d’envoi !', `${game.team_a.name} contre ${game.team_b.name}`);
    }
    if (prev.phase === 'first_half' && game.phase === 'halftime') {
      this.announce('coffee', 'Mi-temps', score);
    }
    if (prev.phase === 'halftime' && game.phase === 'second_half') {
      this.announce('play', 'Début de la 2e mi-temps', score);
      this.announceSubstitutions(game, subs);
    }
    if (prev.status === 'live' && game.status === 'finished') {
      const a = game.team_a.score;
      const b = game.team_b.score;
      const winner = a === b ? 'Match nul' : `Victoire de ${a > b ? game.team_a.name : game.team_b.name}`;
      this.announce('flag', 'Fin du match', `${winner} · ${game.team_a.score} – ${game.team_b.score}`);
    }

    // Nouveaux points et pénalités, dans l'ordre où ils ont été marqués.
    const fresh = events.filter((e) => !this.seenEvents.has(e.id)).sort((x, y) => x.id - y.id);
    fresh.forEach((e) => {
      this.seenEvents.add(e.id);
      this.pointToast(game, e);
    });
    // Un point annulé disparaît du fil : il pourra être réannoncé s'il revient.
    const ids = new Set(events.map((e) => e.id));
    this.seenEvents.forEach((id) => ids.has(id) || this.seenEvents.delete(id));

    // Remplacement fait hors mi-temps (match rouvert…) : annoncé immédiatement.
    if (game.phase !== 'halftime') this.announceSubstitutions(game, subs);
  }

  private announceSubstitutions(game: Game, subs: Substitution[]): void {
    subs
      .filter((s) => !this.announcedSubs.has(s.id))
      .sort((x, y) => x.id - y.id)
      .forEach((s) => {
        this.announcedSubs.add(s.id);
        const team = s.team_id === game.team_a.id ? game.team_a.name : game.team_b.name;
        this.toast('sub', 'arrow-left-right', `Remplacement · ${team}`, `${s.player_in} entre à la place de ${s.player_out}`);
      });
  }

  private pointToast(game: Game, e: ScoreEvent): void {
    const team = e.team_id === game.team_a.id ? game.team_a.name : game.team_b.name;
    const who = e.player ?? 'Points d’équipe';
    const rubric = e.rubric ? ` · ${e.rubric}` : '';
    if (e.points < 0) {
      this.toast('penalty', 'triangle-alert', `Pénalité ${e.points}`, `${who} · ${team}${rubric}`);
    } else {
      this.toast('point', 'star', `+${e.points} points`, `${who} · ${team}${rubric}`);
    }
  }

  private announce(icon: IconName, title: string, detail: string): void {
    this.spoken.set(`${title}. ${detail}`);
    if (this.muted()) return;
    this.bannerQueue.push({ id: this.nextId++, icon, title, detail });
    if (!this.banner()) this.nextBanner();
  }

  protected nextBanner(): void {
    clearTimeout(this.bannerTimer);
    const next = this.bannerQueue.shift() ?? null;
    this.banner.set(next);
    if (next) this.bannerTimer = setTimeout(() => this.nextBanner(), 3500);
  }

  private toast(tone: Toast['tone'], icon: IconName, title: string, detail: string): void {
    this.spoken.set(`${title}. ${detail}`);
    if (this.muted()) return;
    const id = this.nextId++;
    // Au plus 4 notifications visibles : les plus anciennes laissent la place.
    this.toasts.update((list) => [...list, { id, tone, icon, title, detail }].slice(-4));
    this.toastTimers.set(id, setTimeout(() => this.dismiss(id), tone === 'sub' ? 6000 : 4000));
  }

  protected dismiss(id: number): void {
    clearTimeout(this.toastTimers.get(id));
    this.toastTimers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  protected toggleMute(): void {
    this.muted.update((m) => !m);
    try {
      localStorage.setItem(MUTE_KEY, this.muted() ? '1' : '0');
    } catch {
      // Stockage indisponible : le réglage vaut pour cette visite.
    }
    if (this.muted()) {
      this.bannerQueue.length = 0;
      this.nextBanner();
      this.toasts().forEach((t) => this.dismiss(t.id));
    }
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
