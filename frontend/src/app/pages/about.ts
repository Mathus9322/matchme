import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Reveal } from '../shared/reveal';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-about',
  imports: [Icon, RouterLink, Reveal],
  template: `
    <section class="intro">
      <div class="intro-copy">
        <p class="eyebrow step" style="--d: 0">À propos de MatchMe</p>
        <h1 class="page-title step" style="--d: 1">Le génie en herbe,<br /><em>version numérique.</em></h1>
        <p class="lead step" style="--d: 2">
          MatchMe est né d’une idée simple : un tournoi de culture générale mérite mieux qu’un tableau noir et une feuille de score.
          Nous donnons aux organisateurs un outil clair pour gérer leurs compétitions, et au public un moyen de suivre chaque point en direct.
        </p>
      </div>
      <div class="intro-art step" style="--d: 2" aria-hidden="true">
        <span class="tile t1">?</span>
        <span class="tile t2">+40</span>
        <span class="tile t3"><app-icon name="star" [size]="54" [stroke]="1.8" /></span>
        <span class="tile t4">A·B</span>
      </div>
    </section>

    <section class="section">
      <p class="eyebrow" appReveal>Notre mission</p>
      <div class="mission">
        <blockquote appReveal>« Faire de chaque match un moment de partage, où l’on célèbre la curiosité autant que la victoire. »</blockquote>
        <p class="muted" [appReveal]="120">
          Qu’il s’agisse d’une rencontre entre deux classes, d’un championnat inter-lycées ou d’une coupe régionale,
          MatchMe centralise les équipes, les joueurs, les calendriers et les scores, pour que les organisateurs se concentrent sur l’essentiel :
          les questions, les candidats et l’ambiance.
        </p>
      </div>
    </section>

    <section class="section">
      <p class="eyebrow" appReveal>Pour qui ?</p>
      <h2 class="h2" appReveal>Une place pour chacun</h2>
      <div class="roles">
        @for (r of roles; track r.title; let i = $index) {
          <article class="role" [appReveal]="i * 100">
            <span class="role-icon"><app-icon [name]="r.icon" [size]="20" /></span>
            <h3>{{ r.title }}</h3>
            <p>{{ r.text }}</p>
          </article>
        }
      </div>
    </section>

    <section class="section">
      <p class="eyebrow" appReveal>Comment ça marche</p>
      <h2 class="h2" appReveal>De l’inscription à la finale</h2>
      <ol class="timeline">
        @for (s of steps; track s.title; let i = $index) {
          <li [appReveal]="i * 90">
            <span class="dot">{{ i + 1 }}</span>
            <div><h3>{{ s.title }}</h3><p>{{ s.text }}</p></div>
          </li>
        }
      </ol>
    </section>

    <section class="section rules" appReveal>
      <div>
        <p class="eyebrow">Les règles du score</p>
        <h2 class="h2">Simples et transparentes</h2>
      </div>
      <ul>
        <li><strong>±10 à ±40</strong> points par réponse, attribués à un joueur ou à toute l’équipe.</li>
        <li><strong>3 points</strong> au classement pour une victoire, <strong>1</strong> pour un match nul.</li>
        <li>En cas d’égalité : la différence de points, puis le total marqué.</li>
        <li>Chaque point est horodaté dans le fil du match et peut être annulé par l’organisateur.</li>
      </ul>
    </section>

    <section class="section">
      <p class="eyebrow" appReveal>Nos valeurs</p>
      <div class="values">
        @for (v of values; track v.title; let i = $index) {
          <div class="value" [appReveal]="i * 100"><h3>{{ v.title }}</h3><p>{{ v.text }}</p></div>
        }
      </div>
    </section>

    <section class="cta-band" appReveal>
      <div>
        <h2>Prêts pour le premier buzz ?</h2>
        <p>Créez votre équipe, lancez un match amical ou organisez une compétition.</p>
      </div>
      <a class="btn" [routerLink]="auth.hasSpace() ? '/gestion' : auth.isLoggedIn() ? '/competitions' : '/inscription'">
        {{ auth.hasSpace() ? 'Ouvrir l’espace gestion' : auth.isLoggedIn() ? 'Voir les compétitions' : 'Créer un compte' }} <app-icon name="arrow-right" />
      </a>
    </section>
  `,
  styles: `
    .intro { display: grid; grid-template-columns: 1.3fr 1fr; align-items: center; gap: 40px; padding: 20px 0 10px; }
    .step { opacity: 0; animation: rise .8s cubic-bezier(.2, .7, .2, 1) forwards; animation-delay: calc(var(--d) * 120ms); }
    .lead { max-width: 580px; font-size: 15px; }
    .intro-art { position: relative; height: 300px; }
    .tile { position: absolute; display: grid; place-items: center; border-radius: 22px; font-family: var(--display); font-weight: 600; box-shadow: 0 24px 40px -22px rgba(43, 34, 25, .5); animation: float 7s ease-in-out infinite; }
    .t1 { left: 8%; top: 8%; width: 140px; height: 140px; background: var(--ink); color: var(--gold); font-size: 72px; }
    .t2 { right: 6%; top: 0; width: 110px; height: 110px; background: var(--rust); color: white; font-family: var(--mono); font-size: 26px; animation-delay: -2s; }
    .t3 { right: 18%; bottom: 4%; width: 120px; height: 120px; background: var(--gold); color: var(--ink); font-size: 54px; animation-delay: -4s; }
    .t4 { left: 22%; bottom: 0; width: 96px; height: 96px; background: var(--sand); color: var(--ink); font-family: var(--mono); font-size: 18px; animation-delay: -5.5s; }
    .h2 { margin-bottom: 20px; font-family: var(--display); font-size: clamp(28px, 4vw, 38px); font-weight: 600; }
    .mission { display: grid; grid-template-columns: 1.1fr 1fr; gap: 36px; align-items: center; }
    blockquote { margin: 0; padding-left: 22px; border-left: 4px solid var(--ochre); font-family: var(--display); font-size: clamp(22px, 3vw, 30px); line-height: 1.3; }
    .mission p { margin: 0; font-size: 14px; line-height: 1.7; }
    .roles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .role { padding: 22px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); transition: translate .2s ease, border-color .2s ease; }
    .role:hover { translate: 0 -4px; border-color: var(--ochre); }
    .role-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: rgba(240, 205, 135, .5); color: var(--ochre-ink); }
    .role h3 { margin-top: 14px; font-size: 16px; }
    .role p, .timeline p, .value p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .timeline { position: relative; display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .timeline::before { content: ''; position: absolute; left: 19px; top: 20px; bottom: 20px; width: 2px; background: linear-gradient(var(--gold), var(--rust)); }
    .timeline li { position: relative; display: grid; grid-template-columns: 40px 1fr; gap: 18px; padding: 12px 0; }
    .dot { z-index: 1; width: 40px; height: 40px; display: grid; place-items: center; border: 3px solid var(--paper); border-radius: 50%; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-weight: 700; }
    .timeline h3 { margin-top: 9px; font-size: 16px; }
    .rules { display: grid; grid-template-columns: 1fr 1.4fr; gap: 30px; padding: 32px; border-radius: 18px; background: var(--ink); color: var(--paper); }
    .rules .eyebrow { color: var(--gold); }
    .rules ul { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
    .rules li { padding: 12px 16px; border: 1px solid rgba(240, 205, 135, .2); border-radius: 10px; font-size: 14px; line-height: 1.5; }
    .rules strong { color: var(--gold-light); }
    .values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .value { padding: 22px 0 0; border-top: 3px solid var(--ochre); }
    .value:nth-child(2) { border-color: var(--gold); }
    .value:nth-child(3) { border-color: var(--rust); }
    .value h3 { font-size: 18px; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    @keyframes float { 50% { transform: translateY(-14px) rotate(2deg); } }
    @media (max-width: 900px) {
      .intro, .mission, .rules { grid-template-columns: 1fr; }
      .intro-art { height: 240px; }
      .roles { grid-template-columns: 1fr 1fr; }
      .values { grid-template-columns: 1fr; }
    }
    @media (max-width: 520px) {
      .roles { grid-template-columns: 1fr; }
      .t1 { width: 110px; height: 110px; font-size: 56px; }
      .rules { padding: 22px; }
    }
  `,
})
export class AboutPage {
  protected readonly auth = inject(AuthService);

