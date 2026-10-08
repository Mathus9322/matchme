import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() || inject(Router).createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() || inject(Router).createUrlTree(['/']);
};

export const organizerGuard: CanActivateFn = () => {
  return inject(AuthService).canOrganize() || inject(Router).createUrlTree(['/competitions']);
};

export const guestGuard: CanActivateFn = () => {
  return !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
};
