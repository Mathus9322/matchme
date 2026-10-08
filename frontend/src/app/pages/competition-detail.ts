import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { fromLocalInput } from '../core/dates';
import { Competition, COMPETITION_STATUS_LABELS, FORMAT_LABELS, GroupStanding, Standing, Team } from '../core/models';
import { CompetitionEditModal } from '../shared/competition-edit-modal';
import { CompetitionGroups } from '../shared/competition-groups';
import { CompetitionRubrics } from '../shared/competition-rubrics';
import { LeagueSchedule } from '../shared/league-schedule';
import { Avatar } from '../shared/avatar';
import { Modal } from '../shared/modal';
import { TeamPickerModal } from '../shared/team-picker-modal';
import { GameRow } from '../shared/game-row';
import { Icon } from '../shared/icon';

const TABS = ['infos', 'equipes', 'matchs', 'resultats', 'classement', 'organisation', 'rubriques'] as const;
type Tab = (typeof TABS)[number];

@Component({
  selector: 'app-competition-detail',
  imports: [Icon, FormsModule, RouterLink, DatePipe, NgTemplateOutlet, Modal, Avatar, GameRow, CompetitionGroups, CompetitionEditModal, TeamPickerModal, CompetitionRubrics, LeagueSchedule],
  template: `
    @if (competition(); as c) {
      <div class="page-head">
        <div>
          <p class="eyebrow">
            <span [class]="'badge badge-' + c.status">{{ labels[c.status] }}</span>
            <span class="badge"><app-icon [name]="c.format === 'league' ? 'trophy' : 'layout-grid'" [size]="12" /> {{ formatLabels[c.format] }}</span>
            @if (liveGames().length) { <span class="badge badge-live"><span class="live-dot" style="background: white"></span> {{ liveGames().length }} en direct</span> }
          </p>
          <h1 class="page-title">{{ c.name }}</h1>
          @if (c.owner; as o) {
            <p class="row muted small" style="margin-top: 10px"><app-avatar [src]="o.avatar_url" [name]="o.name" [size]="28" /> Organisée par <strong style="color: var(--ink)">{{ o.name }}</strong></p>
          }
        </div>
        @if (auth.isLoggedIn() || c.can_manage) {
          <div class="row">
            @if (auth.isLoggedIn()) {
              <a class="btn btn-gold" [routerLink]="['/competitions', c.id, 'documents']"><app-icon name="folder" /> {{ c.can_manage ? 'Dossiers documents' : 'Mon dossier documents' }}</a>
            }
            @if (c.can_manage) {
              @if (c.status === 'draft' || c.status === 'open') {
                <button class="btn" type="button" (click)="openLifecycle('publish')"><app-icon name="rocket" /> Publier la compétition</button>
              } @else if (c.status === 'ongoing') {
                <button class="btn" type="button" (click)="openLifecycle('finish')"><app-icon name="flag" /> Terminer la compétition</button>
              } @else {
                <button class="btn btn-ghost" type="button" (click)="reopen()" [disabled]="busy()"><app-icon name="rotate-ccw" /> Rouvrir</button>
              }
              <button class="btn btn-ghost" type="button" (click)="editing.set(true)"><app-icon name="pencil" /> Modifier</button>
              <button class="btn btn-danger" type="button" (click)="remove()">Supprimer</button>
            }
          </div>
        }
      </div>

      <nav class="ctabs" role="tablist" aria-label="Sections de la compétition">
        @for (t of tabs(); track t.id) {
          <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="selectTab(t.id)">
            {{ t.label }} @if (t.count !== undefined) { <span class="count">{{ t.count }}</span> }
          </button>
        }
      </nav>

      @if (error()) { <p class="alert" role="alert" style="margin-bottom: 16px">{{ error() }}</p> }
      @if (notice()) { <p class="alert alert-ok" role="status" style="margin-bottom: 16px">{{ notice() }}</p> }

      @if (c.status === 'finished') {
        <section class="champion">
          <span class="trophy"><app-icon name="trophy" [size]="44" [stroke]="1.6" /></span>
          <div>
            <p class="eyebrow" style="margin: 0 0 4px; color: var(--gold)">Compétition terminée{{ c.ends_on ? ' le ' + (c.ends_on | date: 'd MMMM y') : '' }}</p>
            @if (standings()[0]?.played) {
              <h2>{{ standings()[0].team.name }} <em>championne</em></h2>
              <p class="small" style="margin: 4px 0 0; opacity: .8">{{ standings()[0].points }} pts · {{ standings()[0].won }} victoire(s) · {{ standings()[0].points_for }} points marqués</p>
            } @else {
              <h2>Aucun match joué</h2>
            }
          </div>
          <button type="button" class="btn btn-outline-light" (click)="selectTab('classement')">Voir le classement</button>
        </section>
      } @else if (c.status === 'draft' && c.can_manage) {
        <p class="alert alert-ok row" style="margin-bottom: 16px; flex-wrap: nowrap"><app-icon name="pencil-line" [size]="18" /> <span>Brouillon : préparez les équipes, le format et les rubriques, puis cliquez sur « Publier la compétition » pour la lancer.</span></p>
      }

      <div class="tab-panel" role="tabpanel">
        @switch (tab()) {
          @case ('infos') {
            <div class="two-cols">
              <section class="card">
                <h2 class="section-title" style="margin-bottom: 10px">À propos de la compétition</h2>
                <p class="desc">{{ c.description || 'Aucune description.' }}</p>
                <dl class="facts">
                  <div><dt>Statut</dt><dd>{{ labels[c.status] }}</dd></div>
                  <div><dt>Format</dt><dd>{{ formatLabels[c.format] }}</dd></div>
                  <div><dt>Début</dt><dd>{{ c.starts_on ? (c.starts_on | date: 'd MMMM y') : '—' }}</dd></div>
                  <div><dt>Fin</dt><dd>{{ c.ends_on ? (c.ends_on | date: 'd MMMM y') : '—' }}</dd></div>
                  <div><dt>Organisateur</dt><dd>{{ c.owner?.name }}</dd></div>
                  <div><dt>Rubriques</dt><dd>{{ c.rubrics?.length || 'Barème unique' }}</dd></div>
                </dl>
              </section>
              <div class="stack">
                <div class="mini-stats">
                  <button type="button" class="stat" (click)="selectTab('equipes')"><strong>{{ c.teams?.length ?? 0 }}</strong><span>Équipes</span></button>
                  <button type="button" class="stat" (click)="selectTab('matchs')"><strong>{{ upcoming().length }}</strong><span>À jouer</span></button>
                  <button type="button" class="stat" (click)="selectTab('resultats')"><strong>{{ results().length }}</strong><span>Joués</span></button>
                </div>
                @if (liveGames().length) {
                  <section>
                    <h3 class="sub">En direct</h3>
                    <div class="stack">@for (g of liveGames(); track g.id) { <app-game-row [game]="g" /> }</div>
                  </section>
                } @else if (nextGame(); as g) {
                  <section>
                    <h3 class="sub">Prochain match</h3>
                    <app-game-row [game]="g" />
                  </section>
                }
                @if (standings()[0]?.played) {
                  <button type="button" class="card leader" (click)="selectTab('classement')">
                    <span class="leader-icon"><app-icon name="star" [size]="18" /></span>
                    <span><span class="muted small">En tête{{ c.format === 'league' ? ' du championnat' : ' du classement général' }}</span><br /><strong>{{ standings()[0].team.name }}</strong> · {{ standings()[0].points }} pts</span>
                  </button>
                }
              </div>
            </div>
          }

          @case ('equipes') {
            <div class="row" style="justify-content: space-between; margin-bottom: 16px">
              <p class="muted small" style="margin: 0">
                @if (c.status === 'open') { Inscriptions ouvertes : les capitaines peuvent inscrire leur équipe. } @else { {{ c.teams?.length ?? 0 }} équipe(s) inscrite(s). }
              </p>
              @if (registrableTeams().length) {
                <button class="btn btn-gold" type="button" (click)="picking.set(true)">+ Inscrire des équipes <span class="badge">{{ registrableTeams().length }} disponibles</span></button>
              } @else if (!auth.isLoggedIn() && c.status === 'open') {
                <a class="small" routerLink="/connexion">Connectez-vous pour inscrire votre équipe</a>
              }
            </div>
            <div class="grid">
              @for (t of c.teams; track t.id) {
                <article class="card team-card">
                  <div class="row" style="flex-wrap: nowrap">
                    <app-avatar [src]="t.logo_url" [name]="t.name" [size]="44" shape="square" />
                    <h3 style="flex: 1; min-width: 0">{{ t.name }}</h3>
                    @if (groupName(c, t.group_id ?? null); as name) { <span class="badge">{{ name }}</span> }
                  </div>
                  <p class="meta">{{ t.players_count }} joueurs{{ t.city ? ' · ' + t.city : '' }}</p>
                  @if (c.can_manage || t.can_manage) {
                    <div class="row" style="margin-top: 12px">
                      @if (c.can_manage && c.format !== 'league' && c.groups?.length) {
                        <select class="input group-select" [ngModel]="t.group_id ?? null" (ngModelChange)="assign(t, $event)" [name]="'group-' + t.id" [attr.aria-label]="'Poule de ' + t.name">
                          <option [ngValue]="null">Sans poule</option>
                          @for (g of c.groups; track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
                        </select>
                      }
                      <button class="btn btn-danger btn-sm" type="button" (click)="detach(t)" [attr.aria-label]="'Retirer ' + t.name">Retirer</button>
                    </div>
                  }
                </article>
              } @empty {
                <p class="empty" style="grid-column: 1 / -1">Aucune équipe inscrite pour l’instant.</p>
              }
            </div>
          }

          @case ('matchs') {
            <ng-container *ngTemplateOutlet="filters; context: { $implicit: c }" />
            @if (c.can_manage && c.status !== 'finished') {
              <div class="row" style="justify-content: flex-end; margin-bottom: 12px">
                <button class="btn" type="button" (click)="openGameForm()" [disabled]="(c.teams?.length ?? 0) < 2" [title]="(c.teams?.length ?? 0) < 2 ? 'Inscrivez au moins deux équipes' : ''">+ Programmer un match</button>
              </div>
            }
            <div class="stack">
              @for (game of upcoming(); track game.id) {
                <app-game-row [game]="game" />
              } @empty {
                <p class="empty">Aucun match à venir{{ isFiltered() ? ' dans cette sélection' : '' }}.</p>
              }
            </div>
          }

          @case ('resultats') {
            <ng-container *ngTemplateOutlet="filters; context: { $implicit: c }" />
            <div class="stack">
              @for (game of results(); track game.id) {
                <app-game-row [game]="game" />
              } @empty {
                <p class="empty">Aucun résultat{{ isFiltered() ? ' dans cette sélection' : '' }} pour le moment.</p>
              }
            </div>
          }

          @case ('classement') {
            <h2 class="section-title" style="margin-bottom: 14px">{{ c.format === 'league' ? 'Classement du championnat' : 'Classement général' }}</h2>
            <ng-container *ngTemplateOutlet="table; context: { $implicit: standings(), full: true }" />
            @if (c.format !== 'league' && groupStandings().length) {
              <div class="group-tables">
                @for (g of groupStandings(); track g.id) {
                  <section>
                    <h3 class="sub">{{ g.name }}</h3>
                    <ng-container *ngTemplateOutlet="table; context: { $implicit: g.standings, full: false }" />
                  </section>
                }
              </div>
            }
            <p class="muted small" style="margin-top: 10px">Victoire 3 pts · nul 1 pt · départage à la différence puis aux points marqués.</p>
          }

          @case ('organisation') {
            @if (c.format === 'league') {
              <app-league-schedule [competition]="c" (changed)="load()" />
            } @else {
              <app-competition-groups [competition]="c" [groups]="groupStandings()" (changed)="load()" />
            }
          }

          @case ('rubriques') {
            <app-competition-rubrics [competition]="c" (changed)="load()" />
          }
        }
      </div>

      <ng-template #filters let-c>
        @if (c.format === 'league' && rounds().length > 1) {
          <label class="row small" style="margin-bottom: 12px">
            <span class="muted">Journée</span>
            <select class="input" style="max-width: 220px" [ngModel]="roundFilter()" (ngModelChange)="roundFilter.set($event)" name="round-filter">
              <option value="">Toutes les journées</option>
              @for (r of rounds(); track r) { <option [value]="r">{{ r }}</option> }
            </select>
          </label>
        }
        @if (c.format !== 'league' && c.groups?.length) {
          <div class="tabs" style="margin-bottom: 12px">
            <button type="button" [class.active]="gameFilter() === 'all'" (click)="gameFilter.set('all')">Tous</button>
            @for (g of c.groups; track g.id) {
              <button type="button" [class.active]="gameFilter() === g.id" (click)="gameFilter.set(g.id)">{{ g.name }}</button>
            }
            <button type="button" [class.active]="gameFilter() === 'none'" (click)="gameFilter.set('none')">Hors poule</button>
          </div>
        }
      </ng-template>

      <ng-template #table let-rows let-full="full">
        <div class="table-wrap">
          <table class="standings" [class.compact]="!full">
            <thead>
              <tr>
                <th class="rank">#</th><th>Équipe</th>
                <th class="num" title="Matchs joués">J</th><th class="num" title="Victoires">G</th><th class="num" title="Nuls">N</th><th class="num" title="Défaites">P</th>
                @if (full) { <th class="num opt" title="Points marqués en match">Marqués</th><th class="num opt" title="Points encaissés">Encaissés</th> }
                <th class="num" title="Différence de points">Diff.</th><th class="num pts" title="Points au classement">Pts</th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows; track s.team.id; let i = $index) {
                <tr [class.top3]="i < 3 && s.played > 0" [class.first]="i === 0 && s.played > 0">
                  <td class="rank">
                    @if (i < 3 && s.played > 0) {
                      <span class="medal-icon" [style.color]="medalColors[i]"><app-icon name="medal" [size]="16" /></span>
                    } @else { {{ i + 1 }} }
                  </td>
                  <td>
                    <span class="team-cell">
                      <app-avatar [src]="s.team.logo_url" [name]="s.team.name" [size]="26" shape="square" />
                      <strong>{{ s.team.name }}</strong>
                    </span>
                  </td>
                  <td class="num">{{ s.played }}</td><td class="num">{{ s.won }}</td><td class="num">{{ s.drawn }}</td><td class="num">{{ s.lost }}</td>
                  @if (full) { <td class="num opt">{{ s.points_for }}</td><td class="num opt">{{ s.points_against }}</td> }
                  <td class="num diff" [class.pos]="s.points_for > s.points_against" [class.neg]="s.points_for < s.points_against">{{ signed(s.points_for - s.points_against) }}</td>
                  <td class="num pts"><strong>{{ s.points }}</strong></td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="full ? 10 : 8" class="muted">Aucune équipe.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </ng-template>

      <app-modal [open]="gameFormOpen()" title="Programmer un match" [eyebrow]="c.name" (closed)="gameFormOpen.set(false)">
        <form class="form" (ngSubmit)="createGame()">
          @if (gameError()) { <p class="alert" role="alert">{{ gameError() }}</p> }
          <div class="form-grid">
            @if (c.format !== 'league' && c.groups?.length) {
              <label class="field" style="grid-column: 1 / -1"><span>Poule</span>
                <select name="group" [(ngModel)]="gameForm.group_id" (ngModelChange)="gameForm.team_a_id = null; gameForm.team_b_id = null">
                  <option [ngValue]="null">Hors poule (phase finale, match de classement…)</option>
                  @for (g of c.groups; track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
                </select>
              </label>
            }
            <label class="field"><span>Équipe A</span>
              <select name="team_a" [(ngModel)]="gameForm.team_a_id" required>
                <option [ngValue]="null" disabled>Choisir…</option>
                @for (t of formTeams(c); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
              </select>
            </label>
            <label class="field"><span>Équipe B</span>
              <select name="team_b" [(ngModel)]="gameForm.team_b_id" required>
                <option [ngValue]="null" disabled>Choisir…</option>
                @for (t of formTeams(c); track t.id) { <option [ngValue]="t.id" [disabled]="t.id === gameForm.team_a_id">{{ t.name }}</option> }
              </select>
            </label>
            <label class="field"><span>Tour / phase</span>
              <input name="round" [(ngModel)]="gameForm.round" maxlength="60" [placeholder]="groupName(c, gameForm.group_id) ?? 'Ex. Demi-finale'" />
            </label>
            <label class="field"><span>Date et heure</span>
              <input type="datetime-local" name="scheduled_at" [(ngModel)]="gameForm.scheduled_at" />
            </label>
          </div>
          <div class="form-actions">
            <button class="btn btn-ghost" type="button" (click)="gameFormOpen.set(false)">Annuler</button>
            <button class="btn" type="submit" [disabled]="busy()">Ajouter le match</button>
          </div>
        </form>
      </app-modal>

      <app-modal [open]="lifecycle() === 'publish'" title="Publier la compétition" [eyebrow]="c.name" (closed)="lifecycle.set(null)">
        <p style="margin: 0 0 14px">La compétition passera au statut <strong>« En cours »</strong> : les matchs pourront être démarrés et suivis en direct.</p>
        <ul class="checklist">
          <li [class.ko]="(c.teams?.length ?? 0) < 2"><app-icon [name]="(c.teams?.length ?? 0) < 2 ? 'x' : 'check'" /> {{ c.teams?.length ?? 0 }} équipe(s) inscrite(s) <span class="muted small">— 2 minimum</span></li>
          <li [class.warn]="!c.games?.length"><app-icon [name]="c.games?.length ? 'check' : 'triangle-alert'" /> {{ c.games?.length ?? 0 }} match(s) programmé(s)@if (!c.games?.length) { <span class="muted small">— vous pourrez en ajouter ensuite</span> }</li>
          <li><app-icon name="check" /> Format : {{ formatLabels[c.format] }}@if (c.format === 'groups') { · {{ c.groups?.length ?? 0 }} poule(s) }</li>
          <li><app-icon name="check" /> {{ c.rubrics?.length ? c.rubrics?.length + ' rubrique(s)' : 'Barème unique' }}</li>
          <li><app-icon name="check" /> Début : {{ c.starts_on ? (c.starts_on | date: 'd MMMM y') : 'aujourd’hui' }}</li>
        </ul>
        @if (c.status === 'open') { <p class="muted small">Les inscriptions des capitaines seront fermées.</p> }
        @if (lifecycleError()) { <p class="alert" role="alert">{{ lifecycleError() }}</p> }
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" (click)="lifecycle.set(null)">Annuler</button>
          <button class="btn" type="button" (click)="publish()" [disabled]="busy() || (c.teams?.length ?? 0) < 2"><app-icon name="rocket" /> Publier</button>
        </div>
      </app-modal>

      <app-modal [open]="lifecycle() === 'finish'" title="Terminer la compétition" [eyebrow]="c.name" (closed)="lifecycle.set(null)">
        <p style="margin: 0 0 14px">La compétition passera au statut <strong>« Terminée »</strong> et le classement sera figé. Plus aucun match ne pourra être joué (vous pourrez la rouvrir en cas d’erreur).</p>
        @if (standings()[0]?.played) {
          <ol class="podium">
            @for (s of standings().slice(0, 3); track s.team.id; let i = $index) {
              <li><span class="medal" [style.color]="['var(--ochre)', '#8d8b80', 'var(--rust)'][i]"><app-icon name="medal" [size]="20" /></span> <strong>{{ s.team.name }}</strong> <span class="muted small">{{ s.points }} pts</span></li>
            }
          </ol>
        }
        @if (liveGames().length) {
          <p class="alert" role="alert">{{ liveGames().length }} match(s) encore en direct : terminez-les d’abord.</p>
        } @else if (nextGame()) {
          <p class="alert row" style="flex-wrap: nowrap"><app-icon name="triangle-alert" [size]="18" /> {{ unplayed() }} match(s) programmé(s) n’ont pas été joués : ils ne compteront pas au classement.</p>
        }
        @if (lifecycleError()) { <p class="alert" role="alert">{{ lifecycleError() }}</p> }
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" (click)="lifecycle.set(null)">Annuler</button>
          <button class="btn" type="button" (click)="finish()" [disabled]="busy() || liveGames().length > 0"><app-icon name="flag" /> Terminer</button>
        </div>
      </app-modal>

      <app-competition-edit-modal [competition]="c" [open]="editing()" (closed)="closeEdit()" (saved)="onSaved($event)" />
      <app-team-picker-modal [competitionId]="c.id" [competitionName]="c.name" [teams]="registrableTeams()" [open]="picking()" (closed)="picking.set(false)" (added)="onTeamsAdded($event)" />
    } @else if (notFound()) {
      <p class="empty">Compétition introuvable.</p>
    }
  `,
  styles: `
    .champion { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; margin-bottom: 20px; padding: 20px 24px; border-radius: 16px; background: linear-gradient(120deg, var(--ink), #4a3a26); color: var(--paper); }
    .champion > div { flex: 1; min-width: 220px; }
    .champion h2 { font-family: var(--display); font-size: 28px; font-weight: 600; }
    .champion em { color: var(--gold); }
    .trophy { display: inline-flex; color: var(--gold); animation: float 4s ease-in-out infinite; }
    .btn-outline-light { border-color: rgba(246, 244, 238, .35); background: transparent; color: var(--paper); }
    .btn-outline-light:hover { border-color: var(--gold); background: rgba(240, 205, 135, .12); }
    .checklist, .podium { display: grid; gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; }
    .checklist li { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
    .checklist li.ko { border-color: rgba(163, 54, 31, .4); background: rgba(163, 54, 31, .06); color: var(--danger); }
    .checklist li.warn { background: rgba(240, 205, 135, .25); }
    .podium li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; background: rgba(240, 205, 135, .25); }
    .medal { display: inline-flex; }
    @keyframes float { 50% { transform: translateY(-6px); } }
    .ctabs { position: sticky; top: 0; z-index: 5; display: flex; gap: 2px; margin: 0 0 22px; overflow-x: auto; border-bottom: 1px solid var(--line); background: var(--paper); scrollbar-width: thin; }
    .ctabs button { display: inline-flex; flex: none; align-items: center; gap: 7px; padding: 13px 14px 11px; border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: color .15s ease, border-color .15s ease; }
    .ctabs button:hover { color: var(--ink); }
    .ctabs button.active { border-bottom-color: var(--rust); color: var(--ink); }
    .count { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: rgba(190, 189, 177, .4); font-family: var(--mono); font-size: 10px; text-align: center; }
    .active .count { background: var(--gold); }
    .tab-panel { animation: arrive .3s ease both; }
    .desc { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.6; white-space: pre-line; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--line); }
    .facts div { padding: 12px 14px; background: var(--surface); }
    .facts dt { color: var(--muted); font-family: var(--mono); font-size: 10px; text-transform: uppercase; }
    .facts dd { margin: 4px 0 0; font-size: 14px; font-weight: 600; }
    .mini-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .mini-stats .stat { text-align: left; cursor: pointer; transition: border-color .15s ease; }
    .mini-stats .stat:hover { border-color: var(--ochre); }
    .sub { margin: 0 0 10px; font-size: 14px; }
    .leader { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer; }
    .leader:hover { border-color: var(--ochre); }
    .leader-icon { width: 38px; height: 38px; display: grid; place-items: center; flex: none; border-radius: 50%; background: var(--gold); font-size: 18px; }
    .team-card h3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .group-select { flex: 1; min-height: 32px; padding: 3px 8px; font-size: 12px; }
    .group-tables { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 24px; }
    .standings th, .standings td { white-space: nowrap; }
    .standings .rank { width: 44px; text-align: center; }
    .standings .team-cell { display: inline-flex; align-items: center; gap: 10px; min-width: 0; white-space: normal; }
    .standings .team-cell strong { line-height: 1.25; }
    .standings tr.top3 td:first-child { box-shadow: inset 3px 0 0 var(--ochre); }
    .standings tr.first td { background: rgba(240, 205, 135, .22); }
    .standings .medal-icon { display: inline-flex; vertical-align: middle; }
    .standings .diff.pos { color: var(--ochre-ink); }
    .standings .diff.neg { color: var(--rust); }
    .standings .pts { width: 52px; background: rgba(190, 189, 177, .12); }
    .standings th.pts { color: var(--ink); }
    .standings.compact th, .standings.compact td { padding: 8px 8px; }
    @media (max-width: 640px) {
      .standings .opt { display: none; }
      .standings th, .standings td { padding: 9px 7px; }
    }
    @media (max-width: 560px) { .facts { grid-template-columns: 1fr; } }
  `,
})
export class CompetitionDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  protected readonly labels = COMPETITION_STATUS_LABELS;
  protected readonly competition = signal<Competition | null>(null);
  protected readonly standings = signal<Standing[]>([]);
  protected readonly groupStandings = signal<GroupStanding[]>([]);
  protected readonly gameFilter = signal<'all' | 'none' | number>('all');
  protected readonly roundFilter = signal('');
  protected readonly rounds = computed(() => [...new Set((this.competition()?.games ?? []).map((g) => g.round).filter((r): r is string => !!r))]);
  protected readonly formatLabels = FORMAT_LABELS;
  /** Onglet actif, lu dans ?onglet= pour pouvoir partager un lien direct. */
  readonly onglet = input<string>();
  protected readonly tab = signal<Tab>('infos');
  protected readonly tabs = computed(() => {
    const c = this.competition();
    if (!c) return [];
    return [
      { id: 'infos' as Tab, label: 'Informations', count: undefined },
      { id: 'equipes' as Tab, label: 'Équipes', count: c.teams?.length ?? 0 },
      { id: 'matchs' as Tab, label: 'Matchs', count: this.allUpcoming().length },
      { id: 'resultats' as Tab, label: 'Résultats', count: this.allResults().length },
      { id: 'classement' as Tab, label: 'Classement', count: undefined },
      { id: 'organisation' as Tab, label: c.format === 'league' ? 'Calendrier' : 'Poules', count: c.format === 'league' ? undefined : c.groups?.length ?? 0 },
      { id: 'rubriques' as Tab, label: 'Barème & rubriques', count: c.rubrics?.length || undefined },
    ];
  });
  private readonly allUpcoming = computed(() => (this.competition()?.games ?? []).filter((g) => g.status !== 'finished'));
  private readonly allResults = computed(() => (this.competition()?.games ?? []).filter((g) => g.status === 'finished'));
  protected readonly liveGames = computed(() => this.allUpcoming().filter((g) => g.status === 'live'));
  protected readonly nextGame = computed(() => this.allUpcoming().find((g) => g.status === 'scheduled') ?? null);
  protected readonly upcoming = computed(() => this.filteredGames().filter((g) => g.status !== 'finished'));
  protected readonly results = computed(() =>
    this.filteredGames()
      .filter((g) => g.status === 'finished')
      .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? '')),
  );
  protected readonly isFiltered = computed(() => this.gameFilter() !== 'all' || !!this.roundFilter());
  protected readonly gameFormOpen = signal(false);
  protected readonly lifecycle = signal<'publish' | 'finish' | null>(null);
  protected readonly lifecycleError = signal('');
  protected readonly medalColors = ['var(--ochre)', '#8d8b80', 'var(--rust)'];

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  protected readonly unplayed = computed(() => this.allUpcoming().filter((g) => g.status === 'scheduled').length);
  protected readonly gameError = signal('');
  protected readonly filteredGames = computed(() => {
    const games = this.competition()?.games ?? [];
    const filter = this.gameFilter();
    const round = this.roundFilter();
    if (round) return games.filter((g) => g.round === round);
    if (filter === 'all') return games;
    return games.filter((g) => (filter === 'none' ? !g.group : g.group?.id === filter));
  });
  protected readonly candidates = signal<Team[]>([]);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** ?modifier=1 ouvre directement la modale de modification (lien depuis l'administration). */
  readonly modifier = input<string>();
  protected readonly editing = signal(false);
  protected readonly picking = signal(false);
  protected readonly notice = signal('');
  protected gameForm = this.emptyGame();

  /** Équipes que l'utilisateur peut inscrire : toutes pour l'organisateur, les siennes si les inscriptions sont ouvertes. */
  protected readonly registrableTeams = computed(() => {
    const c = this.competition();
    if (!c || !this.auth.isLoggedIn()) {
      return [];
    }
    const registered = new Set(c.teams?.map((t) => t.id));
    return this.candidates().filter((t) => !registered.has(t.id) && (c.can_manage || (c.status === 'open' && t.can_manage)));
  });

  ngOnInit(): void {
    this.editing.set(!!this.modifier());
    if (TABS.includes(this.onglet() as Tab)) {
      this.tab.set(this.onglet() as Tab);
    }
    this.load();
    if (this.auth.isLoggedIn()) {
      this.api.teams().subscribe((teams) => this.candidates.set(teams));
    }
  }

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.notice.set('');
    this.error.set('');
    this.router.navigate([], { queryParams: { onglet: tab === 'infos' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected openLifecycle(action: 'publish' | 'finish'): void {
    this.lifecycleError.set('');
    this.lifecycle.set(action);
  }

  protected publish(): void {
    this.changeStatus(this.api.publishCompetition(+this.id()), 'La compétition est publiée : elle est maintenant en cours.');
  }

  protected finish(): void {
    this.changeStatus(this.api.finishCompetition(+this.id()), 'La compétition est terminée. Le classement est figé.');
  }

  protected reopen(): void {
    if (confirm('Rouvrir la compétition ? Elle repassera « En cours » et les matchs pourront de nouveau être joués.')) {
      this.changeStatus(this.api.reopenCompetition(+this.id()), 'La compétition est rouverte.');
    }
  }

  private changeStatus(request: Observable<Competition>, success: string): void {
    this.busy.set(true);
    this.lifecycleError.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.lifecycle.set(null);
        this.notice.set(success);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        if (this.lifecycle()) {
          this.lifecycleError.set(errorMessage(e));
        } else {
          this.error.set(errorMessage(e));
        }
      },
    });
  }

  protected openGameForm(): void {
    this.gameForm = this.emptyGame();
    this.gameError.set('');
    this.gameFormOpen.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
    if (this.modifier()) {
      this.router.navigate([], { queryParams: { modifier: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected onSaved(competition: Competition): void {
    this.closeEdit();
    this.notice.set(`« ${competition.name} » a été mise à jour.`);
    this.load();
  }

  protected onTeamsAdded(count: number): void {
    this.picking.set(false);
    this.notice.set(count ? `${count} équipe${count > 1 ? 's' : ''} inscrite${count > 1 ? 's' : ''}.` : 'Ces équipes étaient déjà inscrites.');
    this.load();
  }

  protected detach(team: Team): void {
    if (confirm(`Retirer ${team.name} de la compétition ?`)) {
      this.run(this.api.detachTeam(+this.id(), team.id));
    }
  }

  /** Équipes proposées dans le formulaire : celles de la poule choisie, sinon toutes. */
  protected formTeams(c: Competition): Team[] {
    const groupId = this.gameForm.group_id;
    return (c.teams ?? []).filter((t) => !groupId || t.group_id === groupId);
  }

  protected groupName(c: Competition, groupId: number | null): string | null {
    return c.groups?.find((g) => g.id === groupId)?.name ?? null;
  }

  protected assign(team: Team, groupId: number | null): void {
    this.run(this.api.assignGroup(+this.id(), team.id, groupId));
  }

  protected createGame(): void {
    const { team_a_id, team_b_id, group_id, scheduled_at } = this.gameForm;
    const round = this.gameForm.round || this.groupName(this.competition()!, group_id);
    if (!team_a_id || !team_b_id) {
      this.gameError.set('Choisissez deux équipes.');
      return;
    }
    const payload = { team_a_id, team_b_id, group_id, round: round || null, scheduled_at: fromLocalInput(scheduled_at) };
    this.busy.set(true);
    this.gameError.set('');
    this.api.createGame(+this.id(), payload).subscribe({
      next: (game) => {
        this.busy.set(false);
        this.gameFormOpen.set(false);
        this.notice.set(`Match ${game.team_a.name} – ${game.team_b.name} programmé.`);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.gameError.set(errorMessage(e));
      },
    });
  }

  protected remove(): void {
    if (confirm('Supprimer définitivement cette compétition et tous ses matchs ?')) {
      this.api.deleteCompetition(+this.id()).subscribe({
        next: () => this.router.navigateByUrl('/competitions'),
        error: (e) => this.error.set(errorMessage(e)),
      });
    }
  }

  private run(request: Observable<unknown>, done?: () => void): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: () => {
        done?.();
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  protected load(): void {
    this.api.competition(+this.id()).subscribe({
      next: ({ competition, standings, groupStandings }) => {
        this.competition.set(competition);
        this.standings.set(standings);
        this.groupStandings.set(groupStandings);
      },
      error: () => this.notFound.set(true),
    });
  }

  private emptyGame() {
    return { group_id: null as number | null, team_a_id: null as number | null, team_b_id: null as number | null, round: '', scheduled_at: '' };
  }
}
