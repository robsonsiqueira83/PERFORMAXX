
export enum UserRole {
  GLOBAL = 'GLOBAL',
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
  ownerId?: string;
}

export interface Category {
  id: string;
  name: string;
  teamId: string;
}

export interface Athlete {
  id: string;
  rg: string; 
  name: string;
  photoUrl?: string;
  teamId: string;
  categoryId: string | null; // Alterado para permitir null
  position: Position;
  birthDate: string;
  responsibleName: string;
  responsibleEmail: string; 
  responsiblePhone: string;
  pendingTransferTeamId?: string | null; 
}

export const formatDateSafe = (dateString: string): string => {
    if (!dateString) return '--/--/----';
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
};

export interface FundamentalsStats {
  controle_bola: number;
  conducao: number;
  passe: number;
  recepcao: number;
  drible: number;
  finalizacao: number;
  cruzamento: number;
  desarme: number;
  interceptacao: number;
}

export interface PhysicalStats {
  velocidade: number;
  agilidade: number;
  resistencia: number;
  forca: number;
  coordenacao: number;
  mobilidade: number;
  estabilidade: number;
}

export interface TacticalStats {
  def_posicionamento: number;
  def_pressao: number;
  def_cobertura: number;
  def_fechamento: number;
  def_temporizacao: number;
  def_desarme_tatico: number;
  def_reacao: number;
  const_qualidade_passe: number;
  const_visao: number;
  const_apoios: number;
  const_mobilidade: number;
  const_circulacao: number;
  const_quebra_linhas: number;
  const_tomada_decisao: number;
  ult_movimentacao: number;
  ult_ataque_espaco: number;
  ult_1v1: number;
  ult_ultimo_passe: number;
  ult_finalizacao_eficiente: number;
  ult_ritmo: number;
  ult_bolas_paradas: number;
}

export interface HeatmapPoint {
  x: number;
  y: number;
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
  technical: FundamentalsStats;
  physical: PhysicalStats;
  tactical: TacticalStats;
  heatmapPoints?: HeatmapPoint[]; 
  notes?: string;
}

export enum EvaluationType {
  PRE_TEMPORADA = 'Pré-temporada',
  MENSUAL = 'Mensal',
  POS_LESÃO = 'Pós-lesão',
  REAVALIAÇÃO = 'Reavaliação',
  OUTRO = 'Outro'
}

export interface EvaluationSession {
  id: string;
  athleteId: string;
  date: string;
  type: EvaluationType;
  evaluatorId: string;
  scoreTecnico: number;
  scoreFisico: number;
  notes?: string;
  createdAt?: string;
}

export interface TechnicalEvaluation {
  id?: string;
  sessionId: string;
  fundamento: string;
  subfundamento: string;
  nota: number;
}

export interface PhysicalEvaluation {
  id?: string;
  sessionId: string;
  capacidade: string;
  valorBruto: string;
  scoreNormalizado: number;
}

export const canEditData = (role: UserRole): boolean => {
  return [UserRole.GLOBAL, UserRole.MASTER, UserRole.TECNICO, UserRole.AUXILIAR, UserRole.SCOUT].includes(role);
};

export const canDeleteData = (role: UserRole): boolean => {
  return role === UserRole.MASTER || role === UserRole.GLOBAL;
};

export const calculateTotalScore = (fund: FundamentalsStats, phys: PhysicalStats, tact: TacticalStats): number => {
  if (!fund || !phys || !tact) return 0;
  const fundValues = Object.values(fund);
  const physValues = Object.values(phys);
  const tactValues = Object.values(tact);
  const total = [...fundValues, ...physValues, ...tactValues].reduce((a, b) => a + (Number(b) || 0), 0);
  const divisor = fundValues.length + physValues.length + tactValues.length;
  return divisor > 0 ? total / divisor : 0;
};

export const normalizeCategoryName = (input: string): string => {
  if (!input) return '';
  const clean = input.trim().toLowerCase();
  if (clean.includes('prof') || clean === 'principal' || clean === 'adulto') return 'Profissional';
  const numMatch = clean.match(/(\d+)/);
  if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      return `Sub-${num.toString().padStart(2, '0')}`;
  }
  return input.charAt(0).toUpperCase() + input.slice(1);
};

export const getCalculatedCategory = (birthDateString: string): string => {
  if (!birthDateString) return '';
  const [birthYear, birthMonth, birthDay] = birthDateString.split('T')[0].split('-').map(Number);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  let age = currentYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) age--;
  if (age <= 7) return 'Sub-07';
  if (age <= 9) return 'Sub-09';
  if (age <= 11) return 'Sub-11';
  if (age <= 13) return 'Sub-13';
  if (age <= 15) return 'Sub-15';
  if (age <= 17) return 'Sub-17';
  if (age <= 20) return 'Sub-20';
  return 'Profissional';
};
