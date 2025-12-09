export enum UserRole {
  MASTER = 'MASTER',
  TECNICO = 'Técnico',
  AUXILIAR = 'Auxiliar',
  SCOUT = 'Scout',
  PREPARADOR = 'Preparador Físico',
  MASSAGISTA = 'Massagista'
}

export enum Position {
  GOLEIRO = 'Goleiro',
  LATERAL = 'Lateral',
  ZAGUEIRO = 'Zagueiro',
  VOLANTE = 'Volante',
  MEIO_CAMPO = 'Meio-campo',
  CENTROAVANTE = 'Centroavante',
  ATACANTE = 'Atacante'
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatarUrl?: string;
  teamIds?: string[];
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  teamId: string;
}

export interface Athlete {
  id: string;
  name: string;
  photoUrl?: string;
  teamId: string;
  categoryId: string;
  position: Position;
  birthDate: string;
  responsibleName: string;
  responsiblePhone: string;
}

export interface TechnicalStats {
  controle: number;
  passe: number;
  finalizacao: number;
  drible: number;
  cabeceio: number;
  posicao: number;
}

export interface PhysicalStats {
  velocidade: number;
  agilidade: number;
  forca: number;
  resistencia: number;
  coordenacao: number;
  equilibrio: number;
}

export interface TacticalStats {
  // Construindo
  const_passe: number;
  const_jogo_costas: number;
  const_dominio: number;
  const_1v1_ofensivo: number;
  const_movimentacao: number;
  
  // Último Terço
  ult_finalizacao: number;
  ult_desmarques: number;
  ult_passes_ruptura: number;

  // Defendendo
  def_compactacao: number;
  def_recomposicao: number;
  def_salto_pressao: number;
  def_1v1_defensivo: number;
  def_duelos_aereos: number;
}

export interface TrainingSession {
  id: string;
  date: string;
  teamId: string;
  categoryId: string;
  description?: string;
}

export interface TrainingEntry {
  id: string;
  sessionId: string;
  athleteId: string;
  technical: TechnicalStats;
  physical: PhysicalStats;
  tactical?: TacticalStats; // Optional for legacy data support
  notes?: string;
}

// Helper to calculate total score
export const calculateTotalScore = (technical: TechnicalStats, physical: PhysicalStats, tactical?: TacticalStats): number => {
  const techValues = Object.values(technical);
  const physValues = Object.values(physical);
  // Handle case where tactical might be undefined for old records
  const tactValues = tactical ? Object.values(tactical) : [];

  const total = [...techValues, ...physValues, ...tactValues].reduce((a, b) => a + b, 0);
  const divisor = techValues.length + physValues.length + tactValues.length;
  
  return divisor > 0 ? total / divisor : 0;
};

// Helper to calculate score for a single category group
export const calculateCategoryAverage = (stats: any): number => {
  if (!stats) return 0;
  const values = Object.values(stats) as number[];
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
};

// Helper to calculate category based on age (Display only)
export const getCalculatedCategory = (birthDateString: string): string => {
  if (!birthDateString) return '';
  
  let birthYear, birthMonth, birthDay;

  // Normalize string to YYYY-MM-DD
  const dateOnly = birthDateString.split('T')[0];
  
  if (dateOnly.includes('-')) {
     [birthYear, birthMonth, birthDay] = dateOnly.split('-').map(Number);
  } else {
     const d = new Date(birthDateString);
     birthYear = d.getFullYear();
     birthMonth = d.getMonth() + 1;
     birthDay = d.getDate();
  }
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  
  let age = currentYear - birthYear;
  
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
      age--;
  }

  if (age <= 7) return 'Sub-07';
  if (age <= 9) return 'Sub-09';
  if (age <= 11) return 'Sub-11';
  if (age <= 13) return 'Sub-13';
  if (age <= 15) return 'Sub-15';
  if (age <= 17) return 'Sub-17';
  if (age <= 20) return 'Sub-20';
  return 'Profissional';
};