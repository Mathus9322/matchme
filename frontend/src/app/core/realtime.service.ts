import { Injectable, signal } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/**
 * Temps réel (Laravel Reverb, protocole Pusher). La connexion passe par l'adresse du site
 * (le proxy relaie /app vers Reverb) : elle fonctionne aussi depuis un téléphone du réseau local.
 * Si Reverb ne répond pas, `connected` reste faux et les écrans se rafraîchissent par interrogation.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly connected = signal(false);
  private echo: Echo<'reverb'> | null = null;
  private key = '';

  /** Écoute un événement sur un canal public ; renvoie la fonction de désabonnement. */
  listen<T>(key: string, channel: string, event: string, callback: (payload: T) => void): () => void {
    const echo = this.connect(key);
    if (!echo) return () => undefined;
    echo.channel(channel).listen(event, callback);
    return () => echo.leaveChannel(channel);
  }

  private connect(key: string): Echo<'reverb'> | null {
    if (!key) return null;
    if (this.echo && this.key === key) return this.echo;
    this.echo?.disconnect();
    try {
      (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
      const secure = location.protocol === 'https:';
      const port = Number(location.port) || (secure ? 443 : 80);
      this.echo = new Echo({
        broadcaster: 'reverb',
        key,
        wsHost: location.hostname,
        wsPort: port,
        wssPort: port,
        forceTLS: secure,
        enabledTransports: ['ws', 'wss'],
      });
      this.key = key;
      const pusher = this.echo.connector.pusher;
      pusher.connection.bind('state_change', ({ current }: { current: string }) => this.connected.set(current === 'connected'));
    } catch {
      this.echo = null;
    }
    return this.echo;
  }
}
