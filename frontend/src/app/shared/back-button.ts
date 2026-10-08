import { Component, inject, input } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Icon } from './icon';

/**
 * Bouton « Retour » des pages de détail : revient à la page précédente de l'application,
 * ou à la page parente `fallback` si l'on est arrivé directement (lien partagé, rechargement).
 */
@Component({
  selector: 'app-back-button',
  imports: [Icon],
  template: `
    <button type="button" class="back" (click)="back()"><app-icon name="arrow-left" [size]="16" /> {{ label() }}</button>
  `,
  styles: `
    :host { display: block; margin-bottom: 14px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px;
      border: 1px solid var(--line); border-radius: 999px; background: transparent;
      color: var(--muted); font: inherit; font-size: .9rem; cursor: pointer;
      transition: color .15s, border-color .15s, background .15s;
    }
    .back:hover { color: var(--ink); border-color: currentColor; }
  `,
})
export class BackButton {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Page parente utilisée quand il n'y a pas d'historique dans l'application. */
  readonly fallback = input<(string | number)[]>(['/']);
  readonly label = input('Retour');

  back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else this.router.navigate(this.fallback());
  }
}
