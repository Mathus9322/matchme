import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, Observable, switchMap, timer } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { Game, GAME_STATUS_LABELS, GamePlayer, GameSide, MAX_SUBSTITUTES, PHASE_LABELS, scaleValues, STARTERS } from '../core/models';
import { Modal } from '../shared/modal';
import { ScoreSheetModal } from '../shared/score-sheet-modal';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-game-live',
  imports: [Icon, RouterLink, DatePipe, Avatar, Modal, ScoreSheetModal],
  template: `
    @if (game(); as g) {
      <div class="page-head">
        <div>
          <p class="eyebrow">
            @if (g.status === 'live') { <span class="live-dot"></span> }
            {{ labels[g.status] }}@if (g.status === 'live' && g.phase) { · <span class="phase">{{ phases[g.phase] }}</span> }
            @if (g.competition) { · <a [routerLink]="['/competitions', g.competition.id]">{{ g.competition.name }}</a> }
            @else { · <a routerLink="/amical">Match amical</a> }
            @if (g.round) { · {{ g.round }} }
          </p>
          <h1 class="page-title">{{ g.team_a.name }} <em>vs</em> {{ g.team_b.name }}</h1>
          @if (g.scheduled_at && g.status === 'scheduled') { <p class="lead">Prévu le {{ g.scheduled_at | date: 'EEEE d MMMM, HH:mm' }}</p> }
          @if (g.manager; as m) {
            <div class="manager">
              <app-avatar [src]="m.avatar_url" [name]="m.name" [size]="44" />
              <span><span class="muted small">{{ g.friendly ? 'Arbitre du match' : 'Manager de la compétition' }}</span><br /><strong>{{ m.name }}</strong></span>
            </div>
          }
        </div>
        @if (g.result_sheet_id) {
          <button class="btn btn-gold" type="button" (click)="sheetOpen.set(g.result_sheet_id)"><app-icon name="file-text" /> Feuille de score</button>
        }
        @if (g.can_manage) {
          <div class="row">
            @if (g.status === 'scheduled') { <button class="btn" type="button" (click)="act(api.startGame(g.id))" [disabled]="busy()"><app-icon name="play" /> Démarrer le match</button> }
            @if (g.status === 'live' && g.phase !== 'halftime') {
              <button class="btn btn-ghost" type="button" (click)="act(api.undo(g.id))" [disabled]="busy() || !g.events?.length"><app-icon name="undo-2" /> Annuler le dernier point</button>
              @if (g.phase === 'first_half') {
                <button class="btn" type="button" (click)="halftime(g)" [disabled]="busy()"><app-icon name="coffee" /> Siffler la mi-temps</button>
              } @else {
                <button class="btn" type="button" (click)="finish(g)" [disabled]="busy()"><app-icon name="square" /> Terminer le match</button>
              }
            }
            @if (g.phase === 'halftime') {
              <button class="btn" type="button" (click)="act(api.secondHalf(g.id))" [disabled]="busy()"><app-icon name="play" /> Lancer la 2e mi-temps</button>
            }
            @if (g.status === 'finished') { <button class="btn btn-ghost" type="button" (click)="act(api.startGame(g.id))" [disabled]="busy()">Rouvrir le match</button> }
          </div>
        }
      </div>

      @if (error()) { <p class="alert" role="alert" style="margin-bottom: 16px">{{ error() }}</p> }

      <section class="scoreboard" [class.is-live]="g.status === 'live'">
        <div class="side side-a" [class.leading]="g.status === 'finished' && g.team_a.score > g.team_b.score">
          <span class="side-team">
            <app-avatar class="logo" [src]="g.team_a.logo_url" [name]="g.team_a.name" [size]="64" shape="square" [label]="'Logo ' + g.team_a.name" />
            <span class="side-name">{{ g.team_a.name }}</span>
          </span>
          <strong>{{ g.team_a.score }}</strong>
        </div>
        <span class="divider">{{ g.status === 'finished' ? 'FIN' : '—' }}</span>
        <div class="side side-b" [class.leading]="g.status === 'finished' && g.team_b.score > g.team_a.score">
          <strong>{{ g.team_b.score }}</strong>
          <span class="side-team">
            <span class="side-name">{{ g.team_b.name }}</span>
            <app-avatar class="logo" [src]="g.team_b.logo_url" [name]="g.team_b.name" [size]="64" shape="square" [label]="'Logo ' + g.team_b.name" />
          </span>
        </div>
      </section>

      @if (g.rubrics?.length) {
        <section class="rubric-bar card">
          <div class="rubric-tabs" role="tablist" aria-label="Rubriques">
            @for (r of g.rubrics; track r.id; let i = $index) {
              <button type="button" role="tab" [class.active]="currentRubric()?.id === r.id" [attr.aria-selected]="currentRubric()?.id === r.id" (click)="rubricId.set(r.id)">
                <span class="tab-num">{{ i + 1 }}</span> {{ r.name }}
              </button>
            }
          </div>
          @if (currentRubric(); as r) {
            <div class="rubric-info">
              <div>
                <p class="eyebrow" style="margin-bottom: 4px">{{ canScore(g) ? 'Rubrique en cours d’arbitrage' : 'Rubrique' }}</p>
                <h2 class="section-title">{{ r.name }}</h2>
                @if (r.description) { <p class="muted small" style="margin: 6px 0 0; line-height: 1.5">{{ r.description }}</p> }
              </div>
              <span class="values">@for (v of values(); track v) { <span class="pt" [class.neg]="v < 0">{{ v > 0 ? '+' : '' }}{{ v }}</span> }</span>
            </div>
          }
        </section>
      }

      @if (g.phase === 'halftime') {
        <p class="alert alert-ok halftime-banner"><app-icon name="coffee" [size]="18" /> <span><strong>Mi-temps.</strong> Les points sont suspendus. Chaque équipe peut faire entrer ses remplaçants à la place des joueurs sur le terrain.</span></p>
      }

      <div class="score-grid">
        @for (side of [g.team_a, g.team_b]; track side.id; let b = $odd) {
          <article class="card team-card" [class.team-b]="b">
            <header class="card-head">
              <div class="row" style="flex-wrap: nowrap; min-width: 0">
                <app-avatar [src]="side.logo_url" [name]="side.name" [size]="40" shape="square" [label]="'Logo ' + side.name" />
                <div style="min-width: 0"><span class="team-index">{{ b ? 'B' : 'A' }}</span> <h2 class="section-title card-title">{{ side.name }}</h2></div>
              </div>
              <strong class="team-total">{{ side.score }}</strong>
            </header>
            @if (g.status === 'scheduled' && side.can_manage_team) {
              <button class="btn btn-ghost btn-sm lineup-btn" type="button" (click)="openLineup(side)"><app-icon name="users" [size]="14" /> Composer la feuille de match</button>
            }
            @if (canReorder(g, side) && !canSubstitute(g, side)) {
              <p class="sub-hint"><app-icon name="arrow-left-right" [size]="13" /> Glissez un joueur sur un autre pour échanger leurs places.</p>
            }
            @if (canSubstitute(g, side)) {
              <p class="sub-hint"><app-icon name="arrow-left-right" [size]="13" /> Glissez un remplaçant sur le joueur qui sort (ou sélectionnez-les puis « Remplacer »). Glissez deux joueurs du même groupe pour échanger leurs places.</p>
            }
            <p class="list-title">Sur le terrain</p>
            @for (player of onField(side); track player.id; let i = $index) {
              <div class="player-row" [class.pickable]="canSubstitute(g, side)" [class.picked-out]="isPicked(side, 'out', player.id)"
                [attr.role]="canSubstitute(g, side) ? 'button' : null" [attr.tabindex]="canSubstitute(g, side) ? 0 : null"
                [attr.aria-pressed]="canSubstitute(g, side) ? isPicked(side, 'out', player.id) : null"
                (click)="canSubstitute(g, side) && pick(side, 'out', player.id)" (keydown.enter)="canSubstitute(g, side) && pick(side, 'out', player.id)"
                [attr.draggable]="canReorder(g, side) || null" [class.dragging]="isDragged(player.id)" [class.drop-target]="isDropTarget(g, side, 'out', player.id)"
                (dragstart)="dragStart($event, side, 'out', player.id)" (dragend)="dragEnd()"
                (dragover)="dragOver($event, g, side, 'out', player.id)" (dragleave)="dropHover.set(null)" (drop)="drop($event, g, side, 'out', player.id)">
                <span class="player-name">
                  <app-avatar [src]="player.photo_url" [name]="player.name" [size]="34" />
                  <span class="player-label"><span class="muted small">{{ (i + 1).toString().padStart(2, '0') }}</span> {{ player.name }}</span>
                </span>
                <strong class="player-score">{{ player.score }}</strong>
                @if (canScore(g)) {
                  <div class="controls">
                    @for (p of values(); track p) {
                      <button type="button" [class.neg]="p < 0" (click)="score(g, side, player.id, p)" [disabled]="busy()" [attr.aria-label]="(p > 0 ? 'Ajouter ' : 'Retirer ') + abs(p) + ' points à ' + player.name">{{ p > 0 ? '+' : '' }}{{ p }}</button>
                    }
                  </div>
                }
              </div>
            }
            <p class="list-title">Banc{{ bench(side).length ? '' : ' · aucun remplaçant' }}</p>
            @for (player of bench(side); track player.id) {
              <div class="bench-row" [class.pickable]="canSubstitute(g, side)" [class.picked-in]="isPicked(side, 'in', player.id)"
                [attr.role]="canSubstitute(g, side) ? 'button' : null" [attr.tabindex]="canSubstitute(g, side) ? 0 : null"
                [attr.aria-pressed]="canSubstitute(g, side) ? isPicked(side, 'in', player.id) : null"
                (click)="canSubstitute(g, side) && pick(side, 'in', player.id)" (keydown.enter)="canSubstitute(g, side) && pick(side, 'in', player.id)"
                [attr.draggable]="canReorder(g, side) || null" [class.dragging]="isDragged(player.id)" [class.drop-target]="isDropTarget(g, side, 'in', player.id)"
                (dragstart)="dragStart($event, side, 'in', player.id)" (dragend)="dragEnd()"
                (dragover)="dragOver($event, g, side, 'in', player.id)" (dragleave)="dropHover.set(null)" (drop)="drop($event, g, side, 'in', player.id)">
                <app-avatar [src]="player.photo_url" [name]="player.name" [size]="28" />
                <span class="player-label">{{ player.name }}@if (player.role === 'starter') { <span class="muted small"> · remplacé</span> }</span>
                @if (player.score) { <span class="muted small">{{ player.score }} pts</span> }
              </div>
            }
            @if (canSubstitute(g, side) && bench(side).length) {
              @let pickFor = subPick()?.teamId === side.id ? subPick() : null;
              <div class="sub-bar">
                <span class="small">
                  <span class="tag out">Sort</span> {{ playerName(side, pickFor?.outId) ?? '—' }}
                  <app-icon name="arrow-right" [size]="13" />
                  <span class="tag in">Entre</span> {{ playerName(side, pickFor?.inId) ?? '—' }}
                </span>
                <span class="row" style="gap: 6px">
                  @if (pickFor) { <button class="btn btn-ghost btn-sm" type="button" (click)="subPick.set(null)">Annuler</button> }
                  <button class="btn btn-sm" type="button" (click)="confirmSubstitution(g, side)" [disabled]="busy() || !pickFor?.outId || !pickFor?.inId">
                    <app-icon name="arrow-left-right" [size]="14" /> Remplacer
                  </button>
                </span>
              </div>
            }
            @for (sub of subsFor(g, side); track sub.id) {
              <p class="sub-line"><app-icon name="arrow-left-right" [size]="13" /> {{ sub.player_in }} remplace {{ sub.player_out }}</p>
            }
            <footer class="player-row team-row">
              <span class="player-name">Points d’équipe</span>
              <strong class="player-score">{{ side.bonus }}</strong>
              @if (canScore(g)) {
                <div class="controls">
                  @for (p of values(); track p) {
                    <button type="button" [class.neg]="p < 0" (click)="score(g, side, null, p)" [disabled]="busy()" [attr.aria-label]="(p > 0 ? 'Ajouter ' : 'Retirer ') + abs(p) + ' points à ' + side.name">{{ p > 0 ? '+' : '' }}{{ p }}</button>
                  }
                </div>
              }
            </footer>
          </article>
        }
      </div>

      <section class="section">
        @if (g.rubrics?.length) {
          <h2 class="section-title" style="margin-bottom: 12px">Score par rubrique</h2>
          <div class="table-wrap" style="margin-bottom: 28px">
            <table>
              <thead><tr><th>Rubrique</th><th class="num">{{ g.team_a.name }}</th><th class="num">{{ g.team_b.name }}</th></tr></thead>
              <tbody>
                @for (r of g.rubrics; track r.id) {
                  <tr [class.current]="currentRubric()?.id === r.id">
                    <td>{{ r.name }}</td>
                    <td class="num">{{ rubricScore(g.team_a, r.id) }}</td>
                    <td class="num">{{ rubricScore(g.team_b, r.id) }}</td>
                  </tr>
                }
                <tr class="total"><td>Total</td><td class="num">{{ g.team_a.score }}</td><td class="num">{{ g.team_b.score }}</td></tr>
              </tbody>
            </table>
          </div>
        }
        <h2 class="section-title" style="margin-bottom: 12px">Fil du match</h2>
        <ul class="feed card">
          @for (e of g.events; track e.id) {
            <li>
              <span class="muted small">{{ e.created_at | date: 'HH:mm:ss' }}</span>
              <span>{{ e.player ?? 'Équipe' }} · <strong>{{ e.team_id === g.team_a.id ? g.team_a.name : g.team_b.name }}</strong>@if (e.rubric) { <span class="muted small"> · {{ e.rubric }}</span> }</span>
              <span class="pts" [class.neg]="e.points < 0">{{ e.points > 0 ? '+' : '' }}{{ e.points }}</span>
            </li>
          } @empty {
            <li class="muted small">Aucun point marqué pour l’instant.</li>
          }
        </ul>
      </section>
      @if (lineupSide(); as side) {
        <app-modal [open]="true" title="Feuille de match" [eyebrow]="side.name" (closed)="lineupSide.set(null)">
          <p class="muted small" style="margin: 0 0 12px">Choisissez <strong>4 titulaires</strong> et jusqu’à <strong>2 remplaçants</strong>. Les remplaçants ne peuvent entrer qu’à la mi-temps.</p>
          <ul class="lineup">
            @for (p of side.roster; track p.id) {
              <li>
                <app-avatar [src]="p.photo_url" [name]="p.name" [size]="32" />
                <span class="player-label">{{ p.name }}</span>
                <div class="role-switch" role="radiogroup" [attr.aria-label]="'Rôle de ' + p.name">
                  @for (r of roleOptions; track r.id) {
                    <button type="button" [class.active]="lineupRoles()[p.id!] === r.id" (click)="setRole(p.id!, r.id)">{{ r.label }}</button>
                  }
                </div>
              </li>
            }
          </ul>
          <p class="small counts" [class.ok]="lineupCount('starter') === starters && lineupCount('substitute') <= maxSubs">
            {{ lineupCount('starter') }}/{{ starters }} titulaires · {{ lineupCount('substitute') }}/{{ maxSubs }} remplaçants
          </p>
          @if (lineupError()) { <p class="alert" role="alert">{{ lineupError() }}</p> }
          <div class="form-actions">
            <button class="btn btn-ghost" type="button" (click)="lineupSide.set(null)">Annuler</button>
            <button class="btn" type="button" (click)="saveLineup(g)" [disabled]="busy() || lineupCount('starter') !== starters || lineupCount('substitute') > maxSubs">Enregistrer la feuille</button>
          </div>
        </app-modal>
      }
      <app-score-sheet-modal [sheetId]="sheetOpen()" (closed)="sheetOpen.set(null)" />
    } @else if (notFound()) {
      <p class="empty">Match introuvable.</p>
    }
  `,
  styles: `
    .scoreboard { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; margin-bottom: 20px; padding: 26px 30px; border-radius: 14px; background: var(--ink); color: var(--paper); }
    .scoreboard.is-live { box-shadow: inset 0 -4px 0 var(--rust); }
    .side { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-width: 0; }
    .side-name { overflow: hidden; font-size: 16px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .side-team { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .side-team .logo { box-shadow: 0 0 0 3px rgba(240, 205, 135, .35); }
    .manager { display: inline-flex; align-items: center; gap: 12px; margin-top: 14px; padding: 8px 16px 8px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 13px; line-height: 1.3; }
    .card-title { display: inline; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .side strong { font-family: var(--display); font-size: clamp(44px, 8vw, 72px); line-height: 1; font-variant-numeric: tabular-nums; }
    .side-a strong { color: var(--gold); }
    .side-b strong { color: #e39a5f; }
    .side.leading .side-name { color: var(--gold-light); }
    .divider { color: var(--sand); font-family: var(--mono); font-size: 12px; }
    .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
    .team-index { width: 26px; height: 26px; display: inline-grid; place-items: center; border-radius: 50%; background: var(--ochre); color: var(--ink); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .team-b .team-index { background: var(--rust); color: white; }
    .team-total { color: var(--ochre-ink); font-family: var(--display); font-size: 32px; }
    .team-b .team-total { color: var(--rust); }
    .player-row { display: grid; grid-template-columns: minmax(80px, 1fr) 44px auto; align-items: center; gap: 10px; min-height: 56px; border-bottom: 1px solid var(--line); }
    .team-row { border-bottom: 0; background: rgba(240, 205, 135, .18); margin: 0 -20px -20px; padding: 0 20px; border-radius: 0 0 10px 10px; }
    .player-name { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; font-weight: 600; }
    .player-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .player-score { font-family: var(--mono); font-size: 15px; text-align: center; }
    .controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 170px; }
    .controls button { min-width: 38px; }
    .phase { padding: 1px 8px; border-radius: 999px; background: var(--gold); color: var(--ink); }
    .halftime-banner { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .list-title { margin: 14px 0 2px; color: var(--muted); font-family: var(--mono); font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .lineup-btn { margin-top: 12px; }
    .bench-row { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 4px 0; border-bottom: 1px dashed var(--line); font-size: 12px; opacity: .85; }
    .bench-row .player-label { flex: 1; }
    .pickable { cursor: pointer; border-radius: 8px; transition: background .12s ease, box-shadow .12s ease; }
    .pickable:hover { background: rgba(240, 205, 135, .2); }
    .pickable:focus-visible { outline: 2px solid var(--ochre); outline-offset: 1px; }
    [draggable='true'] { cursor: grab; }
    .dragging { opacity: .45; }
    .drop-target { background: rgba(240, 205, 135, .55) !important; box-shadow: inset 0 0 0 2px var(--ochre); }
    .picked-out { background: rgba(172, 99, 39, .12) !important; box-shadow: inset 3px 0 0 var(--rust); }
    .picked-in { background: rgba(240, 205, 135, .45) !important; box-shadow: inset 3px 0 0 var(--ochre); opacity: 1; }
    .sub-hint { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(240, 205, 135, .3); font-size: 12px; }
    .sub-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
    .sub-bar .small { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; font-weight: 600; }
    .tag { padding: 1px 7px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; }
    .tag.out { background: rgba(172, 99, 39, .15); color: var(--rust); }
    .tag.in { background: var(--gold); color: var(--ink); }
    .sub-line { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; color: var(--ochre-ink); font-size: 12px; }
    .lineup { display: grid; gap: 6px; max-height: 50dvh; margin: 0 0 10px; padding: 0; overflow-y: auto; list-style: none; }
    .lineup li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; }
    .lineup .player-label { flex: 1; font-size: 13px; font-weight: 600; }
    .role-switch { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); }
    .role-switch button { padding: 5px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 11px; font-weight: 600; cursor: pointer; }
    .role-switch button.active { background: var(--gold); color: var(--ink); }
    .counts { margin: 0 0 10px; color: var(--danger); font-weight: 600; }
    .counts.ok { color: var(--ochre-ink); }
    .rubric-bar { margin-bottom: 16px; padding: 0; overflow: hidden; }
    .rubric-tabs { display: flex; gap: 2px; overflow-x: auto; padding: 6px; background: var(--ink); }
    .rubric-tabs button { display: inline-flex; flex: none; align-items: center; gap: 8px; padding: 8px 12px; border: 0; border-radius: 7px; background: transparent; color: rgba(246, 244, 238, .75); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .rubric-tabs button:hover { color: var(--paper); background: rgba(240, 205, 135, .12); }
    .rubric-tabs button.active { background: var(--gold); color: var(--ink); }
    .tab-num { width: 20px; height: 20px; display: inline-grid; place-items: center; border-radius: 50%; background: rgba(240, 205, 135, .2); font-family: var(--mono); font-size: 10px; }
    .rubric-tabs button.active .tab-num { background: var(--ink); color: var(--gold-light); }
    .rubric-info { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 14px; padding: 16px 20px; }
    .rubric-info > div { flex: 1; min-width: 220px; }
    .values { display: inline-flex; flex-wrap: wrap; gap: 4px; }
    .pt { padding: 3px 9px; border-radius: 6px; background: rgba(240, 205, 135, .55); font-family: var(--mono); font-size: 11px; font-weight: 700; }
    .pt.neg { background: rgba(172, 99, 39, .12); color: var(--rust); }
    tr.current td { background: rgba(240, 205, 135, .25); font-weight: 700; }
    tr.total td { font-weight: 700; border-top: 2px solid var(--line); }
    .controls button { height: 26px; padding: 0; border: 1px solid rgba(199, 144, 43, .45); border-radius: 5px; background: rgba(240, 205, 135, .35); color: var(--ochre-ink); font-family: var(--mono); font-size: 10px; font-weight: 700; cursor: pointer; }
    .controls button:hover:not(:disabled) { background: var(--ochre); color: var(--ink); }
    .controls button.neg { border-color: rgba(172, 99, 39, .3); background: rgba(172, 99, 39, .08); color: var(--rust); }
    .controls button.neg:hover:not(:disabled) { background: var(--rust); color: white; }
    .feed { margin: 0; padding: 4px 20px; list-style: none; max-height: 360px; overflow-y: auto; }
    .feed li { display: grid; grid-template-columns: 70px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
    .feed li:last-child { border-bottom: 0; }
    .pts { font-family: var(--mono); font-weight: 700; color: var(--ochre-ink); }
    .pts.neg { color: var(--rust); }
    @media (max-width: 820px) {
      .score-grid { grid-template-columns: 1fr; }
      .scoreboard { padding: 18px; gap: 10px; }
      .side { flex-direction: column-reverse; align-items: center; text-align: center; }
      .side-b { flex-direction: column; }
      .side-name { max-width: 100%; font-size: 13px; }
      .side-team { flex-direction: column; gap: 8px; }
      .side-b .side-team { flex-direction: column-reverse; }
    }
    @media (max-width: 460px) {
      .player-row { grid-template-columns: 1fr 36px; padding-bottom: 8px; }
      .controls { grid-column: 1 / -1; justify-content: flex-start; max-width: none; }
    }
  `,
})
export class GameLivePage implements OnInit {
  protected readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly id = input.required<string>();
  protected readonly labels = GAME_STATUS_LABELS;
  protected readonly phases = PHASE_LABELS;
  protected readonly sheetOpen = signal<number | null>(null);
  /** Rubrique choisie par l'utilisateur ; à défaut, la première du programme. */
  protected readonly rubricId = signal<number | null>(null);
  protected readonly currentRubric = computed(() => {
    const rubrics = this.game()?.rubrics ?? [];
    return rubrics.find((r) => r.id === this.rubricId()) ?? rubrics[0] ?? null;
  });
  /** Boutons de points : barème de la rubrique en cours, sinon barème par défaut. */
  protected readonly values = computed(() => {
    const scale = this.currentRubric() ?? this.game()?.scoring ?? { points: [10, 20, 30, 40], penalties: true };
    return scaleValues(scale);
  });
  protected readonly game = signal<Game | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly abs = Math.abs;

