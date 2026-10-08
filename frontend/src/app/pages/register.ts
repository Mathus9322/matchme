import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="narrow">
      <p class="eyebrow">Rejoignez MatchMe</p>
      <h1 class="page-title">Créer un compte</h1>
      <form class="card form" style="margin-top: 24px" (ngSubmit)="submit()">
        @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
        <label class="field"><span>Nom complet</span>
          <input name="name" [(ngModel)]="form.name" autocomplete="name" maxlength="80" required />
        </label>
        <label class="field"><span>Adresse e-mail</span>
          <input type="email" name="email" [(ngModel)]="form.email" autocomplete="email" required />
        </label>
        <label class="field"><span>Mot de passe (8 caractères minimum)</span>
          <input type="password" name="password" [(ngModel)]="form.password" autocomplete="new-password" minlength="8" required />
        </label>
        <label class="field"><span>Confirmation du mot de passe</span>
          <input type="password" name="password_confirmation" [(ngModel)]="form.password_confirmation" autocomplete="new-password" required />
        </label>
        <button class="btn" type="submit" [disabled]="loading()">{{ loading() ? 'Création…' : 'Créer mon compte' }}</button>
        <p class="muted small" style="margin: 0">Déjà inscrit ? <a routerLink="/connexion">Se connecter</a></p>
      </form>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly form = { name: '', email: '', password: '', password_confirmation: '' };
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    this.loading.set(true);
    this.error.set('');
    this.auth.register(this.form).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
