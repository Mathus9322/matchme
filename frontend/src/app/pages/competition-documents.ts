import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CompetitionDocument, DocumentFolder, ResultSheetSummary } from '../core/models';
import { ScoreSheetModal } from '../shared/score-sheet-modal';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-competition-documents',
  imports: [Icon, RouterLink, DatePipe, ScoreSheetModal],
  template: `
    <div class="page-head">
      <div>
        <p class="eyebrow"><a class="row" style="gap: 6px; display: inline-flex" [routerLink]="['/competitions', id()]"><app-icon name="arrow-left" [size]="14" /> {{ competitionName() || 'Compétition' }}</a></p>
        <h1 class="page-title">Dossiers <em>documents</em></h1>
        <p class="lead">
          Chaque participant dispose d’un dossier privé pour cette compétition : fiches d’inscription, autorisations, règlements…
          @if (canManage()) { En tant qu’organisateur, vous voyez les dossiers de tous les participants. }
          @else { Seuls vous, l’organisateur et les administrateurs y avez accès. }
        </p>
      </div>
    </div>

    @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-bottom: 16px">{{ m.text }}</p> }

    <section class="folder card results">
      <header class="folder-head">
        <span class="folder-icon results-icon"><app-icon name="trophy" [size]="24" [stroke]="1.8" /></span>
        <div>
          <h2 class="section-title">Résultats</h2>
          <span class="muted small">Feuilles de score générées automatiquement à la fin de chaque match · {{ sheets().length }} fichier(s)</span>
        </div>
      </header>
      @if (sheets().length) {
        <ul class="files">
          @for (sheet of sheets(); track sheet.id) {
            <li>
              <span class="ext sheet-ext">FDS</span>
              <div class="file-info">
                <strong>{{ sheet.title }} · {{ sheet.score }}</strong>
                <span class="muted small">{{ sheet.round || 'Match' }}@if (sheet.finished_at) { · terminé le {{ sheet.finished_at | date: 'd MMM y à HH:mm' }} }</span>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" (click)="openSheet.set(sheet.id)"><app-icon name="eye" [size]="14" /> Ouvrir</button>
              <button class="btn btn-sm" type="button" (click)="openSheet.set(sheet.id)"><app-icon name="download" [size]="14" /> PDF / PNG</button>
            </li>
          }
        </ul>
      } @else {
        <p class="muted small" style="margin: 12px 0 0">Aucun match terminé pour l’instant. La feuille de score de chaque match y sera rangée dès la fin du match.</p>
      }
    </section>

    <label class="dropzone" [class.over]="dragging()" (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="drop($event)">
      <input type="file" multiple (change)="pick($event)" [disabled]="uploading()" />
      <span class="drop-icon"><app-icon name="upload" [size]="22" /></span>
      <strong>{{ uploading() ? 'Envoi en cours…' : 'Déposez vos fichiers ici ou cliquez pour parcourir' }}</strong>
      <span class="muted small">PDF, Word, Excel, PowerPoint, OpenDocument, images, texte, CSV ou ZIP · {{ maxMb() }} Mo max par fichier · 10 fichiers à la fois</span>
    </label>

    @for (folder of folders(); track folder.user.id; let first = $first) {
      <section class="folder card">
        <header class="folder-head">
          <span class="folder-icon"><app-icon name="folder-open" [size]="26" [stroke]="1.8" /></span>
          <div>
            <h2 class="section-title">{{ first ? 'Mon dossier' : folder.user.name }}</h2>
            <span class="muted small">{{ folder.documents.length }} document(s) · {{ size(folder.total_size) }}</span>
          </div>
        </header>
        @if (folder.documents.length) {
          <ul class="files">
            @for (doc of folder.documents; track doc.id) {
              <li>
                <span class="ext">{{ extension(doc.name) }}</span>
                <div class="file-info">
                  <strong>{{ doc.name }}</strong>
                  <span class="muted small">{{ size(doc.size) }} · ajouté le {{ doc.created_at | date: 'd MMM y à HH:mm' }}</span>
                </div>
                <button class="btn btn-ghost btn-sm" type="button" (click)="download(doc)">Télécharger</button>
                <button class="btn btn-danger btn-sm" type="button" (click)="remove(doc)" [attr.aria-label]="'Supprimer ' + doc.name">Supprimer</button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted small" style="margin: 12px 0 0">Ce dossier est vide.</p>
        }
      </section>
    }

    <app-score-sheet-modal [sheetId]="openSheet()" (closed)="openSheet.set(null)" />
  `,
  styles: `
    .results { border-top: 4px solid var(--ochre); }
    .results-icon { color: var(--ochre); }
    .sheet-ext { background: var(--ochre); color: var(--ink); }
    .files li .btn { white-space: nowrap; }
    .dropzone { position: relative; display: grid; justify-items: center; gap: 8px; margin-bottom: 22px; padding: 34px 20px; border: 2px dashed var(--sand); border-radius: 14px; background: var(--surface); text-align: center; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
    .dropzone:hover, .dropzone.over { border-color: var(--ochre); background: rgba(240, 205, 135, .2); }
    .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 50%; background: var(--gold); font-size: 22px; }
    .folder { margin-bottom: 14px; }
    .folder-head { display: flex; align-items: center; gap: 12px; }
    .folder-icon { display: inline-flex; color: var(--ochre); }
    .files { margin: 14px 0 0; padding: 0; list-style: none; }
    .files li { display: grid; grid-template-columns: 52px 1fr auto auto; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
    .ext { padding: 6px 0; border-radius: 6px; background: var(--ink); color: var(--gold-light); font-family: var(--mono); font-size: 10px; font-weight: 700; text-align: center; text-transform: uppercase; }
    .file-info { display: grid; min-width: 0; gap: 2px; }
    .file-info strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 560px) { .files li { grid-template-columns: 44px 1fr; } .files li .btn { grid-column: span 1; } }
  `,
})
export class CompetitionDocumentsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  protected readonly folders = signal<DocumentFolder[]>([]);
  protected readonly sheets = signal<ResultSheetSummary[]>([]);
  protected readonly openSheet = signal<number | null>(null);
  protected readonly canManage = signal(false);
  protected readonly maxMb = signal(10);
  protected readonly competitionName = signal('');
  protected readonly uploading = signal(false);
  protected readonly dragging = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);

  ngOnInit(): void {
    this.api.competition(+this.id()).subscribe(({ competition }) => this.competitionName.set(competition.name));
    this.load();
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  protected download(doc: CompetitionDocument): void {
    this.api.downloadDocument(doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: doc.name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.message.set({ text: errorMessage(e), ok: false }),
    });
  }

  protected remove(doc: CompetitionDocument): void {
    if (confirm(`Supprimer « ${doc.name} » ?`)) {
      this.api.deleteDocument(doc.id).subscribe({
        next: () => {
          this.message.set({ text: 'Document supprimé.', ok: true });
          this.load();
        },
        error: (e) => this.message.set({ text: errorMessage(e), ok: false }),
      });
    }
  }

  protected size(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  }

  protected extension(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1, dot + 5) : 'fich';
  }

  private upload(files: File[]): void {
    if (!files.length) {
      return;
    }
    const tooBig = files.find((f) => f.size > this.maxMb() * 1024 * 1024);
    if (tooBig) {
      this.message.set({ text: `« ${tooBig.name} » dépasse ${this.maxMb()} Mo.`, ok: false });
      return;
    }
    this.uploading.set(true);
    this.message.set(null);
    this.api.uploadDocuments(+this.id(), files).subscribe({
      next: () => {
        this.uploading.set(false);
        this.message.set({ text: `${files.length} fichier(s) ajouté(s) à votre dossier.`, ok: true });
        this.load();
      },
      error: (e) => {
        this.uploading.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
      },
    });
  }

  private load(): void {
    this.api.resultSheets(+this.id()).subscribe((sheets) => this.sheets.set(sheets));
    this.api.documents(+this.id()).subscribe(({ data, can_manage, max_kilobytes }) => {
      this.folders.set(data);
      this.canManage.set(can_manage);
      this.maxMb.set(Math.round(max_kilobytes / 1024));
    });
  }
}
