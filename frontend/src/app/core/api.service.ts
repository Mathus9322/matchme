import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AppNotification, Competition, PlayerStats, TeamStats, ResultSheet, ResultSheetSummary, CompetitionFormat, CompetitionStatus, Rubric, Scale, DocumentFolder, Game, GameStatus, Group, GroupStanding, PlayerRef, Stats, Standing, Team, User } from './models';

interface Data<T> {
  data: T;
}

export interface TeamPayload {
  name: string;
  city: string | null;
  players: PlayerRef[];
}

export interface CompetitionPayload {
  name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CompetitionStatus;
  format?: CompetitionFormat;
}

export interface RubricPayload extends Scale {
  name: string;
  description: string | null;
}

export interface GamePayload {
  team_a_id: number;
  team_b_id: number;
  group_id?: number | null;
  round: string | null;
  scheduled_at: string | null;
  status?: GameStatus;
}

/** Un côté d'un match amical : une équipe existante (id) ou une équipe rapide (nom + joueurs). */
export type FriendlySide = { id: number } | { name: string; players: string[] };

export interface FriendlyPayload {
  team_a: FriendlySide;
  team_b: FriendlySide;
  round: string | null;
  scheduled_at: string | null;
  start: boolean;
}

export interface UserPayload {
  name: string;
  email: string;
  role: User['role'];
  password?: string | null;
}

