import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ROLE_LABELS } from './core/models';
import { Avatar } from './shared/avatar';
import { NotificationBell } from './shared/notification-bell';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [Icon, RouterOutlet, RouterLink, RouterLinkActive, Avatar, NotificationBell],
  template: `
    <div class="shell">
      <header class="topbar">
        <a class="brand" routerLink="/" aria-label="MatchMe, accueil">match<span>me</span><i>.</i></a>
        <button class="menu-toggle" type="button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-label="Menu"><app-icon name="menu" [size]="20" /></button>
        <nav class="nav" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Direct</a>
          <a routerLink="/competitions" routerLinkActive="active">Compétitions</a>
          <a routerLink="/amical" routerLinkActive="active">Match amical</a>
          <a routerLink="/equipes" routerLinkActive="active">Équipes</a>
          <a routerLink="/a-propos" routerLinkActive="active">À propos</a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">Admin</a>
          }
          <span class="nav-spacer"></span>
          @if (auth.user(); as user) {
            <app-notification-bell />
            <a class="nav-user" routerLink="/profil" [title]="'Mon profil · ' + user.email">
              <app-avatar [src]="user.avatar_url" [name]="user.name" [size]="30" />
              <span>{{ user.name }}</span>
            </a>
            @if (user.role !== 'user') { <span class="badge" [class.badge-admin]="user.role === 'admin'" [class.badge-ongoing]="user.role === 'manager'">{{ roleLabels[user.role] }}</span> }
            <button class="btn btn-ghost btn-sm" type="button" (click)="auth.logout()">Déconnexion</button>
          } @else {
            <a routerLink="/connexion" routerLinkActive="active">Connexion</a>
            <a class="btn btn-sm" routerLink="/inscription">Créer un compte</a>
          }
        </nav>
      </header>

      <main class="content">
        <router-outlet />
      </main>

      <footer class="page-footer">
        <span>MATCHME <i>·</i> LE PLAISIR DU JEU, LE SUIVI DU SCORE.</span>
        <span><a routerLink="/a-propos">À PROPOS</a>&nbsp;<i>·</i>&nbsp;FAIT POUR LES ESPRITS VIFS.</span>
      </footer>
    </div>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);
  protected readonly roleLabels = ROLE_LABELS;
}
