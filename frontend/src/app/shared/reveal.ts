import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/** Ajoute la classe « revealed » quand l'élément entre dans la fenêtre. */
@Directive({ selector: '[appReveal]', host: { class: 'reveal' } })
export class Reveal implements OnInit, OnDestroy {
  /** Délai d'apparition en millisecondes. */
  readonly appReveal = input<number | ''>('');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const node = this.el.nativeElement;
    const delay = this.appReveal();
    if (delay) {
      node.style.transitionDelay = `${delay}ms`;
    }
    if (typeof IntersectionObserver !== 'function') {
      node.classList.add('revealed');
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          node.classList.add('revealed');
          this.observer?.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    this.observer.observe(node);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
