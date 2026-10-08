import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { Competition, GroupStanding } from '../core/models';
import { Icon } from './icon';

/** Section « Poules » d'une compétition : tirage, gestion et classements par poule. */
@Component({
  selector: 'app-competition-groups',
  imports: [Icon, FormsModule],
  template: `
    @let c = competition();
    <section class="section">
      <header class="row" style="justify-content: space-between; margin-bottom: 14px">
        <h2 class="section-title">Poules</h2>
        @if (c.can_manage) {
          <div class="row">
            <form class="row draw" (ngSubmit)="draw()">
              <label class="small muted" for="group-count">Tirage au sort en</label>
              <input id="group-count" class="input" type="number" name="count" min="1" [max]="maxGroups()" [(ngModel)]="count" />
              <span class="small muted">poules</span>
              <button class="btn btn-gold btn-sm" type="submit" [disabled]="busy() || (c.teams?.length ?? 0) < 2"><app-icon name="dices" [size]="14" /> Tirer</button>
            </form>
            <button class="btn btn-ghost btn-sm" type="button" (click)="run(api.addGroup(c.id))" [disabled]="busy()">+ Poule</button>
          </div>
        }
      </header>

      @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 12px">{{ m.text }}</p> }

      @if (groups().length) {
        <div class="groups">
          @for (g of groups(); track g.id; let i = $index) {
            <article class="group card" [style.--accent]="accents[i % accents.length]">
              <header class="group-head">
                <span class="group-letter">{{ letter(g.name) }}</span>
                <h3>{{ g.name }}</h3>
                @if (c.can_manage) {
                  <div class="group-actions">
                    <button class="icon" type="button" (click)="schedule(g)" [disabled]="busy() || g.standings.length < 2" title="Générer les matchs (chacun contre chacun)" aria-label="Générer les matchs de la poule"><app-icon name="zap" [size]="15" /></button>
                    <button class="icon" type="button" (click)="rename(g)" title="Renommer" aria-label="Renommer la poule"><app-icon name="pencil" [size]="15" /></button>
                    <button class="icon danger" type="button" (click)="remove(g)" title="Supprimer" aria-label="Supprimer la poule"><app-icon name="x" [size]="15" /></button>
                  </div>
                }
              </header>
              <table>
                <thead><tr><th>#</th><th>Équipe</th><th class="num">J</th><th class="num">G</th><th class="num">N</th><th class="num">P</th><th class="num">Diff.</th><th class="num">Pts</th></tr></thead>
                <tbody>
                  @for (s of g.standings; track s.team.id; let r = $index) {
                    <tr [class.qualified]="r < 2 && s.played > 0">
                      <td>{{ r + 1 }}</td>
                      <td class="team">{{ s.team.name }}</td>
                      <td class="num">{{ s.played }}</td><td class="num">{{ s.won }}</td><td class="num">{{ s.drawn }}</td><td class="num">{{ s.lost }}</td>
                      <td class="num">{{ s.points_for - s.points_against }}</td>
                      <td class="num"><strong>{{ s.points }}</strong></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="muted small">Aucune équipe. {{ c.can_manage ? 'Affectez des équipes depuis la liste des inscrits.' : '' }}</td></tr>
                  }
                </tbody>
              </table>
            </article>
          }
        </div>
        <p class="muted small" style="margin-top: 10px">Les deux premiers de chaque poule sont mis en évidence. <app-icon name="zap" [size]="12" /> génère les matchs manquants de la poule.</p>
      } @else {
        <p class="empty">
          Pas de poules pour cette compétition.
          @if (c.can_manage) { Lancez un tirage au sort ou créez-les une par une. }
        </p>
      }
    </section>
  `,
  styles: `
    .draw { gap: 6px; }
    .draw .input { width: 64px; min-height: 32px; padding: 4px 8px; }
    .groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
    .group { padding: 0; overflow: hidden; border-top: 4px solid var(--accent); }
    .group-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
    .group-head h3 { flex: 1; font-size: 15px; }
    .group-letter { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: var(--accent); color: var(--ink); font-family: var(--display); font-size: 18px; font-weight: 700; }
    .group-actions { display: flex; gap: 4px; }
    .icon { width: 30px; height: 30px; display: inline-grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); cursor: pointer; }
    .icon:hover:not(:disabled) { border-color: var(--ochre); background: rgba(240, 205, 135, .35); }
    .icon.danger:hover { border-color: var(--danger); background: rgba(163, 54, 31, .08); color: var(--danger); }
    .icon:disabled { opacity: .45; cursor: not-allowed; }
    table { font-size: 12px; }
    th, td { padding: 8px 10px; }
    td.team { max-width: 140px; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    tr.qualified td:first-child { box-shadow: inset 3px 0 0 var(--accent); font-weight: 700; }
  `,
})
export class CompetitionGroups {
  protected readonly api = inject(ApiService);
  readonly competition = input.required<Competition>();
  readonly groups = input.required<GroupStanding[]>();
  readonly changed = output<void>();
  protected readonly accents = ['var(--gold)', 'var(--ochre)', 'var(--rust)', 'var(--sand)', 'var(--gold-light)'];
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected count = 2;

  protected maxGroups(): number {
    return Math.max(1, Math.min(26, this.competition().teams?.length ?? 1));
  }

  protected letter(name: string): string {
    return name.replace(/^Poule\s+/i, '').slice(0, 2) || '?';
  }

  protected draw(): void {
    const hasGroupGames = this.competition().games?.some((g) => g.group);
    const warning = this.groups().length
      ? `Refaire le tirage en ${this.count} poules ? Les poules actuelles${hasGroupGames ? ' et leurs matchs non joués' : ''} seront remplacées.`
      : `Répartir les équipes au hasard dans ${this.count} poules ?`;
    if (confirm(warning)) {
      this.run(this.api.drawGroups(this.competition().id, this.count), 'Tirage effectué.');
    }
  }

  protected schedule(group: GroupStanding): void {
    this.busy.set(true);
    this.api.scheduleGroup(group.id).subscribe({
      next: ({ created }) => this.done(created ? `${created} match(s) ajouté(s) pour la ${group.name}.` : `Tous les matchs de la ${group.name} existent déjà.`),
      error: (e) => this.fail(e),
    });
  }

  protected rename(group: GroupStanding): void {
    const name = prompt('Nouveau nom de la poule', group.name)?.trim();
    if (name && name !== group.name) {
      this.run(this.api.renameGroup(group.id, name));
    }
  }

  protected remove(group: GroupStanding): void {
    if (confirm(`Supprimer la ${group.name} ? Ses équipes et ses matchs restent dans la compétition.`)) {
      this.run(this.api.deleteGroup(group.id), 'Poule supprimée.');
    }
  }

  protected run(request: Observable<unknown>, success?: string): void {
    this.busy.set(true);
    request.subscribe({ next: () => this.done(success), error: (e) => this.fail(e) });
  }

  private done(text?: string): void {
    this.busy.set(false);
    this.message.set(text ? { text, ok: true } : null);
    this.changed.emit();
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.message.set({ text: errorMessage(error), ok: false });
  }
}
