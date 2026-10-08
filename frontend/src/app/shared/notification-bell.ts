import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, EMPTY, switchMap, timer } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AppNotification } from '../core/models';
import { Icon } from './icon';

/** Cloche de notifications (rappels de match…), actualisée toutes les 30 secondes. */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon, DatePipe],
  template: `
    <button class="bell" type="button" (click)="toggle()" [attr.aria-expanded]="open()" [attr.aria-label]="'Notifications' + (unread() ? ', ' + unread() + ' non lues' : '')">
      <app-icon name="bell" [size]="18" />
      @if (unread()) { <span class="dot">{{ unread() > 9 ? '9+' : unread() }}</span> }
    </button>
    @if (open()) {
      <div class="panel" role="dialog" aria-label="Notifications">
        <header>
          <strong>Notifications</strong>
          @if (unread()) { <button type="button" class="link" (click)="readAll()">Tout marquer comme lu</button> }
        </header>
        <ul>
          @for (n of items(); track n.id) {
            <li>
              <button type="button" [class.unread]="!n.read" (click)="openItem(n)">
                <span class="n-icon"><app-icon name="alarm-clock" [size]="18" /></span>
                <span class="text">
                  <strong>{{ n.title }}</strong>
                  <span>{{ n.message }}</span>
                  <span class="time">{{ n.created_at | date: 'd MMM, HH:mm' }}</span>
                </span>
              </button>
            </li>
          } @empty {
            <li class="empty-note">Aucune notification pour l’instant. Vous serez prévenu 10 minutes avant les matchs de vos équipes.</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host { position: relative; }
    .bell { position: relative; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); cursor: pointer; }
    .bell:hover { border-color: var(--ochre); }
    .dot { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; display: grid; place-items: center; border: 2px solid var(--paper); border-radius: 999px; background: var(--rust); color: white; font-family: var(--mono); font-size: 9px; font-weight: 700; }
    .panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: min(360px, calc(100vw - 32px)); overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 20px 50px -18px rgba(43, 34, 25, .45); animation: arrive .2s ease both; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
    .link { border: 0; background: none; color: var(--rust); font-size: 12px; cursor: pointer; }
    ul { max-height: 380px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
    li button { display: flex; gap: 10px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--line); background: transparent; text-align: left; cursor: pointer; }
    li button:hover { background: rgba(240, 205, 135, .2); }
    li button.unread { background: rgba(240, 205, 135, .35); }
    .n-icon { display: inline-flex; color: var(--rust); }
    .text { display: grid; gap: 3px; font-size: 12px; line-height: 1.4; }
    .text strong { font-size: 13px; }
    .time { color: var(--muted); font-size: 11px; }
    .empty-note { padding: 18px 14px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  `,
})
export class NotificationBell {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly unread = signal(0);
  protected readonly open = signal(false);

  constructor() {
    timer(0, 30000)
      .pipe(switchMap(() => this.api.notifications().pipe(catchError(() => EMPTY))), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(({ data, unread_count }) => {
        this.items.set(data);
        this.unread.set(unread_count);
      });
  }

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.open.set(false);
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected openItem(n: AppNotification): void {
    if (!n.read) {
      this.api.markNotificationRead(n.id).subscribe();
      this.items.update((list) => list.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
      this.unread.update((c) => Math.max(0, c - 1));
    }
    this.open.set(false);
    if (n.url) {
      this.router.navigateByUrl(n.url);
    }
  }

  protected readAll(): void {
    this.api.markAllNotificationsRead().subscribe();
    this.items.update((list) => list.map((i) => ({ ...i, read: true })));
    this.unread.set(0);
  }
}
