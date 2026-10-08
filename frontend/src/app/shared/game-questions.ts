import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, errorMessage, QuestionPayload } from '../core/api.service';
import { Game, GameQuestion } from '../core/models';
import { Avatar } from './avatar';
import { Icon } from './icon';
import { Modal } from './modal';
import { DialogService } from './dialog';

/**
 * Questions du match (fichier virtuel importé depuis un PDF).
 * Public : question en cours, réponse révélée et joueurs qui ont répondu, historique.
 * Manager : import PDF, édition, affichage au public et révélation des réponses.
 */
@Component({
  selector: 'app-game-questions',
  imports: [FormsModule, NgTemplateOutlet, Avatar, Icon, Modal],
  template: `
    @let g = game();
    @if (current(); as q) {
      <section class="current card" [class.revealed]="q.status === 'revealed'" aria-live="polite">
        <div class="current-head">
          <span class="eyebrow" style="margin: 0"><span class="live-dot"></span> Question {{ q.position }}@if (q.rubric) { · {{ q.rubric }} }@if (q.points) { · {{ q.points }} pts }</span>
          @if (manage() && q.status !== 'revealed') {
            <button class="btn btn-gold btn-sm" type="button" (click)="run(api.revealQuestion(q.id))" [disabled]="busy() || !inPlay()" [title]="inPlay() ? '' : pauseHint()"><app-icon name="eye" [size]="14" /> Révéler la réponse</button>
          }
          @if (manage() && next(); as n) {
            <button class="btn btn-sm" type="button" (click)="run(api.showQuestion(n.id))" [disabled]="busy() || !inPlay()" [title]="inPlay() ? '' : pauseHint()"><app-icon name="arrow-right" [size]="14" /> Question suivante</button>
          }
        </div>
        <p class="q-text">{{ q.question }}</p>
        @if (q.answer && (q.status === 'revealed' || manage())) {
          <p class="answer" [class.private]="q.status !== 'revealed'">
            <span class="answer-label">{{ q.status === 'revealed' ? 'Réponse' : 'Réponse (visible par vous seul)' }}</span> {{ q.answer }}
          </p>
        }
        @if (q.answered.length) {
          <div class="answered">
            @for (a of q.answered; track $index) {
              <span class="chip" [class.neg]="a.points < 0">
                <app-avatar [src]="a.photo_url" [name]="a.player ?? teamName(a.team_id)" [size]="22" />
                {{ a.player ?? teamName(a.team_id) }} · {{ teamName(a.team_id) }}
                <strong>{{ a.points > 0 ? '+' : '' }}{{ a.points }}</strong>
              </span>
            }
          </div>
        } @else if (q.status !== 'revealed') {
          <p class="muted small" style="margin: 10px 0 0">En attente d’une réponse…</p>
        }
        @if (manage()) { <p class="muted small" style="margin: 10px 0 0">Les points marqués maintenant sont rattachés à cette question.</p> }
      </section>
    }

    @if (manage()) {
      <section class="section">
        <header class="row" style="justify-content: space-between; margin-bottom: 12px">
          <div>
            <h2 class="section-title">Questions du match</h2>
            <p class="muted small" style="margin: 4px 0 0">
              @if (g.questions_source) { Fichier importé : <strong>{{ g.questions_source }}</strong> · } {{ questions().length }} question(s), {{ asked() }} posée(s)
            </p>
          </div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" type="button" (click)="downloadTemplate()"><app-icon name="download" [size]="14" /> Modèle PDF</button>
            <button class="btn btn-ghost btn-sm" type="button" (click)="openEditor(null)"><app-icon name="plus" [size]="14" /> Ajouter</button>
            <label class="btn btn-sm file-btn" [class.disabled]="busy()">
              <app-icon name="upload" [size]="14" /> Importer un PDF
              <input type="file" accept="application/pdf,.pdf" (change)="pick($event)" [disabled]="busy()" />
            </label>
          </div>
        </header>
        @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 12px">{{ m.text }}</p> }

        @if (questions().length) {
          <ng-template #managerItem let-q>
              <li [class.is-current]="q.id === g.current_question_id">
                <span class="num">{{ q.position }}</span>
                <div class="body">
                  <p class="q">{{ q.question }}</p>
                  <p class="meta">
                    @if (q.rubric) { <span class="badge">{{ q.rubric }}</span> }
                    @if (q.points) { <span class="badge">{{ q.points }} pts</span> }
                    <span class="muted">Réponse : <strong>{{ q.answer ?? '—' }}</strong></span>
                  </p>
                  @if (q.answered.length) {
                    <p class="meta muted">Répondu par : @for (a of q.answered; track $index) { {{ a.player ?? teamName(a.team_id) }} ({{ a.points > 0 ? '+' : '' }}{{ a.points }}){{ $last ? '' : ', ' }} }</p>
                  }
                </div>
                <span [class]="'status status-' + q.status">{{ statusLabel(q) }}</span>
                <div class="actions">
                  @if (q.id !== g.current_question_id) {
                    <button class="btn btn-sm" type="button" (click)="run(api.showQuestion(q.id))" [disabled]="busy() || !inPlay()" [title]="inPlay() ? 'Afficher au public' : pauseHint()"><app-icon name="play" [size]="13" /> Afficher</button>
                  }
                  <button class="icon-btn" type="button" (click)="openEditor(q)" aria-label="Modifier la question"><app-icon name="pencil" [size]="14" /></button>
                  @if (q.status === 'pending') {
                    <button class="icon-btn danger" type="button" (click)="remove(q)" aria-label="Supprimer la question"><app-icon name="x" [size]="14" /></button>
                  }
                </div>
              </li>
          </ng-template>

          @if (toAsk().length) {
            <ol class="list">
              @for (q of toAsk(); track q.id) { <ng-container *ngTemplateOutlet="managerItem; context: { $implicit: q }" /> }
            </ol>
          } @else {
            <p class="muted small">Toutes les questions ont été posées.</p>
          }

          @if (askedList().length) {
            <details class="fold">
              <summary><app-icon name="arrow-down" [size]="14" /> Questions déjà posées ({{ askedList().length }})</summary>
              <ol class="list">
                @for (q of askedList(); track q.id) { <ng-container *ngTemplateOutlet="managerItem; context: { $implicit: q }" /> }
              </ol>
            </details>
          }
        } @else {
          <div class="empty">
            <p style="margin: 0 0 6px"><strong>Aucune question.</strong> Importez le PDF de vos questions et réponses.</p>
            <p class="small" style="margin: 0">Format : « Rubrique : … », puis « 1. Question … (20 pts) » et « Réponse : … ». Téléchargez le modèle pour démarrer.</p>
          </div>
        }
      </section>
    } @else if (history().length) {
      <section class="section">
        <details class="fold">
          <summary><app-icon name="arrow-down" [size]="14" /> Questions déjà posées ({{ history().length }})</summary>
        <ol class="list">
          @for (q of history(); track q.id) {
            <li>
              <span class="num">{{ q.position }}</span>
              <div class="body">
                <p class="q">{{ q.question }}</p>
                <p class="meta">
                  @if (q.rubric) { <span class="badge">{{ q.rubric }}</span> }
                  @if (q.answer) { <span>Réponse : <strong>{{ q.answer }}</strong></span> } @else { <span class="muted">Réponse pas encore révélée</span> }
                </p>
                @if (q.answered.length) {
                  <div class="answered">
                    @for (a of q.answered; track $index) {
                      <span class="chip" [class.neg]="a.points < 0"><app-avatar [src]="a.photo_url" [name]="a.player ?? teamName(a.team_id)" [size]="20" /> {{ a.player ?? teamName(a.team_id) }} <strong>{{ a.points > 0 ? '+' : '' }}{{ a.points }}</strong></span>
                    }
                  </div>
                }
              </div>
            </li>
          }
        </ol>
        </details>
      </section>
    }

    <app-modal [open]="editorOpen()" [title]="editingId ? 'Modifier la question' : 'Nouvelle question'" (closed)="editorOpen.set(false)">
      <form class="form" (ngSubmit)="saveQuestion()">
        @if (editorError()) { <p class="alert" role="alert">{{ editorError() }}</p> }
        <label class="field"><span>Question</span><textarea name="question" [(ngModel)]="form.question" rows="3" required maxlength="2000"></textarea></label>
        <label class="field"><span>Réponse</span><textarea name="answer" [(ngModel)]="form.answer" rows="2" maxlength="2000"></textarea></label>
        <div class="form-grid">
          <label class="field"><span>Rubrique (facultatif)</span>
            <input name="rubric" [(ngModel)]="form.rubric" maxlength="80" list="rubric-names" />
            <datalist id="rubric-names">@for (r of g.rubrics ?? []; track r.id) { <option [value]="r.name"></option> }</datalist>
          </label>
          <label class="field"><span>Points (facultatif)</span><input type="number" name="points" [(ngModel)]="form.points" min="1" max="500" /></label>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" (click)="editorOpen.set(false)">Annuler</button>
          <button class="btn" type="submit" [disabled]="busy()">Enregistrer</button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .current { margin-bottom: 16px; border: 2px solid var(--ochre); background: linear-gradient(135deg, var(--surface), rgba(240, 205, 135, .25)); }
    .current.revealed { border-color: var(--sand); }
    .current-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    .current-head .eyebrow { flex: 1; }
    .q-text { margin: 12px 0 0; font-family: var(--display); font-size: clamp(20px, 2.4vw, 28px); line-height: 1.3; }
    .answer { margin: 12px 0 0; padding: 10px 14px; border-radius: 10px; background: var(--ink); color: var(--gold-light); font-size: 16px; font-weight: 700; }
    .answer.private { border: 1px dashed var(--ochre); background: transparent; color: var(--ochre-ink); }
    .answer-label { margin-right: 8px; font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .8; }
    .answered { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; background: var(--gold); font-size: 12px; }
    .chip.neg { background: rgba(172, 99, 39, .15); color: var(--rust); }
    .fold { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .fold > summary { display: flex; align-items: center; gap: 8px; padding: 12px 16px; font-size: 14px; font-weight: 700; cursor: pointer; list-style: none; user-select: none; }
    .fold > summary::-webkit-details-marker { display: none; }
    .fold > summary app-icon { transition: transform .2s ease; transform: rotate(-90deg); }
    .fold[open] > summary app-icon { transform: none; }
    .fold > summary:hover { color: var(--rust); }
    .fold > .list { padding: 0 12px 12px; }
    .list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .list li { display: grid; grid-template-columns: 32px 1fr auto auto; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
    .list li.is-current { border-color: var(--ochre); box-shadow: inset 4px 0 0 var(--ochre); }
    .num { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-size: 12px; font-weight: 700; }
    .body { min-width: 0; }
    .q { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.4; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 12px; }
    .status { padding: 2px 9px; border-radius: 999px; font-family: var(--mono); font-size: 10px; font-weight: 700; white-space: nowrap; }
    .status-pending { background: rgba(190, 189, 177, .35); }
    .status-shown { background: var(--rust); color: white; }
    .status-revealed { background: var(--gold); }
    .actions { display: flex; align-items: center; gap: 4px; }
    .icon-btn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); cursor: pointer; }
    .icon-btn:hover { border-color: var(--ochre); }
    .icon-btn.danger:hover { border-color: var(--danger); color: var(--danger); }
    .file-btn { position: relative; }
    .file-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file-btn.disabled { opacity: .6; pointer-events: none; }
    @media (max-width: 720px) { .list li { grid-template-columns: 32px 1fr; } .status, .actions { grid-column: 2; justify-self: start; } }
  `,
})
export class GameQuestions {
  private readonly dialog = inject(DialogService);
  protected readonly api = inject(ApiService);
  readonly game = input.required<Game>();
  readonly manage = input(false);
  readonly changed = output<Game>();
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editorError = signal('');
  protected editingId: number | null = null;
  protected form: QuestionPayload = { question: '', answer: '', rubric: '', points: null };

