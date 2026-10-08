import { Component, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { ResultSheet } from '../core/models';
import { Icon } from './icon';
import { Modal } from './modal';
import { ScoreSheet } from './score-sheet';

/** Aperçu d'une feuille de score et export PNG / PDF (rendu dans le navigateur). */
@Component({
  selector: 'app-score-sheet-modal',
  imports: [Modal, ScoreSheet, Icon],
  template: `
    <app-modal [open]="sheetId() !== null" [wide]="true" title="Feuille de score" [eyebrow]="sheet()?.title ?? ''" (closed)="closed.emit()">
      @if (error()) { <p class="alert" role="alert" style="margin-bottom: 12px">{{ error() }}</p> }
      <div class="toolbar">
        <span class="muted small">Fichier virtuel, généré à la fin du match · dossier Résultats</span>
        <span class="row" style="gap: 8px">
          <button class="btn btn-ghost btn-sm" type="button" (click)="exportPng()" [disabled]="!sheet() || busy()"><app-icon name="download" [size]="14" /> PNG</button>
          <button class="btn btn-sm" type="button" (click)="exportPdf()" [disabled]="!sheet() || busy()"><app-icon name="file-text" [size]="14" /> PDF</button>
        </span>
      </div>
      <div class="preview">
        @if (sheet(); as s) {
          <div class="scaler"><div #page><app-score-sheet [sheet]="s" /></div></div>
        } @else {
          <p class="muted small" style="padding: 20px">Chargement…</p>
        }
      </div>
    </app-modal>
  `,
  styles: `
    .toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
    .preview { max-height: 62dvh; overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: #e9e6dc; }
    .scaler { width: 794px; margin: 16px auto; box-shadow: 0 10px 30px -14px rgba(43, 34, 25, .5); zoom: .85; }
    @media (max-width: 860px) { .scaler { zoom: .42; } }
  `,
})
export class ScoreSheetModal {
  private readonly api = inject(ApiService);
  readonly sheetId = input<number | null>(null);
  readonly closed = output<void>();
  protected readonly sheet = signal<ResultSheet | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly page = viewChild<ElementRef<HTMLElement>>('page');

  constructor() {
    effect(() => {
      const id = this.sheetId();
      this.sheet.set(null);
      this.error.set('');
      if (id !== null) {
        this.api.resultSheet(id).subscribe({ next: (s) => this.sheet.set(s), error: (e) => this.error.set(errorMessage(e)) });
      }
    });
  }

  private fileName(ext: string): string {
    const s = this.sheet()!;
    const slug = `${s.competition}-${s.title}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return `feuille-de-score-${slug}.${ext}`;
  }

  /** Rend la feuille en image haute définition (PNG pour l'image, JPEG plus léger pour le PDF), hors du zoom d'aperçu. */
  private async render(format: 'png' | 'jpeg' = 'png'): Promise<string> {
    const node = this.page()!.nativeElement;
    const { toJpeg, toPng } = await import('html-to-image');
    const options = { pixelRatio: 2, backgroundColor: '#fffdf8', cacheBust: true, style: { zoom: '1' } };
    return format === 'png' ? toPng(node, options) : toJpeg(node, { ...options, quality: 0.92 });
  }

  protected async exportPng(): Promise<void> {
    await this.run(async () => this.download(await this.render(), this.fileName('png')));
  }

  protected async exportPdf(): Promise<void> {
    await this.run(async () => {
      const [image, { jsPDF }] = await Promise.all([this.render('jpeg'), import('jspdf')]);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const width = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const props = pdf.getImageProperties(image);
      const height = (props.height * width) / props.width;
      // Feuille plus longue qu'une page : on la répartit sur plusieurs pages A4.
      for (let offset = 0; offset < height; offset += pageHeight) {
        if (offset > 0) pdf.addPage();
        pdf.addImage(image, 'JPEG', 0, -offset, width, height, undefined, 'FAST');
      }
      pdf.setProperties({ title: `Feuille de score · ${this.sheet()!.title}`, creator: 'MatchMe' });
      pdf.save(this.fileName('pdf'));
    });
  }

  private download(dataUrl: string, name: string): void {
    const link = Object.assign(document.createElement('a'), { href: dataUrl, download: name });
    link.click();
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await task();
    } catch {
      this.error.set('L’export a échoué. Réessayez.');
    } finally {
      this.busy.set(false);
    }
  }
}
