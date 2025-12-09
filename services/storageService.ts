import { supabase } from './supabaseClient';
import { Athlete, Category, Staff, Team, TrainingEntry, TrainingSession, User, UserRole, Position } from '../types';
import { v4 as uuidv4 } from 'uuid';

// --- Users ---
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
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
    password: u.password // Note: In production, password checking should happen server-side/auth
  }));
};

export const saveUser = async (user: User) => {
  const dbUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    avatar_url: user.avatarUrl
  };
  const { error } = await supabase.from('users').upsert(dbUser);
  if (error) console.error('Error saving user:', error);
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
  // Convert db columns to app types
  return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo_url
  }));
};

export const saveTeam = async (team: Team) => {
  const dbTeam = {
    id: team.id,
    name: team.name,
    logo_url: team.logoUrl
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

export const ensureCategoryExists = async (teamId: string, categoryName: string): Promise<Category> => {
  // Check if exists
  const { data } = await supabase
    .from('categories')
    .select('*')
    .eq('team_id', teamId)
    .eq('name', categoryName)
    .single();

  if (data) {
    return {
        id: data.id,
        name: data.name,
        teamId: data.team_id
    };
  }

  // Create new
  const newId = uuidv4();
  const newCat = {
    id: newId,
    name: categoryName,
    team_id: teamId
  };

  const { error } = await supabase.from('categories').insert(newCat);
  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }

  return { id: newId, name: categoryName, teamId: teamId };
};

export const deleteCategory = async (id: string) => {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) console.error('Error deleting category:', error);
};

// --- Staff ---
export const getStaff = async (): Promise<Staff[]> => {
  const { data, error } = await supabase.from('staff').select('*');
  if (error) {
    console.error('Error fetching staff:', error);
    return [];
  }
  return data.map((s: any) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      email: s.email,
      phone: s.phone,
      teamIds: s.team_ids || [] // JSONB column
  }));
};

export const saveStaff = async (staff: Staff) => {
  const dbStaff = {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    email: staff.email,
    phone: staff.phone,
    team_ids: staff.teamIds
  };
  const { error } = await supabase.from('staff').upsert(dbStaff);
  if (error) console.error('Error saving staff:', error);
};

export const deleteStaff = async (id: string) => {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) console.error('Error deleting staff:', error);
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
      name: a.name,
      photoUrl: a.photo_url,
      teamId: a.team_id,
      categoryId: a.category_id,
      position: a.position as Position,
      birthDate: a.birth_date,
      responsibleName: a.responsible_name,
      responsiblePhone: a.responsible_phone
  }));
};

export const saveAthlete = async (athlete: Athlete) => {
  const dbAthlete = {
      id: athlete.id,
      name: athlete.name,
      photo_url: athlete.photoUrl,
      team_id: athlete.teamId,
      category_id: athlete.categoryId,
      position: athlete.position,
      birth_date: athlete.birthDate,
      responsible_name: athlete.responsibleName,
      responsible_phone: athlete.responsiblePhone
  };
  const { error } = await supabase.from('athletes').upsert(dbAthlete);
  if (error) console.error('Error saving athlete:', error);
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
      technical: e.technical, // JSONB auto-converts
      physical: e.physical,   // JSONB auto-converts
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
    technical: entry.technical, // stored as jsonb
    physical: entry.physical,   // stored as jsonb
    notes: entry.notes
  };
  const { error } = await supabase.from('training_entries').upsert(dbEntry);
  if (error) console.error('Error saving entry:', error);
};

export const deleteTrainingSession = async (id: string) => {
  // Cascading delete should handle entries usually, but specific to this impl:
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) console.error('Error deleting session:', error);
};

export const deleteTrainingEntry = async (id: string) => {
  const { error } = await supabase.from('training_entries').delete().eq('id', id);
  if (error) console.error('Error deleting entry:', error);
};