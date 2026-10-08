import { Component, input, output, signal } from '@angular/core';
import { Avatar } from './avatar';
import { Icon } from './icon';

/** Aperçu d'image avec boutons « Changer » et « Retirer » ; émet le fichier choisi. */
@Component({
  selector: 'app-image-picker',
  imports: [Icon, Avatar],
  template: `
    <div class="picker" [class.compact]="compact()">
      <label class="preview" [class.square]="shape() === 'square'" [title]="'Changer ' + what()">
        <app-avatar [src]="src()" [name]="name() || '?'" [size]="size()" [shape]="shape()" />
        <span class="overlay"><app-icon name="camera" [size]="18" /></span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="pick($event)" [disabled]="busy()" [attr.aria-label]="'Choisir ' + what()" />
      </label>
      @if (!compact()) {
        <div class="actions">
          <label class="btn btn-ghost btn-sm file-btn">
            {{ src() ? 'Changer' : 'Ajouter' }} {{ what() }}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="pick($event)" [disabled]="busy()" />
          </label>
          @if (src()) { <button class="btn btn-danger btn-sm" type="button" (click)="removed.emit()" [disabled]="busy()">Retirer</button> }
          <span class="muted small">JPG, PNG, WebP ou GIF · 2 Mo max</span>
          @if (error()) { <span class="small" style="color: var(--danger)">{{ error() }}</span> }
        </div>
      }
    </div>
  `,
  styles: `
    .picker { display: flex; align-items: center; gap: 14px; }
    .preview { position: relative; display: inline-flex; border-radius: 50%; cursor: pointer; }
    .preview input, .file-btn input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .preview.square { border-radius: 22%; }
    .overlay { position: absolute; inset: 0; display: grid; place-items: center; border-radius: inherit; background: rgba(43, 34, 25, .5); color: white; font-size: 14px; opacity: 0; transition: opacity .15s ease; }
    .preview:hover .overlay, .preview:focus-within .overlay { opacity: 1; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .file-btn { position: relative; }
  `,
})
export class ImagePicker {
  readonly src = input<string | null | undefined>(null);
  readonly name = input('');
  readonly what = input('la photo');
  readonly size = input(64);
  readonly shape = input<'round' | 'square'>('round');
  readonly compact = input(false);
  readonly busy = input(false);
  readonly picked = output<File>();
  readonly removed = output<void>();
  protected readonly error = signal('');

  protected pick(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      this.error.set('Format non pris en charge.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.error.set('L’image dépasse 2 Mo.');
      return;
    }
    this.error.set('');
    this.picked.emit(file);
  }
}
