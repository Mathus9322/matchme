import { Component, input } from '@angular/core';

/** Emblème MatchMe : « M » sur fond encre et point doré (comme « matchme. »). Même dessin que public/logo.svg. */
@Component({
  selector: 'app-logo',
  host: { '[style.--logo-size.px]': 'size()', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64" focusable="false">
      <rect width="64" height="64" rx="15" fill="#2b2219" />
      <path d="M12 46V19l12.5 15L37 19v27" fill="none" stroke="#f6f4ee" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="49.5" cy="41.5" r="6.5" fill="#eac575" />
    </svg>
  `,
  styles: `
    :host { display: inline-block; flex: none; width: var(--logo-size); height: var(--logo-size); line-height: 0; }
    svg { width: 100%; height: 100%; }
  `,
})
export class Logo {
  readonly size = input(32);
}
