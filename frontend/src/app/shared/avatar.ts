import { Component, computed, input, signal } from '@angular/core';

const TONES = [
  ['#c7902b', '#2b2219'],
  ['#ac6327', '#ffffff'],
  ['#eac575', '#2b2219'],
  ['#2b2219', '#f0cd87'],
  ['#bebdb1', '#2b2219'],
];

/** Photo ronde (personne) ou carrée arrondie (logo), avec initiales colorées à défaut d'image. */
@Component({
  selector: 'app-avatar',
  host: { '[style.--size.px]': 'size()', '[class.square]': "shape() === 'square'" },
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" [alt]="alt()" loading="lazy" (error)="failed.set(true)" />
    } @else {
      <span class="initials" [style.background]="tone()[0]" [style.color]="tone()[1]" [attr.aria-label]="alt()" role="img">{{ initials() }}</span>
    }
  `,
  styles: `
    :host { display: inline-block; flex: none; width: var(--size); height: var(--size); overflow: hidden; border-radius: 50%; vertical-align: middle; }
    :host(.square) { border-radius: 22%; }
    img, .initials { width: 100%; height: 100%; }
    img { display: block; object-fit: cover; background: var(--surface); }
    .initials { display: grid; place-items: center; font-family: var(--mono); font-size: calc(var(--size) * .38); font-weight: 700; letter-spacing: -.02em; user-select: none; }
  `,
})
export class Avatar {
  readonly src = input<string | null | undefined>(null);
  readonly name = input.required<string>();
  readonly size = input(36);
  readonly shape = input<'round' | 'square'>('round');
  readonly label = input('');
  protected readonly failed = signal(false);
  protected readonly alt = computed(() => this.label() || this.name());

  protected readonly initials = computed(() => {
    const words = this.name().replace(/[()]/g, '').split(/[\s-]+/).filter((w) => w && !/^(de|du|des|la|le|les|d’|l’)$/i.test(w));
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  });

  /** Couleur stable dérivée du nom. */
  protected readonly tone = computed(() => {
    let hash = 0;
    for (const char of this.name()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return TONES[Math.abs(hash) % TONES.length];
  });
}
