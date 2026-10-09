import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Competition, COMPETITION_STATUS_LABELS } from '../core/models';

/** Fonds de secours quand la compétition n'a pas d'image de couverture (choisi selon l'id). */
const FALLBACKS = [
  'linear-gradient(135deg, #2b2219, #8b4d1c)',
  'linear-gradient(135deg, #8b4d1c, #c7902b)',
  'linear-gradient(135deg, #3d3226, #ac6327)',
  'linear-gradient(135deg, #6b6558, #2b2219)',
];

/** Carte de compétition : image de couverture, statut en pastille, titre sur un volet crème arrondi. */
@Component({
  selector: 'app-competition-card',
  imports: [RouterLink, DatePipe],
  template: `
    @let c = competition();
    <a class="comp-card" [routerLink]="link()">
      <div class="cover" [style.background]="c.cover_url ? null : fallback()">
        @if (c.cover_url) { <img [src]="c.cover_url" alt="" loading="lazy" /> }
        @else { <span class="monogram" aria-hidden="true">{{ initials() }}</span> }
        <span [class]="'status status-' + c.status">{{ labels[c.status] }}</span>
      </div>
      <div class="panel">
        <svg class="wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 V44 Q0 22 30 18 C100 7 150 0 215 0 C295 0 340 10 368 22 Q400 34 400 60 Z" />
        </svg>
        <h3>{{ c.name }}</h3>
        @if (c.starts_on || c.ends_on) {
          <p class="meta">
            @if (c.starts_on) { Du {{ c.starts_on | date: 'd MMM y' }} }
            @if (c.ends_on) { au {{ c.ends_on | date: 'd MMM y' }} }
          </p>
        }
        <p class="meta foot">{{ c.teams_count ?? 0 }} équipes · {{ c.games_count ?? 0 }} matchs @if (c.owner) { · par {{ c.owner.name }} }</p>
      </div>
    </a>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .comp-card { --cream: #ffe3af; position: relative; display: flex; flex-direction: column; height: 100%; min-height: 330px; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--cream); color: var(--ink); text-decoration: none; transition: transform .15s ease, border-color .15s ease; }
    .comp-card:hover { border-color: var(--ochre); transform: translateY(-2px); }
    .comp-card:focus-visible { outline: 3px solid var(--ochre); outline-offset: 3px; }
    .cover { position: relative; height: 190px; flex: none; overflow: hidden; }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s ease; }
    .comp-card:hover .cover img { transform: scale(1.04); }
    .monogram { position: absolute; inset: 0 0 40px; display: grid; place-items: center; color: rgba(240, 205, 135, .35); font-family: 'Anton', Impact, 'Arial Narrow', sans-serif; font-size: 72px; letter-spacing: .04em; }
    .status { position: absolute; top: 18px; left: 18px; padding: 7px 18px; border-radius: 999px; background: var(--rust-dark); color: white; font-size: 14px; text-transform: lowercase; }
    .status-draft { background: var(--muted); }
    .status-open { background: var(--ochre-ink); }
    .status-finished { background: var(--ink); }
    .panel { position: relative; flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 8px 26px 22px; background: var(--cream); }
    .wave { position: absolute; left: 0; right: 0; bottom: calc(100% - 1px); width: 100%; height: 40px; fill: var(--cream); }
    h3 { margin: 0; font-family: 'Anton', Impact, 'Arial Narrow', sans-serif; font-size: 24px; font-weight: 400; line-height: 1.15; overflow-wrap: anywhere; }
    .meta { margin: 0; color: var(--rust-dark); font-size: 12px; }
    .foot { margin-top: auto; padding-top: 12px; color: var(--muted); font-family: var(--mono); font-size: 10px; }
  `,
})
export class CompetitionCard {
  readonly competition = input.required<Competition>();
  /** Lien vers la fiche (public ou espace gestion selon la page appelante). */
  readonly link = input.required<string | unknown[]>();
  protected readonly labels = COMPETITION_STATUS_LABELS;
  protected readonly fallback = computed(() => FALLBACKS[this.competition().id % FALLBACKS.length]);
  protected readonly initials = computed(() =>
    this.competition().name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
  );
}
