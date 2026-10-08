import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AreaService } from './core/area.service';
import { AuthService } from './core/auth.service';
import { Avatar } from './shared/avatar';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [Icon, RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  template: `
    @if (area.inManage()) {
      <!-- Espace de gestion : sa propre mise en page (menu latéral). -->
      <router-outlet />
    } @else {
      @if (auth.canOrganize()) {
        <div class="portal-bar">
          <span><app-icon name="eye" [size]="15" /> Vous consultez la <strong>vue publique</strong> du site.</span>
          <a routerLink="/gestion"><app-icon name="arrow-left" [size]="14" /> Retour à l’espace gestion</a>
        </div>
      }
      <div class="shell">
        <header class="topbar">
          <a class="brand" routerLink="/" aria-label="MatchMe, accueil">match<span>me</span><i>.</i></a>
          <button class="menu-toggle" type="button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-label="Menu"><app-icon name="menu" [size]="20" /></button>
          <nav class="nav" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Direct</a>
            <a routerLink="/competitions" routerLinkActive="active">Compétitions</a>
            <a routerLink="/equipes" routerLinkActive="active">Équipes</a>
            <a routerLink="/a-propos" routerLinkActive="active">À propos</a>
            <span class="nav-spacer"></span>
            @if (auth.user(); as user) {
              @if (auth.canOrganize()) {
                <a class="btn btn-sm" routerLink="/gestion"><app-icon name="layout-grid" [size]="14" /> Espace gestion</a>
              }
              <a class="nav-user" routerLink="/profil" [title]="'Mon profil · ' + user.email">
                <app-avatar [src]="user.avatar_url" [name]="user.name" [size]="30" />
                <span>{{ user.name }}</span>
              </a>
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
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly area = inject(AreaService);
  protected readonly menuOpen = signal(false);
}
