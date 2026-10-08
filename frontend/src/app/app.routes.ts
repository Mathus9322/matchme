import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, organizerGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.HomePage), title: 'MatchMe' },
  { path: 'a-propos', loadComponent: () => import('./pages/about').then((m) => m.AboutPage), title: 'À propos · MatchMe' },
  { path: 'connexion', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage), title: 'Connexion · MatchMe' },
  { path: 'inscription', canActivate: [guestGuard], loadComponent: () => import('./pages/register').then((m) => m.RegisterPage), title: 'Créer un compte · MatchMe' },
  { path: 'competitions', loadComponent: () => import('./pages/competitions').then((m) => m.CompetitionsPage), title: 'Compétitions · MatchMe' },
  { path: 'competitions/nouvelle', canActivate: [authGuard, organizerGuard], loadComponent: () => import('./pages/competition-form').then((m) => m.CompetitionFormPage), title: 'Nouvelle compétition · MatchMe' },
  { path: 'competitions/:id/modifier', redirectTo: ({ params }) => inject(Router).createUrlTree(['/competitions', params['id']], { queryParams: { modifier: 1 } }) },
  { path: 'competitions/:id/documents', canActivate: [authGuard], loadComponent: () => import('./pages/competition-documents').then((m) => m.CompetitionDocumentsPage), title: 'Documents · MatchMe' },
  { path: 'competitions/:id', loadComponent: () => import('./pages/competition-detail').then((m) => m.CompetitionDetailPage), title: 'Compétition · MatchMe' },
  { path: 'equipes', loadComponent: () => import('./pages/teams').then((m) => m.TeamsPage), title: 'Équipes · MatchMe' },
  { path: 'equipes/nouvelle', canActivate: [authGuard], loadComponent: () => import('./pages/team-form').then((m) => m.TeamFormPage), title: 'Nouvelle équipe · MatchMe' },
  { path: 'equipes/:id/modifier', canActivate: [authGuard], loadComponent: () => import('./pages/team-form').then((m) => m.TeamFormPage), title: 'Modifier l’équipe · MatchMe' },
  { path: 'profil', canActivate: [authGuard], loadComponent: () => import('./pages/profile').then((m) => m.ProfilePage), title: 'Mon profil · MatchMe' },
  { path: 'amical', loadComponent: () => import('./pages/friendly').then((m) => m.FriendlyPage), title: 'Match amical · MatchMe' },
  { path: 'matchs/:id', loadComponent: () => import('./pages/game-live').then((m) => m.GameLivePage), title: 'Match en direct · MatchMe' },
  { path: 'admin', canActivate: [authGuard, adminGuard], loadComponent: () => import('./pages/admin').then((m) => m.AdminPage), title: 'Administration · MatchMe' },
  { path: '**', redirectTo: '' },
];
