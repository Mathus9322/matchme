import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, organizerGuard, staffGuard } from './core/guards';


export const routes: Routes = [
  // Site public (lecture seule)
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.HomePage), title: 'MatchMe' },
  { path: 'a-propos', loadComponent: () => import('./pages/about').then((m) => m.AboutPage), title: 'À propos · MatchMe' },
  { path: 'connexion', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.LoginPage), title: 'Connexion · MatchMe' },
  { path: 'inscription', canActivate: [guestGuard], loadComponent: () => import('./pages/register').then((m) => m.RegisterPage), title: 'Créer un compte · MatchMe' },
  { path: 'competitions', loadComponent: () => import('./pages/competitions').then((m) => m.CompetitionsPage), title: 'Compétitions · MatchMe' },
  { path: 'competitions/:id', loadComponent: () => import('./pages/competition-detail').then((m) => m.CompetitionDetailPage), title: 'Compétition · MatchMe' },
  { path: 'equipes', loadComponent: () => import('./pages/teams').then((m) => m.TeamsPage), title: 'Équipes · MatchMe' },
  { path: 'equipes/:id', loadComponent: () => import('./pages/team-detail').then((m) => m.TeamDetailPage), title: 'Équipe · MatchMe' },
  { path: 'regarder', loadComponent: () => import('./pages/watch').then((m) => m.WatchPage), title: 'Regarder un match · MatchMe' },
  { path: 'regarder/:code', loadComponent: () => import('./pages/watch').then((m) => m.WatchPage), title: 'Regarder un match · MatchMe' },
  { path: 'buzzer', loadComponent: () => import('./pages/buzzer').then((m) => m.BuzzerPage), title: 'Buzzer · MatchMe' },
  { path: 'buzzer/:code', loadComponent: () => import('./pages/buzzer').then((m) => m.BuzzerPage), title: 'Buzzer · MatchMe' },
  { path: 'matchs/:id', loadComponent: () => import('./pages/game-live').then((m) => m.GameLivePage), title: 'Match en direct · MatchMe' },
  { path: 'profil', canActivate: [authGuard], loadComponent: () => import('./pages/profile').then((m) => m.ProfilePage), title: 'Mon profil · MatchMe' },

  // Espace de gestion : managers et administrateurs
  {
    path: 'gestion',
    canActivate: [staffGuard],
    loadComponent: () => import('./pages/manage/manage-layout').then((m) => m.ManageLayout),
    children: [
      { path: '', loadComponent: () => import('./pages/manage/dashboard').then((m) => m.DashboardPage), title: 'Tableau de bord · MatchMe' },
      { path: 'competitions', loadComponent: () => import('./pages/competitions').then((m) => m.CompetitionsPage), title: 'Mes compétitions · MatchMe' },
      { path: 'competitions/nouvelle', canActivate: [organizerGuard], loadComponent: () => import('./pages/competition-form').then((m) => m.CompetitionFormPage), title: 'Nouvelle compétition · MatchMe' },
      { path: 'competitions/:id/documents', loadComponent: () => import('./pages/competition-documents').then((m) => m.CompetitionDocumentsPage), title: 'Documents · MatchMe' },
      { path: 'competitions/:id', loadComponent: () => import('./pages/competition-detail').then((m) => m.CompetitionDetailPage), title: 'Gérer la compétition · MatchMe' },
      { path: 'equipes', loadComponent: () => import('./pages/teams').then((m) => m.TeamsPage), title: 'Mes équipes · MatchMe' },
      { path: 'equipes/nouvelle', canActivate: [organizerGuard], loadComponent: () => import('./pages/team-form').then((m) => m.TeamFormPage), title: 'Nouvelle équipe · MatchMe' },
      { path: 'equipes/:id', loadComponent: () => import('./pages/team-detail').then((m) => m.TeamDetailPage), title: 'Fiche équipe · MatchMe' },
      { path: 'equipes/:id/modifier', loadComponent: () => import('./pages/team-form').then((m) => m.TeamFormPage), title: 'Modifier l’équipe · MatchMe' },
      { path: 'utilisateurs', canActivate: [organizerGuard], loadComponent: () => import('./pages/manage/users').then((m) => m.ManagedUsersPage), title: 'Mes coachs · MatchMe' },
      { path: 'amical', loadComponent: () => import('./pages/friendly').then((m) => m.FriendlyPage), title: 'Match amical · MatchMe' },
      { path: 'matchs/:id', loadComponent: () => import('./pages/game-live').then((m) => m.GameLivePage), title: 'Arbitrage · MatchMe' },
      { path: 'profil', loadComponent: () => import('./pages/profile').then((m) => m.ProfilePage), title: 'Mon profil · MatchMe' },
      { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./pages/admin').then((m) => m.AdminPage), title: 'Administration · MatchMe' },
    ],
  },

  // Anciennes adresses → espace de gestion
  { path: 'competitions/nouvelle', redirectTo: '/gestion/competitions/nouvelle' },
  { path: 'competitions/:id/modifier', redirectTo: ({ params }) => inject(Router).createUrlTree(['/gestion/competitions', params['id']], { queryParams: { modifier: 1 } }) },
  { path: 'competitions/:id/documents', redirectTo: '/gestion/competitions/:id/documents' },
  { path: 'equipes/nouvelle', redirectTo: '/gestion/equipes/nouvelle' },
  { path: 'equipes/:id/modifier', redirectTo: '/gestion/equipes/:id/modifier' },
  { path: 'amical', redirectTo: '/gestion/amical' },
  { path: 'admin', redirectTo: '/gestion/admin' },
  { path: '**', redirectTo: '' },
];
