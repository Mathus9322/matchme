import { Component, ElementRef, Injectable, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton de confirmation en rouge. */
  danger?: boolean;
}

/** Option d'un choix : libellé du bouton, explication et valeur renvoyée. */
export interface DialogChoice<T> {
  label: string;
  detail?: string;
  value: T;
  /** Option mise en avant (choix actuel ou recommandé). */
  primary?: boolean;
}

interface DialogState extends DialogOptions {
  kind: 'confirm' | 'alert' | 'prompt' | 'choose';
  message: string;
  value: string;
  choices?: DialogChoice<unknown>[];
  resolve: (result: boolean | string | null) => void;
}

/**
 * Remplace confirm(), alert() et prompt() du navigateur, que Chrome bloque quand l'onglet
 * n'est pas au premier plan (navigateur intégré, outils de développement…).
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogState | null>(null);

  confirm(message: string, options: DialogOptions = {}): Promise<boolean> {
    return this.open('confirm', message, '', options).then((r) => r === true);
  }

  alert(message: string, options: DialogOptions = {}): Promise<void> {
    return this.open('alert', message, '', options).then(() => undefined);
  }

  prompt(message: string, value = '', options: DialogOptions = {}): Promise<string | null> {
    return this.open('prompt', message, value, options).then((r) => (typeof r === 'string' ? r : null));
  }

  /** Choix entre plusieurs options ; null si l'utilisateur annule. */
  choose<T>(message: string, choices: DialogChoice<T>[], options: DialogOptions = {}): Promise<T | null> {
    this.current()?.resolve(null);
    return new Promise((resolve) =>
      this.current.set({ kind: 'choose', message, value: '', choices, resolve: (r) => resolve(r === null ? null : (r as unknown as T)), ...options }),
    );
  }

  close(result: boolean | string | null): void {
    const state = this.current();
    this.current.set(null);
    state?.resolve(result);
  }

  private open(kind: DialogState['kind'], message: string, value: string, options: DialogOptions): Promise<boolean | string | null> {
    // Une seule boîte à la fois : la précédente est annulée.
    this.current()?.resolve(kind === 'confirm' ? false : null);
    return new Promise((resolve) => this.current.set({ kind, message, value, resolve, ...options }));
  }
}

@Component({
  selector: 'app-dialog-host',
  imports: [FormsModule],
  template: `
    @if (dialog.current(); as d) {
      <div class="backdrop" (click)="dialog.close(d.kind === 'confirm' ? false : null)" role="presentation">
        <form class="box" role="alertdialog" aria-modal="true" [attr.aria-label]="d.title || 'Confirmation'" (click)="$event.stopPropagation()" (ngSubmit)="submit(d)" (keydown.escape)="dialog.close(d.kind === 'confirm' ? false : null)">
          @if (d.title) { <h2>{{ d.title }}</h2> }
          <p>{{ d.message }}</p>
          @if (d.kind === 'prompt') { <input #field class="input" name="value" [(ngModel)]="d.value" /> }
          @if (d.kind === 'choose') {
            <div class="choices">
              @for (c of d.choices; track $index) {
                <button class="choice" [class.primary]="c.primary" type="button" (click)="pick(c.value)">
                  <strong>{{ c.label }}</strong>@if (c.detail) { <span>{{ c.detail }}</span> }
                </button>
              }
            </div>
          }
          <div class="actions">
            @if (d.kind !== 'alert') {
              <button class="btn btn-ghost" type="button" (click)="dialog.close(d.kind === 'confirm' ? false : null)">{{ d.cancelLabel || 'Annuler' }}</button>
            }
            @if (d.kind !== 'choose') {
              <button #ok class="btn" [class.btn-danger-solid]="d.danger" type="submit">{{ d.confirmLabel || (d.kind === 'alert' ? 'OK' : 'Confirmer') }}</button>
            }
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; background: rgba(43, 34, 25, .45); backdrop-filter: blur(2px); animation: fade .15s ease; }
    .box { display: grid; gap: 14px; width: min(440px, 100%); padding: 22px; border-radius: 16px; background: var(--surface); box-shadow: 0 30px 80px -24px rgba(0, 0, 0, .55); animation: pop .2s cubic-bezier(.2, .9, .3, 1.2); }
    h2 { margin: 0; font-size: 18px; }
    p { margin: 0; line-height: 1.5; white-space: pre-line; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
    .choices { display: grid; gap: 8px; }
    .choice { display: grid; gap: 3px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
    .choice:hover, .choice:focus-visible { border-color: var(--ochre); background: rgba(240, 205, 135, .25); outline: none; }
    .choice.primary { border-color: var(--ochre); box-shadow: inset 4px 0 0 var(--ochre); }
    .choice span { color: var(--muted); font-size: 13px; }
    .btn-danger-solid { background: var(--danger, #b3261e); border-color: transparent; color: white; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.94); } }
  `,
})
export class DialogHost {
  protected readonly dialog = inject(DialogService);
  private readonly ok = viewChild<ElementRef<HTMLButtonElement>>('ok');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // Focus sur le champ (prompt) ou le bouton de confirmation : Entrée valide, Échap annule.
    effect(() => {
      if (!this.dialog.current()) return;
      const target = this.field() ?? this.ok();
      setTimeout(() => target?.nativeElement.focus());
    });
  }

  protected pick(value: unknown): void {
    this.dialog.close(value as string);
  }

  protected submit(d: DialogState): void {
    if (d.kind === 'choose') return;
    this.dialog.close(d.kind === 'prompt' ? d.value : true);
  }
}
