
import { supabase } from './supabaseClient';
import { Athlete, Category, Team, TrainingEntry, TrainingSession, User, UserRole, Position, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation } from '../types';
import { v4 as uuidv4 } from 'uuid';

// --- Users ---
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }
  return data.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    avatarUrl: u.avatar_url,
    password: u.password,
    teamIds: u.team_ids || [],
    createdAt: u.created_at
  }));
};

export const getUserById = async (id: string): Promise<User | null> => {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    avatarUrl: data.avatar_url,
    password: data.password,
    teamIds: data.team_ids || [],
    createdAt: data.created_at
  };
};

export const saveUser = async (user: User) => {
  const dbUser: any = {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    avatar_url: user.avatarUrl,
    team_ids: user.teamIds || [] 
  };
  const { error } = await supabase.from('users').upsert(dbUser);
  return { error };
};

export const deleteUser = async (id: string) => {
  await supabase.from('users').delete().eq('id', id);
};

// --- Teams ---
export const getTeams = async (): Promise<Team[]> => {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) return [];
  return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo_url,
      ownerId: t.owner_id 
  }));
};

export const saveTeam = async (team: Team) => {
  const dbTeam = { id: team.id, name: team.name, logo_url: team.logoUrl, owner_id: team.ownerId };
  await supabase.from('teams').upsert(dbTeam);
};

export const deleteTeam = async (id: string) => {
  await supabase.from('teams').delete().eq('id', id);
};

// --- Categories ---
export const getCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) return [];
  return data.map((c: any) => ({ id: c.id, name: c.name, teamId: c.team_id }));
};

export const saveCategory = async (cat: Category) => {
  const dbCat = { id: cat.id, name: cat.name, team_id: cat.teamId };
  await supabase.from('categories').upsert(dbCat);
};

export const deleteCategory = async (id: string) => {
  await supabase.from('categories').delete().eq('id', id);
};

// --- Athletes ---
export const getAthletes = async (): Promise<Athlete[]> => {
  const { data, error } = await supabase.from('athletes').select('*');
  if (error) return [];
  return data.map((a: any) => ({
      id: a.id, rg: a.rg, name: a.name, photoUrl: a.photo_url, teamId: a.team_id,
      categoryId: a.category_id, position: a.position as Position, birthDate: a.birth_date,
      responsibleName: a.responsible_name, responsiblePhone: a.responsible_phone,
      pendingTransferTeamId: a.pending_transfer_team_id
  }));
};

export const saveAthlete = async (athlete: Athlete) => {
  const dbAthlete = {
      id: athlete.id, rg: athlete.rg, name: athlete.name, photo_url: athlete.photoUrl,
      team_id: athlete.teamId, category_id: athlete.categoryId || null, position: athlete.position,
      birth_date: athlete.birthDate, responsible_name: athlete.responsibleName,
      responsible_phone: athlete.responsiblePhone, pending_transfer_team_id: athlete.pendingTransferTeamId || null
  };
  return await supabase.from('athletes').upsert(dbAthlete).select();
};

export const deleteAthlete = async (id: string) => {
  await supabase.from('athletes').delete().eq('id', id);
};

// --- Sessions & Entries ---
export const getTrainingSessions = async (): Promise<TrainingSession[]> => {
  const { data, error } = await supabase.from('training_sessions').select('*');
  if (error) return [];
  return data.map((s: any) => ({ id: s.id, date: s.date, teamId: s.team_id, categoryId: s.category_id, description: s.description }));
};

export const getTrainingEntries = async (): Promise<TrainingEntry[]> => {
  const { data, error } = await supabase.from('training_entries').select('*');
  if (error) return [];
  return data.map((e: any) => ({
      id: e.id, sessionId: e.session_id, athleteId: e.athlete_id, technical: e.technical, 
      physical: e.physical, tactical: e.tactical, heatmapPoints: e.heatmap_points || [], notes: e.notes
  }));
};

export const saveTrainingSession = async (session: TrainingSession) => {
  const dbSession = { id: session.id, date: session.date, team_id: session.teamId, category_id: session.categoryId, description: session.description };
  await supabase.from('training_sessions').upsert(dbSession);
};

export const saveTrainingEntry = async (entry: TrainingEntry) => {
  const dbEntry = { id: entry.id, session_id: entry.sessionId, athlete_id: entry.athleteId, technical: entry.technical, physical: entry.physical, tactical: entry.tactical, heatmap_points: entry.heatmapPoints, notes: entry.notes };
  await supabase.from('training_entries').upsert(dbEntry);
};

// Add missing deleteTrainingEntry export to fix error in pages/AthletesList.tsx
export const deleteTrainingEntry = async (id: string) => {
  await supabase.from('training_entries').delete().eq('id', id);
};

// --- NOVAS AVALIAÇÕES ESTRUTURADAS (Técnica & Física) ---

export const getEvaluationSessions = async (athleteId?: string): Promise<EvaluationSession[]> => {
  let query = supabase.from('evaluations_sessions').select('*').order('date', { ascending: false });
  if (athleteId) query = query.eq('athlete_id', athleteId);
  const { data, error } = await query;
  if (error) return [];
  return data.map((s: any) => ({
    id: s.id, athleteId: s.athlete_id, date: s.date, type: s.type, evaluatorId: s.evaluator_id,
    scoreTecnico: s.score_tecnico, scoreFisico: s.score_fisico, notes: s.notes, createdAt: s.created_at
  }));
};

export const getTechnicalEvaluations = async (sessionId: string): Promise<TechnicalEvaluation[]> => {
    const { data, error } = await supabase.from('technical_evaluations').select('*').eq('session_id', sessionId);
    if (error) return [];
    return data.map((t: any) => ({ sessionId: t.session_id, fundamento: t.fundamento, subfundamento: t.subfundamento, nota: t.nota }));
};

export const getPhysicalEvaluations = async (sessionId: string): Promise<PhysicalEvaluation[]> => {
    const { data, error } = await supabase.from('physical_evaluations').select('*').eq('session_id', sessionId);
    if (error) return [];
    return data.map((p: any) => ({ sessionId: p.session_id, capacidade: p.capacidade, valorBruto: p.valor_bruto, scoreNormalizado: p.score_normalizado }));
};

export const saveEvaluationSession = async (session: EvaluationSession, technicals: TechnicalEvaluation[], physicals: PhysicalEvaluation[]) => {
  const { error: sessionError } = await supabase.from('evaluations_sessions').upsert({
    id: session.id, athlete_id: session.athleteId, date: session.date, type: session.type,
    evaluator_id: session.evaluatorId, score_tecnico: session.scoreTecnico, score_fisico: session.scoreFisico, notes: session.notes
  });
  if (sessionError) throw sessionError;

  if (technicals.length > 0) {
    await supabase.from('technical_evaluations').delete().eq('session_id', session.id);
    await supabase.from('technical_evaluations').insert(technicals.map(t => ({ session_id: session.id, fundamento: t.fundamento, subfundamento: t.subfundamento, nota: t.nota })));
  }

  if (physicals.length > 0) {
    await supabase.from('physical_evaluations').delete().eq('session_id', session.id);
    await supabase.from('physical_evaluations').insert(physicals.map(p => ({ session_id: session.id, capacidade: p.capacidade, valor_bruto: p.valorBruto, score_normalizado: p.scoreNormalizado })));
  }
};