  protected readonly questions = computed(() => this.game().questions ?? []);
  protected readonly current = computed(() => this.questions().find((q) => q.id === this.game().current_question_id) ?? null);
  protected readonly next = computed(() => {
    const current = this.current();
    return this.questions().find((q) => q.status === 'pending' && (!current || q.position > current.position)) ?? null;
  });
  protected readonly asked = computed(() => this.questions().filter((q) => q.status !== 'pending').length);
  /** Manager : questions restant à poser (dont la question en cours) et questions déjà posées, repliées. */
  protected readonly toAsk = computed(() => this.questions().filter((q) => q.status === 'pending' || q.id === this.game().current_question_id));
  protected readonly askedList = computed(() => this.questions().filter((q) => q.status !== 'pending' && q.id !== this.game().current_question_id).reverse());
  /** Historique public : questions posées, la plus récente en premier, hors question en cours. */
  protected readonly history = computed(() => this.questions().filter((q) => q.id !== this.game().current_question_id).reverse());

  protected teamName(teamId: number): string {
    const g = this.game();
    return teamId === g.team_a.id ? g.team_a.name : g.team_b.name;
  }

  /** Les questions n'avancent que pendant le jeu (match en cours, hors mi-temps). */
  protected readonly inPlay = computed(() => this.game().status === 'live' && this.game().phase !== 'halftime');

