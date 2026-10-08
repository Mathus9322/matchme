import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { Team } from '../core/models';
import { Avatar } from './avatar';
import { Modal } from './modal';

/** Sélection de plusieurs équipes à inscrire en une fois. */
@Component({
  selector: 'app-team-picker-modal',
  imports: [FormsModule, RouterLink, Modal, Avatar],
  template: `
    <app-modal [open]="open()" [wide]="true" title="Inscrire des équipes" [eyebrow]="competitionName()" (closed)="closed.emit()">
      @if (error()) { <p class="alert" role="alert" style="margin-bottom: 12px">{{ error() }}</p> }

      <div class="toolbar">
        <input class="input" type="search" placeholder="Rechercher par nom ou ville…" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Rechercher une équipe" />
        <label class="row small select-all">
          <input type="checkbox" [checked]="allVisibleSelected()" [indeterminate]="someVisibleSelected()" (change)="toggleVisible()" [disabled]="!visible().length" />
          Tout sélectionner{{ search() ? ' (filtre)' : '' }}
        </label>
      </div>

      @if (teams().length) {
        <ul class="picker">
          @for (t of visible(); track t.id) {
            <li>
              <label [class.checked]="selected().has(t.id)">
                <input type="checkbox" [checked]="selected().has(t.id)" (change)="toggle(t.id)" />
                <app-avatar [src]="t.logo_url" [name]="t.name" [size]="34" shape="square" />
                <span class="info">
                  <strong>{{ t.name }}</strong>
                  <span class="muted small">{{ t.city || 'Ville non renseignée' }} · {{ t.players_count }} joueurs</span>
                </span>
              </label>
            </li>
          } @empty {
            <li class="muted small" style="padding: 16px">Aucune équipe ne correspond à « {{ search() }} ».</li>
          }
        </ul>
      } @else {
        <p class="empty">Toutes les équipes disponibles sont déjà inscrites. <a routerLink="/equipes/nouvelle">Créer une équipe</a></p>
      }

      <footer class="picker-foot">
        <span class="small"><strong>{{ selected().size }}</strong> équipe(s) sélectionnée(s)</span>
        <div class="row">
          @if (selected().size) { <button class="btn btn-ghost btn-sm" type="button" (click)="clearSelection()">Vider</button> }
          <button class="btn" type="button" (click)="submit()" [disabled]="!selected().size || saving()">
            {{ saving() ? 'Inscription…' : 'Inscrire ' + (selected().size || '') + ' équipe' + (selected().size > 1 ? 's' : '') }}
          </button>
        </div>
      </footer>
    </app-modal>
  `,
  styles: `
    .toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
    .toolbar .input { flex: 1; }
    .select-all { flex: none; cursor: pointer; }
    .select-all input, .picker input { width: 17px; height: 17px; accent-color: var(--rust); }
    .picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 46dvh; margin: 0; padding: 2px; overflow-y: auto; list-style: none; }
    .picker label { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; transition: border-color .12s ease, background .12s ease; }
    .picker label:hover { border-color: var(--sand); }
    .picker label.checked { border-color: var(--ochre); background: rgba(240, 205, 135, .3); }
    .info { display: grid; min-width: 0; gap: 2px; }
    .info strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .picker-foot { position: sticky; bottom: -24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 16px -24px -24px; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface); }
    @media (max-width: 600px) { .picker { grid-template-columns: 1fr; } .toolbar { flex-direction: column; align-items: stretch; } }
  `,
})
export class TeamPickerModal {
  private readonly api = inject(ApiService);
  readonly competitionId = input.required<number>();
  readonly competitionName = input('');
  readonly teams = input.required<Team[]>();
  readonly open = input(false);
  readonly added = output<number>();
  readonly closed = output<void>();
  protected readonly search = signal('');
  protected readonly selected = signal(new Set<number>());
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.teams().filter((t) => !term || t.name.toLowerCase().includes(term) || (t.city ?? '').toLowerCase().includes(term));
  });
  protected readonly allVisibleSelected = computed(() => this.visible().length > 0 && this.visible().every((t) => this.selected().has(t.id)));
  protected readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some((t) => this.selected().has(t.id)));

  constructor() {
    effect(() => {
      if (this.open()) {
        this.selected.set(new Set());
        this.search.set('');
        this.error.set('');
      }
    });
  }

  protected toggle(id: number): void {
    this.selected.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected toggleVisible(): void {
    const ids = this.visible().map((t) => t.id);
    const selectAll = !this.allVisibleSelected();
    this.selected.update((set) => {
      const next = new Set(set);
      ids.forEach((id) => (selectAll ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  protected submit(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.attachTeams(this.competitionId(), [...this.selected()]).subscribe({
      next: ({ attached }) => {
        this.saving.set(false);
        this.added.emit(attached);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }
}
