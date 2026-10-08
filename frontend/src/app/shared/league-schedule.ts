import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { fromLocalInput } from '../core/dates';
import { Competition } from '../core/models';
import { Icon } from './icon';
import { DialogService } from './dialog';

/** Section « Championnat » : génération du calendrier par journées. */
@Component({
  selector: 'app-league-schedule',
  imports: [Icon, FormsModule],
  template: `
    @let c = competition();
    <section class="section">
      <header class="row" style="justify-content: space-between; margin-bottom: 14px">
        <h2 class="section-title">Championnat</h2>
        <span class="muted small">{{ rounds() }} journée{{ rounds() > 1 ? 's' : '' }} · {{ played() }}/{{ total() }} matchs joués</span>
      </header>

      @if (total()) {
        <div class="progress" role="progressbar" [attr.aria-valuenow]="played()" aria-valuemin="0" [attr.aria-valuemax]="total()">
          <span [style.width.%]="total() ? (played() / total()) * 100 : 0"></span>
        </div>
      }

      @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin: 12px 0">{{ m.text }}</p> }

      @if (c.can_manage) {
        <form class="card form" style="margin-top: 14px" (ngSubmit)="generate()">
          <h3>{{ total() ? 'Régénérer le calendrier' : 'Générer le calendrier' }}</h3>
          <p class="muted small" style="margin: 0">
            Chaque équipe affronte toutes les autres ({{ teams() }} équipes, soit {{ perLeg() }} matchs par phase).
            L’ordre des rencontres est tiré au sort et les réceptions sont équilibrées.
          </p>
          <div class="form-grid">
            <label class="field"><span>Première journée (facultatif)</span>
              <input type="datetime-local" name="start" [(ngModel)]="start" />
            </label>
            <label class="field"><span>Jours entre deux journées</span>
              <input type="number" name="interval" min="0" max="60" [(ngModel)]="interval" />
            </label>
          </div>
          <label class="row small"><input type="checkbox" name="double" [(ngModel)]="double" /> Aller-retour (phase retour avec réceptions inversées)</label>
          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="busy() || teams() < 2"><app-icon name="zap" /> {{ total() ? 'Régénérer' : 'Générer' }} {{ double ? perLeg() * 2 : perLeg() }} matchs</button>
          </div>
        </form>
      } @else if (!total()) {
        <p class="empty">Le calendrier du championnat n’a pas encore été publié.</p>
      }
    </section>
  `,
  styles: `
    .progress { height: 8px; overflow: hidden; border-radius: 99px; background: rgba(190, 189, 177, .4); }
    .progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--ochre), var(--rust)); transition: width .6s ease; }
    input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--rust); }
  `,
})
export class LeagueSchedule {
  private readonly dialog = inject(DialogService);
  private readonly api = inject(ApiService);
  readonly competition = input.required<Competition>();
  readonly changed = output<void>();
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected double = false;
  protected start = '';
  protected interval = 7;

  private readonly leagueGames = computed(() => (this.competition().games ?? []).filter((g) => !g.group));
  protected readonly teams = computed(() => this.competition().teams?.length ?? 0);
  protected readonly perLeg = computed(() => (this.teams() * (this.teams() - 1)) / 2);
  protected readonly total = computed(() => this.leagueGames().length);
  protected readonly played = computed(() => this.leagueGames().filter((g) => g.status === 'finished').length);
  protected readonly rounds = computed(() => new Set(this.leagueGames().map((g) => g.round)).size);

  protected async generate(): Promise<void> {
    const replace = this.total() > 0;
    if (replace && !(await this.dialog.confirm('Les matchs programmés seront recréés.', { title: 'Remplacer le calendrier actuel ?', confirmLabel: 'Remplacer' }))) {
      return;
    }
    this.busy.set(true);
    this.api
      .scheduleLeague(this.competition().id, { double: this.double, replace, start_at: fromLocalInput(this.start), interval_days: this.interval })
      .subscribe({
        next: ({ created, rounds }) => {
          this.busy.set(false);
          this.message.set({ text: `${created} matchs répartis sur ${rounds} journées.`, ok: true });
          this.changed.emit();
        },
        error: (e) => {
          this.busy.set(false);
          this.message.set({ text: errorMessage(e), ok: false });
        },
      });
  }
}