  protected pauseHint(): string {
    return this.game().status === 'live' ? 'Les questions reprennent après la mi-temps' : 'Démarrez le match pour poser les questions';
  }

  protected statusLabel(q: GameQuestion): string {
    return { pending: 'À poser', shown: 'Affichée', revealed: 'Réponse révélée' }[q.status];
  }

  protected async pick(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) return;
    const asked = this.asked() > 0;
    const append = asked || (this.questions().length > 0 && !(await this.dialog.confirm('Vous pouvez remplacer les questions actuelles ou ajouter les nouvelles à la suite.', { title: 'Importer les questions', confirmLabel: 'Remplacer', cancelLabel: 'Ajouter à la suite' })));
    const mode: 'replace' | 'append' = append ? 'append' : 'replace';
    this.busy.set(true);
    this.message.set(null);
    this.api.importQuestions(this.game().id, file, mode).subscribe({
      next: ({ imported, data }) => {
        this.busy.set(false);
        this.message.set({ text: `${imported} question(s) importée(s) depuis « ${file.name} »${mode === 'append' ? ', ajoutées à la suite' : ''}. Vérifiez-les ci-dessous.`, ok: true });
        this.changed.emit(data);
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
      },
    });
  }

  protected openEditor(q: GameQuestion | null): void {
    this.editingId = q?.id ?? null;
    this.form = { question: q?.question ?? '', answer: q?.answer ?? '', rubric: q?.rubric ?? '', points: q?.points ?? null };
    this.editorError.set('');
    this.editorOpen.set(true);
  }

  protected saveQuestion(): void {
    const payload = { question: this.form.question.trim(), answer: this.form.answer?.trim() || null, rubric: this.form.rubric?.trim() || null, points: this.form.points || null };
    const request = this.editingId ? this.api.updateQuestion(this.editingId, payload) : this.api.addQuestion(this.game().id, payload);
    this.busy.set(true);
    request.subscribe({
      next: (game) => {
        this.busy.set(false);
        this.editorOpen.set(false);
        this.changed.emit(game);
      },
      error: (e) => {
        this.busy.set(false);
        this.editorError.set(errorMessage(e));
      },
    });
  }

  protected async remove(q: GameQuestion): Promise<void> {
    if (await this.dialog.confirm(`Supprimer la question ${q.position} ?`, { confirmLabel: 'Supprimer', danger: true })) {
      this.run(this.api.deleteQuestion(q.id));
    }
  }

  protected run(request: Observable<Game>): void {
    this.busy.set(true);
    this.message.set(null);
    request.subscribe({
      next: (game) => {
        this.busy.set(false);
        this.changed.emit(game);
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
      },
    });
  }

  /** Modèle PDF du format reconnu à l'import. */
  protected async downloadTemplate(): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    const lines: [string, number, 'bold' | 'normal'][] = [
      ['MatchMe - Questions du match', 16, 'bold'],
      ['Gardez ce format : une rubrique (facultative), puis chaque question numérotée suivie de sa réponse.', 9, 'normal'],
      ['Les points sont facultatifs, entre parenthèses à la fin de la question.', 9, 'normal'],
      ['', 10, 'normal'],
      ['Rubrique : Questions éclair', 12, 'bold'],
      ['1. Quelle est la capitale du Sénégal ? (10 pts)', 11, 'normal'],
      ['Réponse : Dakar', 11, 'normal'],
      ['2. Quel fleuve borde la ville de Saint-Louis ? (10 pts)', 11, 'normal'],
      ['Réponse : Le fleuve Sénégal', 11, 'normal'],
      ['', 10, 'normal'],
      ['Rubrique : Culture générale', 12, 'bold'],
      ['3. Qui a écrit le roman « Une si longue lettre » ? (20 pts)', 11, 'normal'],
      ['Réponse : Mariama Bâ', 11, 'normal'],
      ['4. En quelle année le Sénégal est-il devenu indépendant ? (20 pts)', 11, 'normal'],
      ['Réponse : 1960', 11, 'normal'],
    ];
    let y = 22;
    for (const [text, size, weight] of lines) {
      pdf.setFont('helvetica', weight).setFontSize(size);
      if (text) pdf.text(text, 18, y);
      y += size < 10 ? 6 : 9;
    }
    pdf.save('modele-questions-matchme.pdf');
  }
}
