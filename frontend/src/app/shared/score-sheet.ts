import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { ResultSheet, SheetTeam } from '../core/models';
import { Avatar } from './avatar';
import { Logo } from './logo';

/** Feuille de score d'un match terminé, mise en page au format A4 pour l'export PDF / PNG. */
@Component({
  selector: 'app-score-sheet',
  imports: [DatePipe, Avatar, Logo],
  template: `
    @let s = sheet();
    <article class="sheet">
      <header class="head">
        <div>
          <p class="brand"><app-logo [size]="30" /><span>match<span>me</span><i>.</i></span></p>
          <p class="kicker">Feuille de score officielle</p>
        </div>
        <div class="meta">
          <strong>{{ s.competition }}</strong>
          <span>{{ subtitle(s) }}</span>
          @if (s.finished_at) { <span>{{ s.finished_at | date: 'EEEE d MMMM y, HH:mm' }}</span> }
        </div>
      </header>

      <section class="score">
        @for (t of [s.team_a, s.team_b]; track $index; let b = $odd) {
          <div class="side" [class.right]="b" [class.win]="s.winner === (b ? 'b' : 'a')">
            <app-avatar [src]="t.logo_url" [name]="t.name" [size]="64" shape="square" />
            <div class="side-info">
              <strong class="team">{{ t.name }}</strong>
              @if (t.city) { <span class="city">{{ t.city }}</span> }
              @if (s.winner === (b ? 'b' : 'a')) { <span class="winner">Vainqueur</span> }
            </div>
            <span class="pts">{{ t.score }}</span>
          </div>
          @if (!b) { <span class="dash">{{ s.winner ? '–' : 'NUL' }}</span> }
        }
      </section>

      <section class="teams">
        @for (t of [s.team_a, s.team_b]; track $index; let b = $odd) {
          <div class="team-block">
            <h3>{{ t.name }}</h3>
            <table>
              <thead><tr><th>Joueur</th><th>Poste</th><th class="num">Points</th></tr></thead>
              <tbody>
                @for (p of t.players; track $index) {
                  <tr>
                    <td><span class="who"><app-avatar [src]="p.photo_url" [name]="p.name" [size]="22" /> {{ p.name }}</span></td>
                    <td class="role">{{ role(p) }}</td>
                    <td class="num">{{ p.score }}</td>
                  </tr>
                }
                <tr class="sub"><td colspan="2">Points d’équipe</td><td class="num">{{ t.bonus }}</td></tr>
                <tr class="total"><td colspan="2">Total</td><td class="num">{{ t.score }}</td></tr>
              </tbody>
            </table>
            @if (t.substitutions.length) {
              <p class="subs"><strong>Remplacements (mi-temps) :</strong> @for (x of t.substitutions; track $index) { {{ x.in }} ← {{ x.out }}{{ $last ? '' : ' · ' }} }</p>
            }
          </div>
        }
      </section>

      @if (s.rubrics.length) {
        <section>
          <h3 class="h">Score par rubrique</h3>
          <table class="rubrics">
            <thead><tr><th>Rubrique</th><th class="num">{{ s.team_a.name }}</th><th class="num">{{ s.team_b.name }}</th></tr></thead>
            <tbody>
              @for (r of s.rubrics; track $index; let i = $index) {
                <tr><td>{{ r }}</td><td class="num">{{ s.team_a.rubrics[i] }}</td><td class="num">{{ s.team_b.rubrics[i] }}</td></tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (s.questions?.length) {
        <section>
          <h3 class="h">Questions et réponses ({{ s.questions!.length }})</h3>
          <table class="qa">
            <thead><tr><th>#</th><th>Question</th><th>Réponse</th><th>Répondu par</th></tr></thead>
            <tbody>
              @for (q of s.questions; track $index) {
                <tr>
                  <td class="qn">{{ q.position }}</td>
                  <td>@if (q.rubric) { <span class="qr">{{ q.rubric }}</span> }{{ q.question }}</td>
                  <td><strong>{{ q.answer ?? '—' }}</strong></td>
                  <td class="qw">
                    @for (a of q.answered; track $index) { {{ a.player ?? 'Équipe' }} ({{ a.team === 'a' ? s.team_a.name : s.team_b.name }}, {{ a.points > 0 ? '+' : '' }}{{ a.points }}){{ $last ? '' : ' · ' }} }
                    @if (!q.answered.length) { <span class="muted">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <section>
        <h3 class="h">Déroulé des points ({{ s.events.length }})</h3>
        @if (s.events.length) {
          <ol class="events">
            @for (e of s.events; track $index) {
              <li>
                <span class="t">{{ e.time | date: 'HH:mm' }}</span>
                <span class="ev">{{ e.player ?? 'Équipe' }} · {{ e.team === 'a' ? s.team_a.name : s.team_b.name }}@if (e.rubric) { · {{ e.rubric }} }</span>
                <span class="p" [class.neg]="e.points < 0">{{ e.points > 0 ? '+' : '' }}{{ e.points }}</span>
              </li>
            }
          </ol>
        } @else {
          <p class="muted">Aucun point marqué.</p>
        }
      </section>

      <footer class="foot">
        <div class="sign"><strong>{{ s.manager ?? '' }}</strong><span>Manager / arbitre</span></div>
        <div class="sign"><strong></strong><span>Capitaine {{ s.team_a.name }}</span></div>
        <div class="sign"><strong></strong><span>Capitaine {{ s.team_b.name }}</span></div>
      </footer>
      <p class="gen">Document généré par MatchMe le {{ s.generated_at | date: 'd MMMM y à HH:mm' }} · match nº {{ s.game_id }}</p>
    </article>
  `,
  styles: `
    :host { display: block; }
    .sheet { width: 794px; min-height: 1123px; box-sizing: border-box; padding: 44px 48px; background: #fffdf8; color: #2b2219; font-family: 'DejaVu Sans', system-ui, sans-serif; font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid #c7902b; }
    .brand { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 24px; font-weight: 800; }
    .brand > span > span { font-weight: 500; }
    .brand i { color: #ac6327; font-style: normal; }
    .kicker { margin: 4px 0 0; color: #8a6017; font-family: 'DejaVu Sans Mono', monospace; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .meta { display: grid; justify-items: end; gap: 3px; text-align: right; }
    .meta strong { font-size: 15px; }
    .meta span { color: #6b6558; }
    .score { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; margin: 22px 0; padding: 20px; border-radius: 14px; background: #2b2219; color: #f6f4ee; }
    .side { display: flex; align-items: center; gap: 12px; }
    .side.right { flex-direction: row-reverse; text-align: right; }
    .side-info { display: grid; flex: 1; gap: 2px; min-width: 0; }
    .team { font-size: 15px; }
    .city { color: #bebdb1; font-size: 11px; }
    .winner { justify-self: start; padding: 1px 8px; border-radius: 99px; background: #eac575; color: #2b2219; font-size: 10px; font-weight: 700; }
    .right .winner { justify-self: end; }
    .pts { font-family: 'Liberation Serif', Georgia, serif; font-size: 48px; font-weight: 600; color: #eac575; }
    .right .pts { color: #e39a5f; }
    .dash { color: #bebdb1; font-family: 'DejaVu Sans Mono', monospace; }
    .teams { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    h3 { margin: 0 0 8px; font-size: 13px; }
    .h { margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #dddbd0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 5px 6px; border-bottom: 1px solid #e7e5dc; text-align: left; }
    th { color: #6b6558; font-family: 'DejaVu Sans Mono', monospace; font-size: 9px; text-transform: uppercase; background: #f3f1ea; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .who { display: inline-flex; align-items: center; gap: 6px; }
    .role { color: #6b6558; font-size: 11px; }
    .sub td { color: #6b6558; }
    .total td { border-top: 2px solid #2b2219; font-weight: 700; }
    .subs { margin: 6px 0 0; color: #8a6017; font-size: 11px; }
    .qa td { vertical-align: top; font-size: 11px; }
    .qn { width: 22px; color: #6b6558; font-family: 'DejaVu Sans Mono', monospace; }
    .qr { display: block; color: #8a6017; font-size: 9px; text-transform: uppercase; }
    .qw { width: 34%; color: #4a4339; }
    .events { columns: 2; column-gap: 24px; margin: 0; padding: 0; list-style: none; }
    .events li { display: grid; grid-template-columns: 38px 1fr auto; gap: 6px; padding: 3px 0; border-bottom: 1px dotted #dddbd0; break-inside: avoid; font-size: 11px; }
    .t { color: #6b6558; font-family: 'DejaVu Sans Mono', monospace; }
    .p { font-family: 'DejaVu Sans Mono', monospace; font-weight: 700; color: #8a6017; }
    .p.neg { color: #ac6327; }
    .muted { color: #6b6558; }
    .foot { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 34px; }
    .sign { display: grid; gap: 6px; }
    .sign strong { display: flex; align-items: flex-end; min-height: 40px; padding-bottom: 6px; border-bottom: 1px solid #2b2219; font-size: 13px; }
    .sign span { color: #6b6558; font-size: 10px; }
    .gen { margin: 18px 0 0; color: #a09b8e; font-size: 9px; text-align: center; }
  `,
})
export class ScoreSheet {
  readonly sheet = input.required<ResultSheet>();

  protected subtitle(s: ResultSheet): string {
    // Les matchs de poule portent souvent le nom de la poule comme tour : pas de doublon.
    return [...new Set([s.group, s.round].filter((v): v is string => !!v))].join(' · ') || 'Match';
  }

  protected role(p: SheetTeam['players'][number]): string {
    if (p.role === 'starter') return p.on_field ? 'Titulaire' : 'Titulaire (sorti)';
    return p.on_field ? 'Remplaçant (entré)' : 'Remplaçant';
  }
}