/** Extrait un message lisible d'une erreur de l'API Laravel. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const errors = error.error?.errors as Record<string, string[]> | undefined;
    if (errors) {
      return Object.values(errors).flat().join(' ');
    }
    if (error.error?.message) {
      return error.error.message;
    }
    if (error.status === 0) {
      return 'Serveur injoignable. Vérifiez que l’API Laravel est démarrée.';
    }
  }
  return 'Une erreur est survenue.';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private get<T>(url: string, params?: Record<string, string | number | boolean>): Observable<T> {
    return this.http.get<Data<T>>(url, { params: new HttpParams({ fromObject: params ?? {} }) }).pipe(map((r) => r.data));
  }

  // Compétitions
  competitions(params?: { mine?: boolean; status?: string }) {
    return this.get<Competition[]>('/api/competitions', params);
  }
  competition(id: number) {
    return this.http
      .get<Data<Competition> & { standings: Standing[]; group_standings: GroupStanding[] }>(`/api/competitions/${id}`)
      .pipe(map(({ data, standings, group_standings }) => ({ competition: data, standings, groupStandings: group_standings })));
  }
  createCompetition(payload: CompetitionPayload) {
    return this.http.post<Data<Competition>>('/api/competitions', payload).pipe(map((r) => r.data));
  }
  updateCompetition(id: number, payload: CompetitionPayload) {
    return this.http.put<Data<Competition>>(`/api/competitions/${id}`, payload).pipe(map((r) => r.data));
  }
  publishCompetition(id: number) {
    return this.http.post<Data<Competition>>(`/api/competitions/${id}/publish`, {}).pipe(map((r) => r.data));
  }
  finishCompetition(id: number) {
    return this.http.post<Data<Competition>>(`/api/competitions/${id}/finish`, {}).pipe(map((r) => r.data));
  }
  reopenCompetition(id: number) {
    return this.http.post<Data<Competition>>(`/api/competitions/${id}/reopen`, {}).pipe(map((r) => r.data));
  }
  deleteCompetition(id: number) {
    return this.http.delete<void>(`/api/competitions/${id}`);
  }
  attachTeams(competitionId: number, teamIds: number[]) {
    return this.http.post<{ attached: number }>(`/api/competitions/${competitionId}/teams`, { team_ids: teamIds });
  }
  detachTeam(competitionId: number, teamId: number) {
    return this.http.delete<void>(`/api/competitions/${competitionId}/teams/${teamId}`);
  }

  // Images : photo de profil, logo d'équipe, photo de joueur
  private image<T>(url: string, file: File) {
    const body = new FormData();
    body.append('image', file, file.name);
    return this.http.post<Data<T>>(url, body).pipe(map((r) => r.data));
  }
  uploadAvatar(file: File) {
    return this.image<User>('/api/auth/me/avatar', file);
  }
  removeAvatar() {
    return this.http.delete<Data<User>>('/api/auth/me/avatar').pipe(map((r) => r.data));
  }
  uploadLogo(teamId: number, file: File) {
    return this.image<Team>(`/api/teams/${teamId}/logo`, file);
  }
  removeLogo(teamId: number) {
    return this.http.delete<Data<Team>>(`/api/teams/${teamId}/logo`).pipe(map((r) => r.data));
  }
  uploadPlayerPhoto(playerId: number, file: File) {
    return this.image<PlayerRef>(`/api/players/${playerId}/photo`, file);
  }
  removePlayerPhoto(playerId: number) {
    return this.http.delete<Data<PlayerRef>>(`/api/players/${playerId}/photo`).pipe(map((r) => r.data));
  }

  // Espace de gestion
  manageOverview() {
    return this.http.get<unknown>('/api/manage/overview');
  }

  // Notifications
  notifications() {
    return this.http.get<{ data: AppNotification[]; unread_count: number }>('/api/notifications');
  }
  markNotificationRead(id: string) {
    return this.http.post<void>(`/api/notifications/${id}/read`, {});
  }
  markAllNotificationsRead() {
    return this.http.post<void>('/api/notifications/read-all', {});
  }

  // Barème et rubriques
  rubricPresets() {
    return this.get<Rubric[]>('/api/rubric-presets');
  }
  updateScoring(competitionId: number, scale: Scale) {
    return this.http.put<Data<Scale>>(`/api/competitions/${competitionId}/scoring`, scale).pipe(map((r) => r.data));
  }
  addRubric(competitionId: number, payload: RubricPayload) {
    return this.http.post<Data<Rubric>>(`/api/competitions/${competitionId}/rubrics`, payload).pipe(map((r) => r.data));
  }
  addPresetRubrics(competitionId: number, presetIds: number[]) {
    return this.http.post<{ created: number }>(`/api/competitions/${competitionId}/rubrics/presets`, { preset_ids: presetIds });
  }
  updateRubric(id: number, payload: RubricPayload) {
    return this.http.put<Data<Rubric>>(`/api/rubrics/${id}`, payload).pipe(map((r) => r.data));
  }
  deleteRubric(id: number) {
    return this.http.delete<void>(`/api/rubrics/${id}`);
  }
  moveRubric(id: number, direction: 'up' | 'down') {
    return this.http.post<void>(`/api/rubrics/${id}/move`, { direction });
  }

  // Championnat
  scheduleLeague(competitionId: number, options: { double: boolean; replace: boolean; start_at: string | null; interval_days: number }) {
    return this.http.post<{ created: number; rounds: number }>(`/api/competitions/${competitionId}/league/schedule`, options);
  }

  // Poules
  addGroup(competitionId: number, name?: string) {
    return this.http.post<Data<Group>>(`/api/competitions/${competitionId}/groups`, name ? { name } : {}).pipe(map((r) => r.data));
  }
  drawGroups(competitionId: number, count: number) {
    return this.http.post<void>(`/api/competitions/${competitionId}/groups/draw`, { count });
  }
  assignGroup(competitionId: number, teamId: number, groupId: number | null) {
    return this.http.put<void>(`/api/competitions/${competitionId}/teams/${teamId}/group`, { group_id: groupId });
  }
  renameGroup(id: number, name: string) {
    return this.http.put<void>(`/api/groups/${id}`, { name });
  }
  deleteGroup(id: number) {
    return this.http.delete<void>(`/api/groups/${id}`);
  }
  scheduleGroup(id: number) {
    return this.http.post<{ created: number }>(`/api/groups/${id}/schedule`, {});
  }

  // Dossiers de documents
  documents(competitionId: number) {
    return this.http.get<{ data: DocumentFolder[]; can_manage: boolean; max_kilobytes: number }>(`/api/competitions/${competitionId}/documents`);
  }
  uploadDocuments(competitionId: number, files: File[]) {
    const body = new FormData();
    files.forEach((file) => body.append('files[]', file, file.name));
    return this.http.post<void>(`/api/competitions/${competitionId}/documents`, body);
  }
  downloadDocument(id: number) {
    return this.http.get(`/api/documents/${id}/download`, { responseType: 'blob' });
  }
  deleteDocument(id: number) {
    return this.http.delete<void>(`/api/documents/${id}`);
  }

  // Sous-dossier Résultats : feuilles de score
  resultSheets(competitionId: number) {
    return this.get<ResultSheetSummary[]>(`/api/competitions/${competitionId}/result-sheets`);
  }
  resultSheet(id: number) {
    return this.get<ResultSheet>(`/api/result-sheets/${id}`);
  }

  // Équipes
  teams(params?: { mine?: boolean; search?: string }) {
    return this.get<Team[]>('/api/teams', params);
  }
  team(id: number) {
    return this.get<Team>(`/api/teams/${id}`);
  }
  teamStats(id: number) {
    return this.get<TeamStats>(`/api/teams/${id}/stats`);
  }
  playerStats(id: number) {
    return this.get<PlayerStats>(`/api/players/${id}/stats`);
  }
  createTeam(payload: TeamPayload) {
    return this.http.post<Data<Team>>('/api/teams', payload).pipe(map((r) => r.data));
  }
  updateTeam(id: number, payload: TeamPayload) {
    return this.http.put<Data<Team>>(`/api/teams/${id}`, payload).pipe(map((r) => r.data));
  }
  deleteTeam(id: number) {
    return this.http.delete<void>(`/api/teams/${id}`);
  }

  // Matchs
  games(params?: { status?: string; competition_id?: number; limit?: number; friendly?: boolean; mine?: boolean }) {
    return this.get<Game[]>('/api/games', params);
  }
  game(id: number) {
    return this.get<Game>(`/api/games/${id}`);
  }
  createGame(competitionId: number, payload: GamePayload) {
    return this.http.post<Data<Game>>(`/api/competitions/${competitionId}/games`, payload).pipe(map((r) => r.data));
  }
  createFriendly(payload: FriendlyPayload) {
    return this.http.post<Data<Game>>('/api/games/friendly', payload).pipe(map((r) => r.data));
  }
  updateGame(id: number, payload: GamePayload) {
    return this.http.put<Data<Game>>(`/api/games/${id}`, payload).pipe(map((r) => r.data));
  }
  deleteGame(id: number) {
    return this.http.delete<void>(`/api/games/${id}`);
  }
  startGame(id: number) {
    return this.http.post<Data<Game>>(`/api/games/${id}/start`, {}).pipe(map((r) => r.data));
  }
  finishGame(id: number) {
    return this.http.post<Data<Game>>(`/api/games/${id}/finish`, {}).pipe(map((r) => r.data));
  }
  score(id: number, teamId: number, playerId: number | null, points: number, rubricId: number | null = null) {
    return this.http
      .post<Data<Game>>(`/api/games/${id}/events`, { team_id: teamId, player_id: playerId, rubric_id: rubricId, points })
      .pipe(map((r) => r.data));
  }
  saveLineup(id: number, teamId: number, starters: number[], substitutes: number[]) {
    return this.http.put<Data<Game>>(`/api/games/${id}/lineup`, { team_id: teamId, starters, substitutes }).pipe(map((r) => r.data));
  }
  halftime(id: number) {
    return this.http.post<Data<Game>>(`/api/games/${id}/halftime`, {}).pipe(map((r) => r.data));
  }
  secondHalf(id: number) {
    return this.http.post<Data<Game>>(`/api/games/${id}/second-half`, {}).pipe(map((r) => r.data));
  }
  substitute(id: number, teamId: number, playerOutId: number, playerInId: number) {
    return this.http
      .post<Data<Game>>(`/api/games/${id}/substitutions`, { team_id: teamId, player_out_id: playerOutId, player_in_id: playerInId })
      .pipe(map((r) => r.data));
  }
  swapPlayers(id: number, teamId: number, playerAId: number, playerBId: number) {
    return this.http
      .post<Data<Game>>(`/api/games/${id}/swap`, { team_id: teamId, player_a_id: playerAId, player_b_id: playerBId })
      .pipe(map((r) => r.data));
  }
  undo(id: number) {
    return this.http.delete<Data<Game>>(`/api/games/${id}/events/last`).pipe(map((r) => r.data));
  }

  // Administration
  stats() {
    return this.get<Stats>('/api/admin/stats');
  }
  users(search = '', role = '') {
    return this.get<User[]>('/api/admin/users', { ...(search && { search }), ...(role && { role }) });
  }
  updateUser(id: number, payload: UserPayload) {
    return this.http.put<Data<User>>(`/api/admin/users/${id}`, payload).pipe(map((r) => r.data));
  }
  deleteUser(id: number) {
    return this.http.delete<void>(`/api/admin/users/${id}`);
  }
}
