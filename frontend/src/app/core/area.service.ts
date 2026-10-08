import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

const MANAGE = '/gestion';

/**
 * Espace courant : site public ou espace de gestion (/gestion).
 * Les liens internes passent par link() pour rester dans l'espace où l'on se trouve.
 */
@Injectable({ providedIn: 'root' })
export class AreaService {
  private readonly router = inject(Router);
  readonly inManage = signal(this.router.url.startsWith(MANAGE));
  /** Buzzer des joueurs : plein écran, sans en-tête ni pied de page. */
  readonly bare = signal(location.pathname.startsWith('/buzzer'));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.inManage.set(e.urlAfterRedirects.startsWith(MANAGE));
        this.bare.set(e.urlAfterRedirects.startsWith('/buzzer'));
      });
  }

  /** Lien dans l'espace courant : link('competitions', 3) → ['/gestion', 'competitions', 3] ou ['/competitions', 3]. */
  link(...segments: (string | number)[]): (string | number)[] {
    return this.inManage() ? [MANAGE, ...segments] : ['/', ...segments];
  }

  /** Lien explicite vers l'espace de gestion. */
  manage(...segments: (string | number)[]): (string | number)[] {
    return [MANAGE, ...segments];
  }

  /** Lien explicite vers le site public. */
  public(...segments: (string | number)[]): (string | number)[] {
    return ['/', ...segments];
  }
}
