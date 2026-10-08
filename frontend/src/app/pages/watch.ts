import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { Icon } from '../shared/icon';

/** Regarder un match avec son code spectateur (affiché par l'arbitre ou partagé par un proche). */
@Component({
  selector: 'app-watch',
  imports: [FormsModule, Icon],
  template: `
    <form class="card watch" (ngSubmit)="go()">
      <p class="eyebrow" style="margin: 0"><span class="live-dot"></span> Suivre en direct</p>
      <h1 class="page-title">Regarder un <em>match</em></h1>
      <p class="lead" style="margin: 0">Saisissez le code du match : vous arrivez directement sur le score en direct, sans compte.</p>
      <input class="code" name="code" [(ngModel)]="value" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC12" aria-label="Code du match" required />
      @if (error()) { <p class="alert" role="alert" style="margin: 0">{{ error() }}</p> }
      <button class="btn" type="submit" [disabled]="busy() || clean(value).length !== 5"><app-icon name="eye" [size]="16" /> Regarder le match</button>
    </form>
  `,
  styles: `
    .watch { display: grid; gap: 16px; width: min(480px, 100%); margin: 24px auto; padding: 28px; }
    .code { padding: 14px; border: 2px solid var(--line); border-radius: 14px; background: var(--paper); color: var(--ink); font-family: var(--mono); font-size: 36px; letter-spacing: .3em; text-align: center; text-transform: uppercase; }
    .code:focus { outline: none; border-color: var(--ochre); box-shadow: 0 0 0 3px rgba(234, 197, 117, .45); }
    .btn { justify-self: stretch; justify-content: center; padding: 12px; font-size: 16px; }
  `,
})
export class WatchPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  /** Code passé dans l'adresse (/regarder/ABC12), par exemple depuis un lien partagé. */
  readonly code = input<string>();
  protected value = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const code = this.clean(this.code() ?? '');
    if (code.length === 5) {
      this.value = code;
      this.go();
    }
  }

  protected clean(value: string): string {
    return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  protected go(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.watchCode(this.clean(this.value)).subscribe({
      next: ({ id }) => this.router.navigate(['/matchs', id], { replaceUrl: true }),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
