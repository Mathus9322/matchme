import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Icon } from './icon';
import { DialogService } from './dialog';

/** « Créer mon espace » : un utilisateur devient manager pour organiser ses propres compétitions. */
@Component({
  selector: 'app-create-space',
  imports: [Icon],
  template: `
    <button type="button" [class]="btnClass()" (click)="create()" [disabled]="busy()">
      <app-icon name="trophy" [size]="16" /> {{ busy() ? 'Création…' : 'Créer mon espace de compétitions' }}
    </button>
    @if (error()) { <p class="alert" role="alert" style="margin: 10px 0 0">{{ error() }}</p> }
  `,
})
export class CreateSpace {
  private readonly dialog = inject(DialogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly btnClass = input('btn');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async create(): Promise<void> {
    if (!(await this.dialog.confirm('Vous deviendrez manager : vous pourrez organiser des compétitions, créer des équipes et leur désigner un coach.', { title: 'Créer votre espace ?', confirmLabel: 'Créer mon espace' }))) return;
    this.busy.set(true);
    this.auth.createSpace().subscribe({
      next: () => this.router.navigateByUrl('/gestion'),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
