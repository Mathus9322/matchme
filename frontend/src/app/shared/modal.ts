import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { Icon } from './icon';

/** Fenêtre modale basée sur <dialog> : Échap, clic sur le fond et bouton « Fermer » la ferment. */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  template: `
    <dialog #dialog class="modal" [class.modal-wide]="wide()" (close)="onClose()" (click)="backdrop($event)" [attr.aria-labelledby]="'modal-title-' + uid">
      <div class="modal-box">
        <header class="modal-head">
          <div>
            @if (eyebrow()) { <p class="eyebrow" style="margin-bottom: 4px">{{ eyebrow() }}</p> }
            <h2 [id]="'modal-title-' + uid">{{ title() }}</h2>
          </div>
          <button class="modal-close" type="button" (click)="dialog.close()" aria-label="Fermer"><app-icon name="x" [size]="16" /></button>
        </header>
        <div class="modal-body"><ng-content /></div>
      </div>
    </dialog>
  `,
})
export class Modal {
  private static count = 0;
  protected readonly uid = ++Modal.count;
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  readonly wide = input(false);
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  /** Ne signale que les fermetures voulues par l'utilisateur (Échap, bouton Fermer, fond), pas celles pilotées par le parent. */
  protected onClose(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.dialog().nativeElement.close();
    }
  }
}
