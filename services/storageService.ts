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
    createdAt: u.created_at // Map DB column to type
  }));
};

export const getUserById = async (id: string): Promise<User | null> => {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error || !data) {
    return null;
  }
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
  if (error) console.error('Error saving user:', error);
  return { error };
};

export const deleteUser = async (id: string) => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) console.error('Error deleting user:', error);
};

// --- Teams ---
export const getTeams = async (): Promise<Team[]> => {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) {
    console.error('Error fetching teams:', error);
    return [];
  }
  return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo_url,
      ownerId: t.owner_id 
  }));
};

export const saveTeam = async (team: Team) => {
  const dbTeam = {
    id: team.id,
    name: team.name,
    logo_url: team.logoUrl,
    owner_id: team.ownerId
  };
  const { error } = await supabase.from('teams').upsert(dbTeam);
  if (error) console.error('Error saving team:', error);
};

export const deleteTeam = async (id: string) => {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) console.error('Error deleting team:', error);
};

// --- Categories ---
export const getCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  return data.map((c: any) => ({
      id: c.id,
      name: c.name,
      teamId: c.team_id
  }));
};

export const saveCategory = async (cat: Category) => {
  const dbCat = {
    id: cat.id,
    name: cat.name,
    team_id: cat.teamId
  };
  const { error } = await supabase.from('categories').upsert(dbCat);
  if (error) console.error('Error saving category:', error);
};

export const deleteCategory = async (id: string) => {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) console.error('Error deleting category:', error);
};

// --- Athletes ---
export const getAthletes = async (): Promise<Athlete[]> => {
  const { data, error } = await supabase.from('athletes').select('*');
  if (error) {
    console.error('Error fetching athletes:', error);
    return [];
  }
  return data.map((a: any) => ({
      id: a.id,
      rg: a.rg,
      name: a.name,
      photoUrl: a.photo_url,
      teamId: a.team_id,
      categoryId: a.category_id,
      position: a.position as Position,
      birthDate: a.birth_date,
      responsibleName: a.responsible_name,
      responsiblePhone: a.responsible_phone,
      pendingTransferTeamId: a.pending_transfer_team_id
  }));
};

export const saveAthlete = async (athlete: Athlete) => {
  const dbAthlete = {
      id: athlete.id,
      rg: athlete.rg,
      name: athlete.name,
      photo_url: athlete.photoUrl,
      team_id: athlete.teamId,
      category_id: athlete.categoryId || null,
      position: athlete.position,
      birth_date: athlete.birthDate,
      responsible_name: athlete.responsibleName,
      responsible_phone: athlete.responsiblePhone,
      pending_transfer_team_id: athlete.pendingTransferTeamId || null
  };
  
  const { data, error } = await supabase.from('athletes').upsert(dbAthlete).select();
  
  if (error) console.error('Error saving athlete:', error);
  return { data, error };
};

export const deleteAthlete = async (id: string) => {
  const { error } = await supabase.from('athletes').delete().eq('id', id);
  if (error) console.error('Error deleting athlete:', error);
};

// --- Sessions & Entries ---
export const getTrainingSessions = async (): Promise<TrainingSession[]> => {
  const { data, error } = await supabase.from('training_sessions').select('*');
  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }
  return data.map((s: any) => ({
      id: s.id,
      date: s.date,
      teamId: s.team_id,
      categoryId: s.category_id,
      description: s.description
  }));
};

export const getTrainingEntries = async (): Promise<TrainingEntry[]> => {
  const { data, error } = await supabase.from('training_entries').select('*');
  if (error) {
      console.error('Error fetching entries', error);
      return [];
  }
  return data.map((e: any) => ({
      id: e.id,
      sessionId: e.session_id,
      athleteId: e.athlete_id,
      technical: e.technical, 
      physical: e.physical,   
      tactical: e.tactical,   
      heatmapPoints: e.heatmap_points || [], 
      notes: e.notes
  }));
};

export const saveTrainingSession = async (session: TrainingSession) => {
  const dbSession = {
    id: session.id,
    date: session.date,
    team_id: session.teamId,
    category_id: session.categoryId,
    description: session.description
  };
  const { error } = await supabase.from('training_sessions').upsert(dbSession);
  if (error) console.error('Error saving session:', error);
};

export const saveTrainingEntry = async (entry: TrainingEntry) => {
  const dbEntry = {
    id: entry.id,
    session_id: entry.sessionId,
    athlete_id: entry.athleteId,
    technical: entry.technical, 
    physical: entry.physical,   
    tactical: entry.tactical,   
    heatmap_points: entry.heatmapPoints, 
    notes: entry.notes
  };
  const { error } = await supabase.from('training_entries').upsert(dbEntry);
  if (error) console.error('Error saving entry:', error);
};

export const deleteTrainingSession = async (id: string) => {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) console.error('Error deleting session:', error);
};

export const deleteTrainingEntry = async (id: string) => {
  const { error } = await supabase.from('training_entries').delete().eq('id', id);
  if (error) console.error('Error deleting entry:', error);
};

// --- NOVAS AVALIAÇÕES ESTRUTURADAS (Técnica & Física) ---

export const getEvaluationSessions = async (athleteId?: string): Promise<EvaluationSession[]> => {
  let query = supabase.from('evaluations_sessions').select('*');
  if (athleteId) query = query.eq('athlete_id', athleteId);
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching evaluation sessions:', error);
    return [];
  }
  return data.map((s: any) => ({
    id: s.id,
    athleteId: s.athlete_id,
    date: s.date,
    type: s.type,
    evaluatorId: s.evaluator_id,
    scoreTecnico: s.score_tecnico,
    scoreFisico: s.score_fisico,
    notes: s.notes,
    createdAt: s.created_at
  }));
};

export const saveEvaluationSession = async (session: EvaluationSession, technicals: TechnicalEvaluation[], physicals: PhysicalEvaluation[]) => {
  const dbSession = {
    id: session.id,
    athlete_id: session.athleteId,
    date: session.date,
    type: session.type,
    evaluator_id: session.evaluatorId,
    score_tecnico: session.scoreTecnico,
    score_fisico: session.scoreFisico,
    notes: session.notes
  };

  const { error: sessionError } = await supabase.from('evaluations_sessions').upsert(dbSession);
  if (sessionError) throw sessionError;

  // Save technicals
  if (technicals.length > 0) {
    const dbTechnicals = technicals.map(t => ({
      session_id: session.id,
      fundamento: t.fundamento,
      subfundamento: t.subfundamento,
      nota: t.nota
    }));
    // Clear old ones first to ensure sync
    await supabase.from('technical_evaluations').delete().eq('session_id', session.id);
    const { error: techError } = await supabase.from('technical_evaluations').insert(dbTechnicals);
    if (techError) throw techError;
  }

  // Save physicals
  if (physicals.length > 0) {
    const dbPhysicals = physicals.map(p => ({
      session_id: session.id,
      capacidade: p.capacidade,
      valor_bruto: p.valorBruto,
      score_normalizado: p.scoreNormalizado
    }));
    // Clear old ones first
    await supabase.from('physical_evaluations').delete().eq('session_id', session.id);
    const { error: physError } = await supabase.from('physical_evaluations').insert(dbPhysicals);
    if (physError) throw physError;
  }
};
