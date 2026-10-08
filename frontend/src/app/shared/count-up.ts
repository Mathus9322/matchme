import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/** Anime un nombre de sa valeur précédente vers la nouvelle valeur. */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => this.animate(this.appCountUp()));
  }

  private animate(target: number): void {
    cancelAnimationFrame(this.frame);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function') {
      this.render(target);
      return;
    }
    const from = this.current;
    const start = performance.now();
    const duration = 1100;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.render(Math.round(from + (target - from) * eased));
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number): void {
    this.current = value;
    this.el.nativeElement.textContent = value.toLocaleString('fr-FR');
  }
}
