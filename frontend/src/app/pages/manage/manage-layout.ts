import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ROLE_LABELS } from '../../core/models';
import { Avatar } from '../../shared/avatar';
import { Icon, IconName } from '../../shared/icon';
import { NotificationBell } from '../../shared/notification-bell';

/** Espace de gestion (managers et administrateurs) : menu latéral et portail vers la vue publique. */
@Component({
  selector: 'app-manage-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon, NotificationBell],
  template: `
    <div class="manage">
      <aside class="side" [class.open]="menuOpen()">
        <div class="side-top">
          <a class="brand" routerLink="/gestion">match<span>me</span><i>.</i></a>
          <span class="space">Espace gestion</span>
          <button class="side-toggle" type="button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-label="Menu"><app-icon name="menu" [size]="20" /></button>
        </div>
        <nav (click)="menuOpen.set(false)">
          @for (item of items(); track item.link) {
            <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.exact ?? false }">
              <app-icon [name]="item.icon" [size]="18" /> {{ item.label }}
            </a>
          }
        </nav>
        <a class="portal" routerLink="/" title="Voir le site tel que le public le voit">
          <app-icon name="eye" [size]="18" />
          <span><strong>Vue publique</strong><span>Voir le site comme les visiteurs</span></span>
          <app-icon name="arrow-up-right" [size]="14" />
        </a>
        @if (auth.user(); as u) {
          <div class="me">
            <a routerLink="/gestion/profil" class="me-link">
              <app-avatar [src]="u.avatar_url" [name]="u.name" [size]="36" />
              <span><strong>{{ u.name }}</strong><span class="role">{{ roles[u.role] }}</span></span>
            </a>
            <button class="logout" type="button" (click)="auth.logout()" title="Déconnexion" aria-label="Déconnexion"><app-icon name="log-out" [size]="16" /></button>
          </div>
        }
      </aside>

      <div class="main">
        <header class="main-top">
          <app-notification-bell />
        </header>
        <main class="main-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .manage { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
    .side { position: sticky; top: 0; display: flex; flex-direction: column; gap: 18px; height: 100vh; padding: 22px 16px; background: var(--ink); color: var(--paper); overflow-y: auto; }
    .side-top { display: grid; gap: 2px; padding: 0 10px; }
    .brand { color: var(--paper); font-size: 24px; font-weight: 800; text-decoration: none; }
    .brand span { font-weight: 500; }
    .brand i { color: var(--gold); font-style: normal; }
    .space { color: var(--gold); font-family: var(--mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    .side-toggle { display: none; }
    nav { display: grid; gap: 2px; }
    nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 9px; color: rgba(246, 244, 238, .72); font-size: 14px; font-weight: 600; text-decoration: none; transition: background .15s ease, color .15s ease; }
    nav a:hover { background: rgba(240, 205, 135, .1); color: var(--paper); }
    nav a.active { background: var(--gold); color: var(--ink); }
    .portal { display: flex; align-items: center; gap: 12px; margin-top: auto; padding: 12px; border: 1px solid rgba(240, 205, 135, .3); border-radius: 12px; color: var(--paper); text-decoration: none; transition: border-color .15s ease, background .15s ease; }
    .portal:hover { border-color: var(--gold); background: rgba(240, 205, 135, .08); }
    .portal > span { display: grid; flex: 1; gap: 2px; font-size: 13px; }
    .portal > span span { color: rgba(246, 244, 238, .6); font-size: 11px; }
    .me { display: flex; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid rgba(240, 205, 135, .18); }
    .me-link { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; color: var(--paper); text-decoration: none; }
    .me-link > span { display: grid; min-width: 0; font-size: 13px; }
    .me-link strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role { color: var(--gold); font-size: 11px; }
    .logout { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(246, 244, 238, .2); border-radius: 9px; background: transparent; color: var(--paper); cursor: pointer; }
    .logout:hover { border-color: var(--rust); color: #f0a473; }
    .main { min-width: 0; background: var(--paper); }
    .main-top { display: flex; justify-content: flex-end; align-items: center; gap: 10px; height: 64px; padding: 0 clamp(16px, 3vw, 48px); border-bottom: 1px solid var(--line); }
    .main-content { padding: 28px clamp(16px, 3vw, 48px) 48px; animation: arrive .35s ease both; }
    @media (max-width: 900px) {
      .manage { grid-template-columns: 1fr; }
      .side { position: relative; height: auto; gap: 0; padding: 14px 16px; }
      .side-top { grid-template-columns: 1fr auto; align-items: center; padding: 0; }
      .space { grid-row: 2; }
      .side-toggle { display: grid; grid-row: 1 / span 2; grid-column: 2; place-items: center; width: 40px; height: 40px; border: 1px solid rgba(240, 205, 135, .3); border-radius: 9px; background: transparent; color: var(--paper); }
      nav, .portal, .me { display: none; }
      .side.open nav, .side.open .portal, .side.open .me { display: flex; }
      .side.open nav { flex-direction: column; margin-top: 14px; }
      .side.open .portal { margin-top: 12px; }
      .side.open .me { margin-top: 12px; }
      .main-top { height: 52px; padding: 0 16px; }
      .main-content { padding: 20px 16px 40px; }
    }
  `,
})
export class ManageLayout {
  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLE_LABELS;
  protected readonly menuOpen = signal(false);

  protected items(): { link: string; label: string; icon: IconName; exact?: boolean }[] {
    return [
      { link: '/gestion', label: 'Tableau de bord', icon: 'layout-grid', exact: true },
      { link: '/gestion/competitions', label: this.auth.isAdmin() ? 'Compétitions' : 'Mes compétitions', icon: 'trophy' },
      { link: '/gestion/equipes', label: this.auth.isAdmin() ? 'Équipes' : 'Mes équipes', icon: 'users' },
      { link: '/gestion/amical', label: 'Matchs amicaux', icon: 'zap' },
      ...(this.auth.isAdmin() ? [{ link: '/gestion/admin', label: 'Administration', icon: 'shield' as IconName }] : []),
      { link: '/gestion/profil', label: 'Mon profil', icon: 'user-round' as IconName },
    ];
  }
}
