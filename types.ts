export enum UserRole {
  GLOBAL = 'GLOBAL', // Super Admin
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
  createdAt?: string;
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  ownerId?: string; // The Master User ID who owns this team/panel
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

// Re-purposing 'TechnicalStats' as 'FundamentalsStats'
export interface FundamentalsStats {
  controle_bola: number;
  conducao: number;
  passe: number; // Curto, médio, longo
  recepcao: number;
  drible: number;
  finalizacao: number;
  cruzamento: number;
  desarme: number;
  interceptacao: number;
}

export interface PhysicalStats {
  velocidade: number; // Aceleração e máxima
  agilidade: number; // Mudança de direção
  resistencia: number; // Aeróbica e anaeróbica
  forca: number; // Potência
  coordenacao: number; // Equilíbrio
  mobilidade: number; // Flexibilidade
  estabilidade: number; // Core
}

export interface TacticalStats {
  // Defendendo
  def_posicionamento: number;
  def_pressao: number;
  def_cobertura: number;
  def_fechamento: number; // Linhas de passe
  def_temporizacao: number;
  def_desarme_tatico: number; // Tempo certo
  def_reacao: number; // Pós-perda

  // Construindo
  const_qualidade_passe: number;
  const_visao: number;
  const_apoios: number;
  const_mobilidade: number;
  const_circulacao: number;
  const_quebra_linhas: number;
  const_tomada_decisao: number; // Sob pressão
  
  // Último Terço
  ult_movimentacao: number; // Sem bola
  ult_ataque_espaco: number;
  ult_1v1: number;
  ult_ultimo_passe: number;
  ult_finalizacao_eficiente: number;
  ult_ritmo: number; // Tomada de decisão
  ult_bolas_paradas: number;
}

export interface HeatmapPoint {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
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
  technical: FundamentalsStats; // Mapped to Fundamentals
  physical: PhysicalStats;
  tactical: TacticalStats;
  heatmapPoints?: HeatmapPoint[]; 
  notes?: string;
}

// --- PERMISSION HELPERS ---

// Can Create or Update data (Athletes, Training, etc.)
export const canEditData = (role: UserRole): boolean => {
  return [UserRole.GLOBAL, UserRole.MASTER, UserRole.TECNICO, UserRole.AUXILIAR, UserRole.SCOUT].includes(role);
};

// Can Delete data (Strictly Master based on new requirements)
export const canDeleteData = (role: UserRole): boolean => {
  return role === UserRole.MASTER || role === UserRole.GLOBAL;
};

// Can Manage System (Users, Teams, Categories creation/deletion)
export const canManageSystem = (role: UserRole): boolean => {
  return role === UserRole.MASTER || role === UserRole.GLOBAL;
};

// Helper to calculate total score
export const calculateTotalScore = (fund: FundamentalsStats, phys: PhysicalStats, tact: TacticalStats): number => {
  if (!fund || !phys || !tact) return 0;
  
  const fundValues = Object.values(fund);
  const physValues = Object.values(phys);
  const tactValues = Object.values(tact);

  const total = [...fundValues, ...physValues, ...tactValues].reduce((a, b) => a + (Number(b) || 0), 0);
  const divisor = fundValues.length + physValues.length + tactValues.length;
  
  return divisor > 0 ? total / divisor : 0;
};

// Helper to calculate category average
export const calculateCategoryAverage = (stats: any): number => {
  if (!stats) return 0;
  const values = Object.values(stats) as number[];
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + (Number(b) || 0), 0);
  return sum / values.length;
};

// Helper to calculate category based on age (Display only)
export const getCalculatedCategory = (birthDateString: string): string => {
  if (!birthDateString) return '';
  
  let birthYear, birthMonth, birthDay;
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