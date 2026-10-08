export type Role = 'user' | 'manager' | 'admin';
export type CompetitionStatus = 'draft' | 'open' | 'ongoing' | 'finished';
export type CompetitionFormat = 'groups' | 'league';
export type GameStatus = 'scheduled' | 'live' | 'finished';
export type GamePhase = 'first_half' | 'halftime' | 'second_half';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string | null;
  can_organize?: boolean;
  teams_count?: number;
  competitions_count?: number;
  created_at: string;
}

export interface Owner {
  id: number;
  name: string;
  avatar_url?: string | null;
}

export interface PlayerRef {
  id?: number;
  name: string;
  photo_url?: string | null;
}

export interface Team {
  id: number;
  name: string;
  city: string | null;
  logo_url?: string | null;
  owner?: Owner;
  players?: PlayerRef[];
  players_count?: number;
  group_id?: number | null;
  can_manage: boolean;
}

export interface Group {
  id: number;
  name: string;
}

export interface GroupStanding extends Group {
  standings: Standing[];
}

export interface GamePlayer {
  id: number;
  name: string;
  photo_url?: string | null;
  role?: 'starter' | 'substitute';
  on_field?: boolean;
  score: number;
}

export interface Substitution {
  id: number;
  team_id: number;
  player_out: string | null;
  player_in: string | null;
  created_at: string;
}

/** Barème : valeurs de points proposées, et leurs négatifs si les pénalités sont permises. */
export interface Scale {
  points: number[];
  penalties: boolean;
}

export interface Rubric extends Scale {
  id: number;
  name: string;
  description: string | null;
}

export interface GameSide {
  id: number;
  name: string;
  logo_url?: string | null;
  score: number;
  bonus?: number;
  players?: GamePlayer[];
  roster?: PlayerRef[];
  can_manage_team?: boolean;
  rubric_scores?: Record<number, number> | [];
}

export interface ScoreEvent {
  id: number;
  team_id: number;
  player: string | null;
  rubric: string | null;
  points: number;
  created_at: string;
}

export interface Game {
  id: number;
  round: string | null;
  status: GameStatus;
  phase?: GamePhase | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  friendly: boolean;
  group?: Group | null;
  competition?: { id: number; name: string } | null;
  owner?: Owner | null;
  /** Organisateur de la compétition, ou créateur du match amical. */
  manager?: Owner | null;
  team_a: GameSide;
  team_b: GameSide;
  events?: ScoreEvent[];
  substitutions?: Substitution[];
  result_sheet_id?: number | null;
  scoring?: Scale;
  rubrics?: Rubric[];
  can_manage?: boolean;
  updated_at: string;
}

export interface Competition {
  id: number;
  name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CompetitionStatus;
  format: CompetitionFormat;
  scoring: Scale;
  rubrics?: Rubric[];
  owner?: Owner;
  teams_count?: number;
  games_count?: number;
  teams?: Team[];
  games?: Game[];
  groups?: Group[];
  can_manage: boolean;
}

export interface Standing {
  team: { id: number; name: string; logo_url?: string | null };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points_for: number;
  points_against: number;
  points: number;
}

export interface Stats {
  users: number;
  managers: number;
  competitions: number;
  teams: number;
  players: number;
  games: number;
  live_games: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  url: string | null;
  read: boolean;
  created_at: string;
}

export interface ResultSheetSummary {
  id: number;
  game_id: number;
  title: string;
  round: string | null;
  score: string;
  finished_at: string | null;
  updated_at: string;
}

export interface SheetTeam {
  name: string;
  city: string | null;
  logo_url: string | null;
  score: number;
  bonus: number;
  players: { name: string; photo_url: string | null; role: 'starter' | 'substitute'; on_field: boolean; score: number }[];
  rubrics: number[];
  substitutions: { out: string | null; in: string | null }[];
}

/** Feuille de score figée à la fin d'un match. */
export interface ResultSheet {
  id: number;
  game_id: number;
  title: string;
  competition: string;
  format: CompetitionFormat;
  group: string | null;
  round: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  manager: string | null;
  rubrics: string[];
  team_a: SheetTeam;
  team_b: SheetTeam;
  winner: 'a' | 'b' | null;
  events: { time: string; team: 'a' | 'b'; player: string | null; rubric: string | null; points: number }[];
  generated_at: string;
}

export interface PlayerTotals {
  appearances: number;
  points: number;
  average: number;
  answers: number;
  penalties: number;
}

export interface TeamStats {
  team: { id: number; name: string; city: string | null; logo_url: string | null; owner: Owner | null; competitions: { id: number; name: string; status: CompetitionStatus }[] };
  record: { played: number; won: number; drawn: number; lost: number; points_for: number; points_against: number; win_rate: number; average_for: number; average_against: number };
  form: ('V' | 'N' | 'D')[];
  players: ({ id: number; name: string; photo_url: string | null } & PlayerTotals)[];
  top_scorer: ({ id: number; name: string; photo_url: string | null } & PlayerTotals) | null;
  recent: Game[];
  upcoming: Game[];
}

export interface PlayerMatch {
  game_id: number;
  date: string | null;
  competition: string;
  round: string | null;
  opponent: string | null;
  score: string;
  result: 'V' | 'N' | 'D';
  role: 'starter' | 'substitute' | null;
  points: number;
  answers: number;
  penalties: number;
}

export interface PlayerStats extends PlayerTotals {
  player: { id: number; name: string; photo_url: string | null };
  team: { id: number; name: string; logo_url: string | null };
  best: PlayerMatch | null;
  rubrics: { name: string; points: number; answers: number }[];
  matches: PlayerMatch[];
}

export const ROLE_LABELS: Record<Role, string> = {
  user: 'Utilisateur',
  manager: 'Manager',
  admin: 'Administrateur',
};

export const COMPETITION_STATUS_LABELS: Record<CompetitionStatus, string> = {
  draft: 'Brouillon',
  open: 'Inscriptions ouvertes',
  ongoing: 'En cours',
  finished: 'Terminée',
};

export const FORMAT_LABELS: Record<CompetitionFormat, string> = {
  groups: 'Poules',
  league: 'Championnat',
};

/** Valeurs jouables d'un barème : positives puis pénalités. */
export function scaleValues(scale: Scale): number[] {
  return scale.penalties ? [...scale.points, ...scale.points.map((p) => -p)] : [...scale.points];
}

export const PHASE_LABELS: Record<GamePhase, string> = {
  first_half: '1re mi-temps',
  halftime: 'Mi-temps',
  second_half: '2e mi-temps',
};

/** Feuille de match : 4 titulaires sur le terrain, jusqu'à 2 remplaçants. */
export const STARTERS = 4;
export const MAX_SUBSTITUTES = 2;

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  scheduled: 'Programmé',
  live: 'En direct',
  finished: 'Terminé',
};

export interface CompetitionDocument {
  id: number;
  name: string;
  mime_type: string | null;
  size: number;
  created_at: string;
}

export interface DocumentFolder {
  user: Owner;
  documents: CompetitionDocument[];
  total_size: number;
}
