import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="narrow">
      <p class="eyebrow">Bon retour</p>
      <h1 class="page-title">Connexion</h1>
      <form class="card form" style="margin-top: 24px" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <label class="field"><span>Adresse e-mail</span>
          <input type="email" name="email" [(ngModel)]="email" autocomplete="email" required />
        </label>
        <label class="field"><span>Mot de passe</span>
          <input type="password" name="password" [(ngModel)]="password" autocomplete="current-password" required />
        </label>
        <button class="btn" type="submit" [disabled]="loading()">{{ loading() ? 'Connexion…' : 'Se connecter' }}</button>
        <p class="muted small" style="margin: 0">Pas encore de compte ? <a routerLink="/inscription">Créer un compte</a></p>
      </form>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly retour = input<string>();
  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl(this.retour() || '/'),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
