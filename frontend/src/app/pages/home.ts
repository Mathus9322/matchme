import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, interval, switchMap, timer } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Competition, COMPETITION_STATUS_LABELS, Game } from '../core/models';
import { CountUp } from '../shared/count-up';
import { GameRow } from '../shared/game-row';
import { Reveal } from '../shared/reveal';
import { Icon } from '../shared/icon';

interface Showcase {
  id: number | null;
  label: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

@Component({
  selector: 'app-home',
  imports: [Icon, RouterLink, GameRow, CountUp, Reveal],
  template: `
    <section class="hero">
      <div class="hero-bg" aria-hidden="true">
        <span class="blob blob-1"></span>
        <span class="blob blob-2"></span>
        <span class="blob blob-3"></span>
        <span class="grid-lines"></span>
      </div>

      <div class="hero-copy">
        <p class="hero-kicker step" style="--d: 0"><span class="live-dot"></span> Génie en herbe · scores en direct</p>
        <h1 class="hero-title">
          <span class="line step" style="--d: 1">Que le meilleur</span>
          <span class="line step" style="--d: 2"><em>l’emporte.</em></span>
        </h1>
        <p class="hero-lead step" style="--d: 3">
          Organisez vos tournois, composez vos équipes et faites vivre chaque bonne réponse en temps réel, de la première question à la finale.
        </p>
        <div class="hero-actions step" style="--d: 4">
          @if (auth.canOrganize()) {
            <a class="btn btn-hero" routerLink="/competitions/nouvelle">Créer une compétition <span class="arrow"><app-icon name="arrow-right" /></span></a>
            <a class="btn btn-outline" routerLink="/equipes/nouvelle">Créer une équipe</a>
          } @else if (auth.isLoggedIn()) {
            <a class="btn btn-hero" routerLink="/amical">Lancer un match amical <span class="arrow"><app-icon name="arrow-right" /></span></a>
            <a class="btn btn-outline" routerLink="/equipes/nouvelle">Créer une équipe</a>
          } @else {
            <a class="btn btn-hero" routerLink="/inscription">Commencer gratuitement <span class="arrow"><app-icon name="arrow-right" /></span></a>
            <a class="btn btn-outline" routerLink="/a-propos">Découvrir MatchMe</a>
          }
        </div>

        <dl class="hero-stats step" style="--d: 5">
          <div><dt>Compétitions</dt><dd [appCountUp]="competitionCount()"></dd></div>
          <div><dt>Équipes</dt><dd [appCountUp]="teamCount()"></dd></div>
          <div><dt>En direct</dt><dd [appCountUp]="live().length"></dd></div>
        </dl>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <span class="ring ring-1"></span>
        <span class="ring ring-2"></span>

        @let s = showcase();
        <a class="score-card" [routerLink]="s.id ? ['/matchs', s.id] : ['/competitions']" tabindex="-1">
          <div class="score-card-head">
            <span class="badge badge-live"><span class="live-dot dot-light"></span> {{ s.id ? 'En direct' : 'Démo' }}</span>
            <span class="muted small">{{ s.label }}</span>
          </div>
          <div class="score-line">
            <span class="team-name">{{ s.teamA }}</span>
            @for (v of [s.scoreA]; track v) { <strong class="pts pts-a">{{ v }}</strong> }
          </div>
          <div class="score-line">
            <span class="team-name">{{ s.teamB }}</span>
            @for (v of [s.scoreB]; track v) { <strong class="pts pts-b">{{ v }}</strong> }
          </div>
          <div class="bar"><span [style.width.%]="share()"></span></div>
        </a>

        <span class="chip chip-1">+40</span>
        <span class="chip chip-2">+20</span>
        <span class="chip chip-3">+10</span>
        <span class="mini-card">
          <span class="mini-icon"><app-icon name="star" /></span>
          <span><strong>Classement</strong><br /><span class="muted">mis à jour à chaque match</span></span>
        </span>
      </div>
    </section>

    <section class="features">
      @for (f of features; track f.title; let i = $index) {
        <article class="feature" [appReveal]="i * 110">
          <span class="feature-num">0{{ i + 1 }}</span>
          <h3>{{ f.title }}</h3>
          <p>{{ f.text }}</p>
        </article>
      }
    </section>

    <section class="section" appReveal>
      <header><h2 class="section-title"><span class="live-dot"></span>&nbsp; En direct</h2><span class="muted small">Actualisé automatiquement</span></header>
      <div class="stack">
        @for (game of live(); track game.id) {
          <app-game-row [game]="game" [showCompetition]="true" />
        } @empty {
          <p class="empty">Aucun match en cours pour le moment.</p>
        }
      </div>
    </section>

    <div class="two-cols section">
      <section appReveal>
        <h2 class="section-title">À venir & résultats</h2>
        <div class="stack" style="margin-top: 14px">
          @for (game of others(); track game.id) {
            <app-game-row [game]="game" [showCompetition]="true" />
          } @empty {
            <p class="empty">Aucun match programmé.</p>
          }
        </div>
      </section>
      <section [appReveal]="120">
        <div class="row" style="justify-content: space-between">
          <h2 class="section-title">Compétitions</h2>
          <a class="small" routerLink="/competitions">Tout voir <app-icon name="arrow-right" [size]="14" /></a>
        </div>
        <div class="stack" style="margin-top: 14px">
          @for (competition of competitions(); track competition.id) {
            <a class="card card-link" [routerLink]="['/competitions', competition.id]">
              <div class="row" style="justify-content: space-between">
                <h3>{{ competition.name }}</h3>
                <span [class]="'badge badge-' + competition.status">{{ statusLabels[competition.status] }}</span>
              </div>
              <p class="meta">{{ competition.teams_count }} équipes · {{ competition.games_count }} matchs</p>
            </a>
          } @empty {
            <p class="empty">Aucune compétition.</p>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }
    .hero { position: relative; isolation: isolate; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: center; gap: 40px; min-height: 560px; margin-top: -12px; padding: 64px 56px; border-radius: 24px; background: var(--ink); color: var(--paper); }

    .hero-bg { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
    .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; animation: drift 16s ease-in-out infinite alternate; }
    .blob-1 { width: 420px; height: 420px; left: -120px; top: -140px; background: var(--ochre); }
    .blob-2 { width: 360px; height: 360px; right: -80px; bottom: -160px; background: var(--rust); animation-duration: 19s; animation-delay: -6s; }
    .blob-3 { width: 260px; height: 260px; right: 30%; top: 30%; background: var(--gold); opacity: .22; animation-duration: 23s; animation-delay: -11s; }
    .grid-lines { position: absolute; inset: 0; background-image: linear-gradient(rgba(240, 205, 135, .07) 1px, transparent 1px), linear-gradient(90deg, rgba(240, 205, 135, .07) 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%); }

    .step { opacity: 0; animation: rise .8s cubic-bezier(.2, .7, .2, 1) forwards; animation-delay: calc(var(--d) * 110ms + 100ms); }
    .hero-kicker { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 22px; padding: 7px 14px; border: 1px solid rgba(240, 205, 135, .3); border-radius: 999px; background: rgba(240, 205, 135, .08); color: var(--gold-light); font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
    .hero-title { font-family: var(--display); font-size: clamp(44px, 7vw, 84px); font-weight: 600; line-height: .95; letter-spacing: -.01em; }
    .hero-title .line { display: block; }
    .hero-title em { background: linear-gradient(100deg, var(--gold-light), var(--gold) 30%, var(--ochre) 60%, var(--gold-light) 90%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rise .8s cubic-bezier(.2, .7, .2, 1) forwards, shimmer 6s linear 1.2s infinite; animation-delay: 320ms, 1.2s; }
    .hero-lead { max-width: 500px; margin: 24px 0 0; color: rgba(246, 244, 238, .78); font-size: 16px; line-height: 1.6; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
    .btn-hero { min-height: 50px; padding: 0 24px; border-color: var(--gold); background: var(--gold); color: var(--ink); font-size: 14px; box-shadow: 0 10px 30px -10px rgba(234, 197, 117, .7); }
    .btn-hero:hover { border-color: var(--gold-light); background: var(--gold-light); transform: translateY(-2px); }
    .btn-hero .arrow { display: inline-flex; transition: transform .2s ease; }
    .btn-hero:hover .arrow { transform: translateX(4px); }
    .btn-outline { min-height: 50px; padding: 0 22px; border-color: rgba(246, 244, 238, .3); background: transparent; color: var(--paper); font-size: 14px; }
    .btn-outline:hover { border-color: var(--gold-light); background: rgba(240, 205, 135, .1); }
    .hero-stats { display: flex; gap: 34px; margin: 42px 0 0; padding-top: 24px; border-top: 1px solid rgba(240, 205, 135, .18); }
    .hero-stats dt { color: rgba(246, 244, 238, .6); font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .hero-stats dd { margin: 4px 0 0; color: var(--gold-light); font-family: var(--display); font-size: 36px; font-weight: 600; }

    .hero-visual { position: relative; height: 420px; opacity: 0; animation: rise 1s cubic-bezier(.2, .7, .2, 1) .45s forwards; }
    .ring { position: absolute; left: 50%; top: 50%; border: 1px dashed rgba(240, 205, 135, .3); border-radius: 50%; translate: -50% -50%; animation: spin-slow 40s linear infinite; }
    .ring-1 { width: 380px; height: 380px; }
    .ring-2 { width: 270px; height: 270px; border-style: solid; border-color: rgba(199, 144, 43, .25); animation-direction: reverse; animation-duration: 28s; }
    .score-card { position: absolute; left: 50%; top: 50%; width: min(330px, 92%); padding: 22px; border-radius: 18px; background: var(--surface); color: var(--ink); text-decoration: none; box-shadow: 0 30px 60px -20px rgba(0, 0, 0, .55); translate: -50% -50%; animation: float 6s ease-in-out infinite; }
    .score-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .dot-light { background: white; }
    .score-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .team-name { overflow: hidden; font-size: 15px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .pts { font-family: var(--display); font-size: 38px; line-height: 1; font-variant-numeric: tabular-nums; animation: bump .5s ease; }
    .pts-a { color: var(--ochre-ink); }
    .pts-b { color: var(--rust); }
    .bar { height: 8px; margin-top: 16px; overflow: hidden; border-radius: 99px; background: var(--rust); }
    .bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--gold), var(--ochre)); transition: width .8s cubic-bezier(.2, .7, .2, 1); }
    .chip { position: absolute; padding: 7px 12px; border-radius: 10px; background: var(--gold); color: var(--ink); font-family: var(--mono); font-size: 13px; font-weight: 700; box-shadow: 0 12px 24px -10px rgba(0, 0, 0, .5); animation: pop 4.5s ease-in-out infinite; }
    .chip-1 { left: 4%; top: 18%; }
    .chip-2 { right: 2%; top: 8%; background: var(--rust); color: white; animation-delay: -1.5s; }
    .chip-3 { right: 8%; bottom: 14%; background: var(--gold-light); animation-delay: -3s; }
    .mini-card { position: absolute; left: 0; bottom: 6%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; background: rgba(255, 253, 248, .95); color: var(--ink); font-size: 12px; line-height: 1.3; box-shadow: 0 16px 30px -12px rgba(0, 0, 0, .5); animation: float 7s ease-in-out -2s infinite; }
    .mini-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--ochre); color: white; }

    .features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 28px; }
    .feature { padding: 22px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); transition: border-color .2s ease, translate .2s ease; }
    .feature:hover { border-color: var(--ochre); translate: 0 -3px; }
    .feature-num { color: var(--rust); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .feature h3 { margin-top: 10px; font-size: 16px; }
    .feature p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .section-title { display: inline-flex; align-items: center; }

    @keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
    @keyframes shimmer { to { background-position: -220% 0; } }
    @keyframes drift { to { transform: translate(60px, 40px) scale(1.15); } }
    @keyframes float { 50% { transform: translateY(-12px); } }
    @keyframes bump { 0% { transform: scale(1.35); color: var(--gold); } 100% { transform: none; } }
    @keyframes pop { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-16px) rotate(3deg); } }

    @media (max-width: 960px) {
      .hero { grid-template-columns: 1fr; padding: 44px 28px; }
      .hero-visual { height: 340px; }
      .features { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .hero { padding: 36px 20px; border-radius: 18px; }
      .hero-stats { gap: 20px; }
      .hero-stats dd { font-size: 28px; }
      .hero-visual { height: 300px; }
      .ring-1 { width: 280px; height: 280px; }
      .ring-2 { width: 200px; height: 200px; }
      .mini-card { display: none; }
      .features { grid-template-columns: 1fr; }
    }
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly statusLabels = COMPETITION_STATUS_LABELS;
  protected readonly live = signal<Game[]>([]);
  protected readonly others = signal<Game[]>([]);
  protected readonly competitions = signal<Competition[]>([]);
  protected readonly competitionCount = signal(0);
  protected readonly teamCount = signal(0);
  private readonly demo = signal({ scoreA: 120, scoreB: 90 });

  protected readonly features = [
    { title: 'Créez votre compte', text: 'Inscription en quelques secondes pour organiser ou participer.' },
    { title: 'Composez vos équipes', text: 'Ajoutez vos joueurs, réorganisez-les et inscrivez l’équipe aux tournois.' },
    { title: 'Lancez la compétition', text: 'Programmez les rencontres, le classement se calcule tout seul.' },
    { title: 'Vivez le direct', text: 'Chaque point s’affiche instantanément pour le public, sans compte.' },
  ];

  /** Match mis en avant dans le hero : le premier match en direct, sinon une démo animée. */
  protected readonly showcase = computed<Showcase>(() => {
    const game = this.live()[0];
    if (game) {
      return {
        id: game.id,
        label: game.competition?.name ?? '',
        teamA: game.team_a.name,
        teamB: game.team_b.name,
        scoreA: game.team_a.score,
        scoreB: game.team_b.score,
      };
    }
    const { scoreA, scoreB } = this.demo();
    return { id: null, label: 'Finale', teamA: 'Gaïndé de Thiès', teamB: 'Jambaar de Dakar', scoreA, scoreB };
  });

  protected readonly share = computed(() => {
    const { scoreA, scoreB } = this.showcase();
    const total = Math.max(scoreA, 0) + Math.max(scoreB, 0);
    return total ? (Math.max(scoreA, 0) / total) * 100 : 50;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    timer(0, 5000)
      .pipe(switchMap(() => this.api.games({ status: 'live' }).pipe(catchError(() => EMPTY))), takeUntilDestroyed(destroyRef))
      .subscribe((games) => this.live.set(games));

    interval(2600)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        const points = [10, 20, 30, 40][Math.floor(Math.random() * 4)];
        this.demo.update((d) => (Math.random() < 0.5 ? { ...d, scoreA: d.scoreA + points } : { ...d, scoreB: d.scoreB + points }));
        if (this.demo().scoreA + this.demo().scoreB > 600) {
          this.demo.set({ scoreA: 120, scoreB: 90 });
        }
      });

    this.api.games({ status: 'scheduled,finished', limit: 8 }).subscribe((games) => this.others.set(games));
    this.api.competitions().subscribe((list) => {
      this.competitions.set(list.slice(0, 5));
      this.competitionCount.set(list.length);
    });
    this.api.teams().subscribe((teams) => this.teamCount.set(teams.length));
  }
}
