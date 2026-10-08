import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, map, tap } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'matchme.token';

interface AuthResponse {
  token: string;
  user: User;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(readToken());
  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  /** Les managers et les administrateurs peuvent créer des compétitions. */
  readonly canOrganize = computed(() => this.isAdmin() || this.user()?.role === 'manager');
  readonly isCoach = computed(() => !!this.user()?.is_coach);
  /** Accès à l'espace de gestion : managers, administrateurs et coachs (pour leurs équipes). */
  readonly hasSpace = computed(() => this.canOrganize() || this.isCoach());

  /** « Créer mon espace » : l'utilisateur devient manager et peut organiser ses compétitions. */
  createSpace() {
    return this.http.post<{ data: User }>('/api/auth/me/space', {}).pipe(tap(({ data }) => this.user.set(data)), map(({ data }) => data));
  }

  /** Recharge le profil au démarrage si un jeton est enregistré. */
  restore(): Promise<void> {
    if (!this.token()) {
      return Promise.resolve();
    }
    return firstValueFrom(this.http.get<{ data: User }>('/api/auth/me'))
      .then(({ data }) => this.user.set(data))
      .catch(() => this.clear());
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  register(payload: { name: string; email: string; password: string; password_confirmation: string }) {
    return this.http.post<AuthResponse>('/api/auth/register', payload).pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({ error: () => undefined });
    this.clear();
    this.router.navigateByUrl('/');
  }

  private store({ token, user }: AuthResponse): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Stockage indisponible : la session reste valable jusqu'au rechargement.
    }
    this.token.set(token);
    this.user.set(user);
  }

  private clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignoré.
    }
    this.token.set(null);
    this.user.set(null);
  }
}
