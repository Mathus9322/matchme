import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() || inject(Router).createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() || inject(Router).createUrlTree(['/gestion']);
};

/** Espace de gestion : managers, administrateurs et coachs ; les autres restent sur le site public. */
export const staffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.isLoggedIn()) {
    return inject(Router).createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
  }
  return auth.hasSpace() || inject(Router).createUrlTree(['/']);
};

/** Création de compétitions et d'équipes : managers et administrateurs (pas les coachs). */
export const organizerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.canOrganize() || inject(Router).createUrlTree(['/gestion']);
};

export const guestGuard: CanActivateFn = () => {
  return !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
};
