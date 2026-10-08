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

/** Espace de gestion : managers et administrateurs ; les autres restent sur le site public. */
export const staffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.isLoggedIn()) {
    return inject(Router).createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
  }
  return auth.canOrganize() || inject(Router).createUrlTree(['/']);
};

export const guestGuard: CanActivateFn = () => {
  return !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
};
