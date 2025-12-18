
import { supabase } from './supabaseClient';
import { Athlete, Category, Team, TrainingEntry, TrainingSession, User, UserRole, Position, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation } from '../types';
import { v4 as uuidv4 } from 'uuid';

// --- USERS ---

/**
 * Fetches all users from the system.
 */
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error("Error fetching users:", error);
    return [];
  }
  return data || [];
};

/**
 * Fetches a single user by their unique ID.
 */
export const getUserById = async (id: string): Promise<User | null> => {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error) {
        console.error(`Error fetching user ${id}:`, error);
        return null;
    }
    return data;
};

/**
 * Saves or updates a user's information.
 */
export const saveUser = async (user: User) => {
  return await supabase.from('users').upsert(user);
};

/**
 * Deletes a user from the system.
 */
export const deleteUser = async (id: string) => {
  return await supabase.from('users').delete().eq('id', id);
};

// --- TEAMS ---

/**
 * Fetches all teams from the system.
 */
export const getTeams = async (): Promise<Team[]> => {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) {
    console.error("Error fetching teams:", error);
    return [];
  }
  return (data || []).map(t => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo_url,
      ownerId: t.owner_id
  }));
};

/**
 * Saves or updates team information.
 */
export const saveTeam = async (team: Team) => {
  return await supabase.from('teams').upsert({
      id: team.id,
      name: team.name,
      logo_url: team.logoUrl,
      owner_id: team.ownerId
  });
};

/**
 * Deletes a team and its associated data (handled via RLS or cascade in DB).
 */
export const deleteTeam = async (id: string) => {
  return await supabase.from('teams').delete().eq('id', id);
};

// --- CATEGORIES ---

/**
 * Fetches all categories across all teams.
 */
export const getCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
  return (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      teamId: c.team_id
  }));
};

/**
 * Saves or updates a category.
 */
export const saveCategory = async (category: Category) => {
  return await supabase.from('categories').upsert({
      id: category.id,
      name: category.name,
      team_id: category.teamId
  });
};

/**
 * Deletes a category.
 */
export const deleteCategory = async (id: string) => {
  return await supabase.from('categories').delete().eq('id', id);
};

// --- ATHLETES ---

/**
 * Fetches all athletes in the system.
 */
export const getAthletes = async (): Promise<Athlete[]> => {
  const { data, error } = await supabase.from('athletes').select('*');
  if (error) {
    console.error("Error fetching athletes:", error);
    return [];
  }
  return (data || []).map((a: any) => ({
      id: a.id,
      rg: a.rg,
      name: a.name,
      photoUrl: a.photo_url,
      teamId: a.team_id,
      categoryId: a.category_id,
      position: a.position,
      birthDate: a.birth_date,
      responsibleName: a.responsible_name,
      responsiblePhone: a.responsible_phone,
      pendingTransferTeamId: a.pending_transfer_team_id
  }));
};

/**
 * Saves or updates an athlete's profile.
 */
export const saveAthlete = async (athlete: Athlete) => {
  return await supabase.from('athletes').upsert({
      id: athlete.id,
      rg: athlete.rg,
      name: athlete.name,
      photo_url: athlete.photoUrl,
      team_id: athlete.teamId,
      category_id: athlete.categoryId,
      position: athlete.position,
      birth_date: athlete.birthDate,
      responsible_name: athlete.responsibleName,
      responsible_phone: athlete.responsiblePhone,
      pending_transfer_team_id: athlete.pendingTransferTeamId
  });
};

// --- TRAINING SESSIONS ---

/**
 * Fetches all training sessions.
 */
export const getTrainingSessions = async (): Promise<TrainingSession[]> => {
  const { data, error } = await supabase.from('training_sessions').select('*');
  if (error) {
    console.error("Error fetching training sessions:", error);
    return [];
  }
  return (data || []).map((s: any) => ({
      id: s.id,
      date: s.date,
      teamId: s.team_id,
      categoryId: s.category_id,
      description: s.description
  }));
};

/**
 * Saves or updates a training session header.
 */
export const saveTrainingSession = async (session: TrainingSession) => {
  return await supabase.from('training_sessions').upsert({
      id: session.id,
      date: session.date,
      team_id: session.teamId,
      category_id: session.categoryId,
      description: session.description
  });
};

// --- TRAINING ENTRIES ---

/**
 * Fetches performance data entries for individual athletes across sessions.
 */
export const getTrainingEntries = async (): Promise<TrainingEntry[]> => {
  const { data, error } = await supabase.from('training_entries').select('*');
  if (error) {
    console.error("Error fetching training entries:", error);
    return [];
  }
  return (data || []).map((e: any) => ({
      id: e.id,
      sessionId: e.session_id,
      athleteId: e.athlete_id,
      technical: e.technical,
      physical: e.physical,
      tactical: e.tactical,
      heatmapPoints: e.heatmap_points,
      notes: e.notes
  }));
};

/**
 * Saves or updates an individual athlete's performance metrics for a session.
 */
export const saveTrainingEntry = async (entry: TrainingEntry) => {
  return await supabase.from('training_entries').upsert({
      id: entry.id,
      session_id: entry.sessionId,
      athlete_id: entry.athleteId,
      technical: entry.technical,
      physical: entry.physical,
      tactical: entry.tactical,
      heatmap_points: entry.heatmapPoints,
      notes: entry.notes
  });
};

/**
 * Removes a specific performance entry.
 */
export const deleteTrainingEntry = async (id: string) => {
  return await supabase.from('training_entries').delete().eq('id', id);
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
  // 1. Gravar Cabeçalho da Sessão
  const { error: sessionError } = await supabase.from('evaluations_sessions').upsert({
    id: session.id, 
    athlete_id: session.athleteId, 
    date: session.date, 
    type: session.type,
    evaluator_id: session.evaluatorId, 
    score_tecnico: session.scoreTecnico, 
    score_fisico: session.scoreFisico, 
    notes: session.notes
  });
  
  if (sessionError) {
      console.error("Erro ao salvar evaluations_sessions:", sessionError);
      throw sessionError;
  }

  // 2. Gravar Detalhes Técnicos (Deletar antigos e inserir novos para evitar duplicatas em edições)
  if (technicals.length > 0) {
    await supabase.from('technical_evaluations').delete().eq('session_id', session.id);
    const { error: tError } = await supabase.from('technical_evaluations').insert(
        technicals.map(t => ({ 
            session_id: session.id, 
            fundamento: t.fundamento, 
            subfundamento: t.subfundamento, 
            nota: t.nota 
        }))
    );
    if (tError) throw tError;
  }

  // 3. Gravar Detalhes Físicos
  if (physicals.length > 0) {
    await supabase.from('physical_evaluations').delete().eq('session_id', session.id);
    const { error: pError } = await supabase.from('physical_evaluations').insert(
        physicals.map(p => ({ 
            session_id: session.id, 
            capacidade: p.capacidade, 
            valor_bruto: p.valorBruto, 
            score_normalizado: p.scoreNormalizado 
        }))
    );
    if (pError) throw pError;
  }
};