  protected readonly roles = [
    { icon: 'eye' as const, title: 'Spectateurs', text: 'Suivez les matchs en direct et consultez les classements, sans créer de compte.' },
    { icon: 'users' as const, title: 'Capitaines', text: 'Créez votre équipe, gérez vos joueurs et inscrivez-vous aux compétitions ouvertes.' },
    { icon: 'trophy' as const, title: 'Managers', text: 'Rôle attribué par un administrateur : créez des tournois, programmez les rencontres et arbitrez les scores.' },
    { icon: 'shield' as const, title: 'Administrateurs', text: 'Veillent sur la plateforme : comptes, compétitions, équipes et matchs.' },
  ];

  protected readonly steps = [
    { title: 'Créer un compte', text: 'Un nom, une adresse e-mail et un mot de passe suffisent.' },
    { title: 'Composer les équipes', text: 'Jusqu’à douze joueurs par équipe, dans l’ordre de votre choix.' },
    { title: 'Organiser la compétition', text: 'Dates, statut, inscriptions : tout se règle depuis une seule page.' },
    { title: 'Programmer les matchs', text: 'Choisissez les adversaires, la phase et l’horaire de chaque rencontre.' },
    { title: 'Jouer en direct', text: 'Les points s’affichent instantanément et le classement se met à jour.' },
  ];

  protected readonly values = [
    { title: 'Simplicité', text: 'Un outil qui s’efface derrière le jeu : quelques clics pour tout gérer.' },
    { title: 'Transparence', text: 'Chaque point est visible, horodaté et consultable par tous.' },
    { title: 'Esprit d’équipe', text: 'Le savoir se partage : MatchMe met le collectif à l’honneur.' },
  ];
}
