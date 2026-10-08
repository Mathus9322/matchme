import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ROLE_LABELS, User } from '../core/models';
import { ImagePicker } from '../shared/image-picker';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-profile',
  imports: [Icon, ImagePicker, RouterLink],
  template: `
    @if (auth.user(); as u) {
      <div class="medium">
        <p class="eyebrow">Mon compte</p>
        <h1 class="page-title">Mon <em>profil</em></h1>

        @if (message(); as m) { <p class="alert" [class.alert-ok]="m.ok" role="status" style="margin-top: 20px">{{ m.text }}</p> }

        <section class="card profile">
          <app-image-picker [src]="u.avatar_url" [name]="u.name" what="la photo" [size]="112" [busy]="busy()" (picked)="upload($event)" (removed)="remove()" />
          <dl>
            <div><dt>Nom</dt><dd>{{ u.name }}</dd></div>
            <div><dt>E-mail</dt><dd>{{ u.email }}</dd></div>
            <div><dt>Rôle</dt><dd>{{ roles[u.role] }}</dd></div>
          </dl>
        </section>

        <section class="card hint">
          <span class="hint-icon"><app-icon name="alarm-clock" [size]="22" /></span>
          <p class="small" style="margin: 0">
            Votre photo apparaît sur la page des matchs que vous organisez ou arbitrez.
            Vous recevez un e-mail et une notification 10 minutes avant chaque match de vos <a routerLink="/equipes">équipes</a>.
          </p>
        </section>
      </div>
    }
  `,
  styles: `
    .profile { display: grid; gap: 22px; margin-top: 24px; }
    dl { display: grid; gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--line); }
    dl div { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 12px 14px; background: var(--surface); }
    dt { color: var(--muted); font-family: var(--mono); font-size: 10px; text-transform: uppercase; }
    dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .hint { display: flex; align-items: center; gap: 14px; margin-top: 14px; }
    .hint-icon { display: inline-flex; color: var(--rust); }
  `,
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLE_LABELS;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);

  protected upload(file: File): void {
    this.save(this.api.uploadAvatar(file), 'Photo de profil mise à jour.');
  }

  protected remove(): void {
    this.save(this.api.removeAvatar(), 'Photo de profil retirée.');
  }

  private save(request: Observable<User>, success: string): void {
    this.busy.set(true);
    request.subscribe({
      next: (user) => {
        this.auth.user.set(user);
        this.busy.set(false);
        this.message.set({ text: success, ok: true });
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ text: errorMessage(e), ok: false });
      },
    });
  }
}
