import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  AlarmClock, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight, Bell, Camera, Check, Coffee, Dices, Download, FileText, Eye, Flag, Folder,
  FolderOpen, GripVertical, IconNode, LayoutGrid, Medal, Menu, Pencil, PencilLine, Play, Plus, RotateCcw, Rocket, Shield, Square, Star, TriangleAlert,
  Trophy, Undo2, Upload, Users, X, Zap,
} from 'lucide';

/** Icônes Lucide disponibles dans l'application, par nom. */
const ICONS = {
  'alarm-clock': AlarmClock,
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-up-right': ArrowUpRight,
  bell: Bell,
  camera: Camera,
  check: Check,
  coffee: Coffee,
  dices: Dices,
  download: Download,
  'file-text': FileText,
  eye: Eye,
  flag: Flag,
  folder: Folder,
  'folder-open': FolderOpen,
  'grip-vertical': GripVertical,
  'layout-grid': LayoutGrid,
  medal: Medal,
  menu: Menu,
  pencil: Pencil,
  'pencil-line': PencilLine,
  play: Play,
  plus: Plus,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  shield: Shield,
  square: Square,
  star: Star,
  'triangle-alert': TriangleAlert,
  trophy: Trophy,
  'undo-2': Undo2,
  upload: Upload,
  users: Users,
  x: X,
  zap: Zap,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** Icône SVG au trait, qui prend la couleur du texte (currentColor). */
@Component({
  selector: 'app-icon',
  host: { class: 'app-icon', '[style.--icon-size.px]': 'size()', '[attr.aria-hidden]': '!label() || null', '[attr.role]': "label() ? 'img' : null", '[attr.aria-label]': 'label() || null' },
  template: `<span [innerHTML]="svg()"></span>`,
  styles: `
    :host { display: inline-flex; flex: none; width: var(--icon-size, 16px); height: var(--icon-size, 16px); vertical-align: -0.15em; }
    span, span ::ng-deep svg { display: block; width: 100%; height: 100%; }
  `,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<IconName>();
  readonly size = input(16);
  readonly stroke = input(2);
  readonly label = input('');

  protected readonly svg = computed(() => {
    const children = ICONS[this.name()]
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
      .join('');
    // Contenu statique issu de la bibliothèque d'icônes, jamais d'une saisie utilisateur.
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.stroke()}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`,
    );
  });
}