  ngOnInit(): void {
    // Rafraîchissement toutes les 3 s pour les spectateurs (le score se met à jour en direct).
    timer(0, 3000)
      .pipe(
        switchMap(() =>
          this.api.game(+this.id()).pipe(
            catchError((e) => {
              if (e.status === 404) {
                this.notFound.set(true);
              }
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((game) => {
        if (!this.busy()) {
          this.game.set(game);
        }
      });
  }

  protected rubricScore(side: GameSide, rubricId: number): number {
    const scores = side.rubric_scores;
    return scores && !Array.isArray(scores) ? (scores[rubricId] ?? 0) : 0;
  }

  protected canScore(game: Game): boolean {
    return !!game.can_manage && game.status === 'live' && game.phase !== 'halftime';
  }

  protected onField(side: GameSide): GamePlayer[] {
    return (side.players ?? []).filter((p) => p.on_field);
  }

  protected bench(side: GameSide): GamePlayer[] {
    return (side.players ?? []).filter((p) => !p.on_field);
  }

  protected subsFor(game: Game, side: GameSide) {
    return (game.substitutions ?? []).filter((s) => s.team_id === side.id);
  }

  protected halftime(game: Game): void {
    if (confirm('Siffler la mi-temps ? Les points seront suspendus et les remplacements possibles.')) {
      this.act(this.api.halftime(game.id));
    }
  }

  // Remplacements à la mi-temps : sélection du sortant et de l'entrant, puis « Remplacer ».
  protected readonly subPick = signal<{ teamId: number; outId: number | null; inId: number | null } | null>(null);

  protected canSubstitute(game: Game, side: GameSide): boolean {
    return game.phase === 'halftime' && !!side.can_manage_team;
  }

  protected pick(side: GameSide, slot: 'out' | 'in', playerId: number): void {
    this.subPick.update((current) => {
      const base = current?.teamId === side.id ? current : { teamId: side.id, outId: null, inId: null };
      const key = slot === 'out' ? 'outId' : 'inId';
      return { ...base, [key]: base[key] === playerId ? null : playerId };
    });
  }

  protected isPicked(side: GameSide, slot: 'out' | 'in', playerId: number): boolean {
    const pick = this.subPick();
    return pick?.teamId === side.id && (slot === 'out' ? pick.outId : pick.inId) === playerId;
  }

  protected playerName(side: GameSide, playerId: number | null | undefined): string | null {
    return side.players?.find((p) => p.id === playerId)?.name ?? null;
  }

  /**
   * Glisser-déposer : sur un joueur du même groupe, les deux échangent leurs places ;
   * entre le terrain et le banc (pendant la mi-temps), c'est un remplacement.
   */
  protected readonly dragged = signal<{ teamId: number; slot: 'out' | 'in'; playerId: number } | null>(null);
  protected readonly dropHover = signal<number | null>(null);

  protected canReorder(game: Game, side: GameSide): boolean {
    return !!side.can_manage_team && game.status !== 'finished';
  }

  protected dragStart(event: DragEvent, side: GameSide, slot: 'out' | 'in', playerId: number): void {
    this.dragged.set({ teamId: side.id, slot, playerId });
    event.dataTransfer?.setData('text/plain', String(playerId));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected dragEnd(): void {
    this.dragged.set(null);
    this.dropHover.set(null);
  }

  protected isDragged(playerId: number): boolean {
    return this.dragged()?.playerId === playerId;
  }

  private accepts(game: Game, side: GameSide, slot: 'out' | 'in', playerId: number): boolean {
    const drag = this.dragged();
    if (!drag || drag.teamId !== side.id || drag.playerId === playerId) return false;
    return drag.slot === slot || this.canSubstitute(game, side);
  }

  protected isDropTarget(game: Game, side: GameSide, slot: 'out' | 'in', playerId: number): boolean {
    return this.dropHover() === playerId && this.accepts(game, side, slot, playerId);
  }

  protected dragOver(event: DragEvent, game: Game, side: GameSide, slot: 'out' | 'in', playerId: number): void {
    if (this.accepts(game, side, slot, playerId)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      this.dropHover.set(playerId);
    }
  }

  protected drop(event: DragEvent, game: Game, side: GameSide, slot: 'out' | 'in', playerId: number): void {
    const drag = this.dragged();
    const valid = this.accepts(game, side, slot, playerId);
    this.dragEnd();
    if (!drag || !valid) return;
    event.preventDefault();
    this.subPick.set(null);
    if (drag.slot === slot) {
      this.act(this.api.swapPlayers(game.id, side.id, drag.playerId, playerId));
    } else {
      const [outId, inId] = slot === 'out' ? [playerId, drag.playerId] : [drag.playerId, playerId];
      this.act(this.api.substitute(game.id, side.id, outId, inId));
    }
  }

  protected confirmSubstitution(game: Game, side: GameSide): void {
    const pick = this.subPick();
    if (pick?.teamId !== side.id || !pick.outId || !pick.inId) return;
    this.subPick.set(null);
    this.act(this.api.substitute(game.id, side.id, pick.outId, pick.inId));
  }

  // Feuille de match
  protected readonly starters = STARTERS;
  protected readonly maxSubs = MAX_SUBSTITUTES;
  protected readonly roleOptions = [
    { id: 'starter' as const, label: 'Titulaire' },
    { id: 'substitute' as const, label: 'Remplaçant' },
    { id: 'out' as const, label: 'Non retenu' },
  ];
  protected readonly lineupSide = signal<GameSide | null>(null);
  protected readonly lineupRoles = signal<Record<number, 'starter' | 'substitute' | 'out'>>({});
  protected readonly lineupError = signal('');

  protected openLineup(side: GameSide): void {
    const roles: Record<number, 'starter' | 'substitute' | 'out'> = {};
    for (const p of side.roster ?? []) {
      roles[p.id!] = side.players?.find((x) => x.id === p.id)?.role ?? 'out';
    }
    this.lineupRoles.set(roles);
    this.lineupError.set('');
    this.lineupSide.set(side);
  }

  protected setRole(playerId: number, role: 'starter' | 'substitute' | 'out'): void {
    this.lineupRoles.update((roles) => ({ ...roles, [playerId]: role }));
  }

  protected lineupCount(role: 'starter' | 'substitute'): number {
    return Object.values(this.lineupRoles()).filter((r) => r === role).length;
  }

  protected saveLineup(game: Game): void {
    const side = this.lineupSide();
    if (!side) return;
    const ids = (role: string) => Object.entries(this.lineupRoles()).filter(([, r]) => r === role).map(([id]) => Number(id));
    this.busy.set(true);
    this.api.saveLineup(game.id, side.id, ids('starter'), ids('substitute')).subscribe({
      next: (updated) => {
        this.game.set(updated);
        this.busy.set(false);
        this.lineupSide.set(null);
      },
      error: (e) => {
        this.busy.set(false);
        this.lineupError.set(errorMessage(e));
      },
    });
  }

  protected score(game: Game, side: GameSide, playerId: number | null, points: number): void {
    this.act(this.api.score(game.id, side.id, playerId, points, this.currentRubric()?.id ?? null));
  }

  protected finish(game: Game): void {
    if (confirm(`Terminer le match sur le score de ${game.team_a.score} – ${game.team_b.score} ?`)) {
      this.act(this.api.finishGame(game.id));
    }
  }

  protected act(request: Observable<Game>): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (game) => {
        this.game.set(game);
        this.busy.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
