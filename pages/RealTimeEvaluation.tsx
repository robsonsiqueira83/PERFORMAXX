
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTeams, getCategories } from '../services/storageService';
import { Athlete, TrainingEntry, Team, Category, User, UserRole, Position } from '../types';
import { ArrowLeft, Play, Pause, XCircle, CheckCircle, StopCircle, Flag, UserPlus, Users, X, Plus, Search, Loader2, AlertTriangle, AlertCircle, RefreshCw, Activity, Rocket, Shield, Zap, ShieldAlert, Trophy, Footprints, Mic, MicOff, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// --- CONFIGURAÇÃO DO ALGORITMO TÁTICO ---

type GamePhase = 'OFENSIVA' | 'DEFENSIVA' | 'TRANSICAO_OF' | 'TRANSICAO_DEF';
type GameResult = 'POSITIVA' | 'NEUTRA' | 'NEGATIVA';

const RESULT_BASE: Record<GameResult, number> = {
    'POSITIVA': 1,
    'NEUTRA': 0,
    'NEGATIVA': -1
};

const PHASE_WEIGHTS: Record<GamePhase, number> = {
    'OFENSIVA': 1.0,
    'DEFENSIVA': 1.2,
    'TRANSICAO_OF': 1.4,
    'TRANSICAO_DEF': 1.5
};

const ACTION_WEIGHTS: Record<string, number> = {
    // Organização Ofensiva (Atualizado com Novos Campos)
    'Gol': 3.0, // Impacto Máximo
    'Assistência': 2.5, // Impacto Muito Alto
    'Finalização Positiva': 2.0, // Impacto Alto
    'Finalização Negativa': 1.2, // Impacto Moderado (será negativo se o resultado for negativo)
    'Apoio': 0.8, 'Amplitude': 0.9, 'Manutenção da posse': 0.9, 'Entrelinhas': 1.1, 'Profundidade': 1.2, 'Penetração': 1.3,
    
    // Organização Defensiva
    'Fechamento de linha': 0.9, 'Cobertura': 1.0, 'Proteção do centro': 1.1, 'Contenção': 1.1, 'Marcação ativa': 1.2, 'Pressão direta': 1.3,
    
    // Transição Ofensiva
    'Apoio imediato': 0.9, 'Pausa estratégica': 1.0, 'Passe vertical': 1.2, 'Condução progressiva': 1.3, 'Ataque ao espaço': 1.4, 'Acelerar jogo': 1.5,
    
    // Transição Defensiva
    'Recuo organizado': 1.0, 'Fechamento de passe': 1.1, 'Retardo': 1.2, 'Proteção de profundidade': 1.3, 'Pressão pós-perda': 1.4, 'Falta tática': 1.5
};

const PHASE_ACTIONS: Record<GamePhase, string[]> = {
    'OFENSIVA': ['Gol', 'Assistência', 'Finalização Positiva', 'Finalização Negativa', 'Apoio', 'Amplitude', 'Manutenção da posse', 'Entrelinhas', 'Profundidade', 'Penetração'],
    'DEFENSIVA': ['Fechamento de linha', 'Cobertura', 'Proteção do centro', 'Contenção', 'Marcação ativa', 'Pressão direta'],
    'TRANSICAO_OF': ['Apoio imediato', 'Pausa estratégica', 'Passe vertical', 'Condução progressiva', 'Ataque ao espaço', 'Acelerar jogo'],
    'TRANSICAO_DEF': ['Recuo organizado', 'Fechamento de passe', 'Retardo', 'Proteção de profundidade', 'Pressão pós-perda', 'Falta tática']
};

const PHASE_ICONS: Record<GamePhase, React.ReactNode> = {
    'OFENSIVA': <Rocket size={16} />,
    'DEFENSIVA': <Shield size={16} />,
    'TRANSICAO_OF': <Zap size={16} />,
    'TRANSICAO_DEF': <ShieldAlert size={16} />
};

const PHASE_LABELS: Record<GamePhase, string> = {
    'OFENSIVA': 'AÇÃO OFENSIVA',
    'DEFENSIVA': 'AÇÃO DEFENSIVA',
    'TRANSICAO_OF': 'TRANSIÇÃO OFENSIVA',
    'TRANSICAO_DEF': 'TRANSIÇÃO DEFENSIVA'
};

interface TacticalEvent {
    id: string;
    timestamp: string;
    seconds: number;
    period: 1 | 2;
    phase: GamePhase;
    action: string;
    result: GameResult;
    location: { x: number; y: number };
    // Dados do Backend/Algoritmo
    weightPhase: number;
    weightAction: number;
    eventScore: number;
}

const RealTimeEvaluation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [activeAthletes, setActiveAthletes] = useState<Athlete[]>([]); 
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(''); 
  const [sessionLogs, setSessionLogs] = useState<Record<string, TacticalEvent[]>>({});

  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [gamePeriod, setGamePeriod] = useState<1 | 2>(1);
  const [isHalftime, setIsHalftime] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [fieldFlipped, setFieldFlipped] = useState(false);
  const timerRef = useRef<number | null>(null);

  const [step, setStep] = useState<0 | 1 | 2>(0); 
  const [capturedLocation, setCapturedLocation] = useState<{x: number, y: number} | null>(null);
  const [capturedTime, setCapturedTime] = useState('');
  const [capturedSeconds, setCapturedSeconds] = useState(0);
  const [activePhase, setActivePhase] = useState<GamePhase>('OFENSIVA');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', title: string, message: string } | null>(null);
  const [showResultFeedback, setShowResultFeedback] = useState<GameResult | null>(null);

  // Observações e Voz
  const [observationText, setObservationText] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const currentAthlete = useMemo(() => activeAthletes.find(a => a.id === selectedAthleteId) || null, [activeAthletes, selectedAthleteId]);
  const currentEvents = useMemo(() => sessionLogs[selectedAthleteId] || [], [sessionLogs, selectedAthleteId]);

  useEffect(() => {
    const load = async () => {
      const uStr = localStorage.getItem('performax_current_user');
      setCurrentUser(uStr ? JSON.parse(uStr) : null);
      const [athletesData, teamsData] = await Promise.all([getAthletes(), getTeams()]);
      setAllAthletes(athletesData);
      setAllTeams(teamsData);
      const initialAthlete = athletesData.find(a => a.id === id);
      if (initialAthlete) {
          setActiveAthletes([initialAthlete]);
          setSelectedAthleteId(initialAthlete.id);
          setSessionLogs({ [initialAthlete.id]: [] });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    if (isRunning) {
      if (!startTime) setStartTime(new Date().toISOString()); 
      timerRef.current = window.setInterval(() => setTimer(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVoiceInput = () => {
      if (!('webkitSpeechRecognition' in window)) {
          alert("Seu navegador não suporta digitação por voz.");
          return;
      }
      
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsRecording(true);
      
      recognition.onend = () => setIsRecording(false);

      recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setObservationText(prev => (prev ? prev + ' ' : '') + transcript);
      };

      recognition.start();
  };

  const handleMainButton = () => {
      if (!isRunning && timer === 0) setIsRunning(true);
      else if (isRunning && gamePeriod === 1) { setIsRunning(false); setIsHalftime(true); }
      else if (!isRunning && isHalftime) {
          setIsHalftime(false);
          setGamePeriod(2);
          setFieldFlipped(prev => !prev); 
          setIsRunning(true);
      } else setIsRunning(!isRunning);
  };

  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isRunning || step !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setCapturedLocation({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
      setCapturedTime(formatTime(timer));
      setCapturedSeconds(timer);
      setStep(1);
  };

  const handleActionClick = (action: string) => { setPendingAction(action); setStep(2); };

  const handleResultClick = (result: GameResult) => {
      if (!pendingAction || !capturedLocation || !selectedAthleteId) return;

      const wPhase = PHASE_WEIGHTS[activePhase];
      const wAction = ACTION_WEIGHTS[pendingAction] || 1.0;
      const resVal = RESULT_BASE[result];
      
      // ALGORITMO ESPECIFICADO: nota_evento = valor_resultado * peso_fase * peso_acao
      const finalEventScore = resVal * wPhase * wAction;

      const newEvent: TacticalEvent = {
          id: uuidv4(),
          timestamp: capturedTime,
          seconds: capturedSeconds,
          period: gamePeriod,
          phase: activePhase,
          action: pendingAction,
          result: result,
          location: capturedLocation,
          weightPhase: wPhase,
          weightAction: wAction,
          eventScore: finalEventScore
      };

      setSessionLogs(prev => ({ ...prev, [selectedAthleteId]: [...(prev[selectedAthleteId] || []), newEvent] }));
      setShowResultFeedback(result);
      setTimeout(() => setShowResultFeedback(null), 800);
      setStep(0);
      setCapturedLocation(null);
      setPendingAction(null);
  };

  const handleFinishSession = async () => {
      if (!currentAthlete) return;
      setShowFinishModal(false);
      setLoading(true);

      const logs = sessionLogs[selectedAthleteId] || [];
      const totalScore = logs.reduce((acc, curr) => acc + curr.eventScore, 0);
      const avgScore = logs.length > 0 ? totalScore / logs.length : 0;
      
      // Classificação Semântica Automática
      let semanticImpact = 'neutro';
      if (avgScore > 0.60) semanticImpact = 'impacto_muito_alto';
      else if (avgScore >= 0.30) semanticImpact = 'impacto_positivo';
      else if (avgScore <= -0.60) semanticImpact = 'risco_tatico';
      else if (avgScore <= -0.30) semanticImpact = 'impacto_negativo';

      const sessionId = uuidv4();
      await saveTrainingSession({
          id: sessionId, teamId: currentAthlete.teamId, categoryId: currentAthlete.categoryId!,
          date: new Date().toISOString().split('T')[0],
          description: `Scout Tático: ${logs.length} ações. Impacto: ${semanticImpact.replace('_', ' ')}`
      });

      // Mapeamento para radar (normalizando -1.5/1.5 para escala 0-10)
      const normalizedRadarScore = Math.max(0, Math.min(10, 5 + (avgScore * 3.33)));

      await saveTrainingEntry({
          id: uuidv4(), sessionId, athleteId: currentAthlete.id,
          technical: { controle_bola: normalizedRadarScore, conducao: normalizedRadarScore, passe: normalizedRadarScore, recepcao: normalizedRadarScore, drible: normalizedRadarScore, finalizacao: normalizedRadarScore, cruzamento: normalizedRadarScore, desarme: normalizedRadarScore, interceptacao: normalizedRadarScore },
          physical: { velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5 },
          tactical: { def_posicionamento: normalizedRadarScore, def_pressao: normalizedRadarScore, def_cobertura: normalizedRadarScore, def_fechamento: normalizedRadarScore, def_temporizacao: normalizedRadarScore, def_desarme_tatico: normalizedRadarScore, def_reacao: normalizedRadarScore, const_qualidade_passe: normalizedRadarScore, const_visao: normalizedRadarScore, const_apoios: normalizedRadarScore, const_mobilidade: normalizedRadarScore, const_circulacao: normalizedRadarScore, const_quebra_linhas: normalizedRadarScore, const_tomada_decisao: normalizedRadarScore, ult_movimentacao: normalizedRadarScore, ult_ataque_espaco: normalizedRadarScore, ult_1v1: normalizedRadarScore, ult_ultimo_passe: normalizedRadarScore, ult_finalizacao_eficiente: normalizedRadarScore, ult_ritmo: normalizedRadarScore, ult_bolas_paradas: normalizedRadarScore },
          heatmapPoints: logs.map(l => l.location),
          notes: JSON.stringify({ 
              type: 'TACTICAL_ANALYSIS_V2', 
              totalScore, 
              avgScore, 
              impact: semanticImpact, 
              events: logs,
              observations: observationText // Salva as observações de texto/voz
          })
      });

      const remaining = activeAthletes.filter(a => a.id !== selectedAthleteId);
      if (remaining.length === 0) navigate(`/athletes/${currentAthlete.id}`);
      else {
          setActiveAthletes(remaining);
          setSelectedAthleteId(remaining[0].id);
          setLoading(false);
          setObservationText(''); // Limpa observações para o próximo
          setFeedback({ type: 'success', title: 'Análise Salva', message: `Dados de ${currentAthlete.name} processados.` });
          setTimeout(() => setFeedback(null), 2000);
      }
  };

  const btnState = useMemo(() => {
      if (!isRunning && timer === 0) return { text: "Iniciar", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 1) return { text: "Intervalo", icon: <Flag size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      if (isHalftime) return { text: "2º Tempo", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 2) return { text: "Pausar", icon: <Pause size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      return { text: "Retomar", icon: <Play size={20} />, color: "bg-blue-600 hover:bg-blue-700" };
  }, [isRunning, timer, gamePeriod, isHalftime]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-darkBase transition-colors"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-darkBase pb-40 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-darkCard p-4 shadow-sm border-b border-gray-100 dark:border-darkBorder flex items-center justify-between sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><ArrowLeft size={24} /></button>
              {currentAthlete && (
                  <div className="flex items-center gap-3">
                      {currentAthlete.photoUrl ? <img src={currentAthlete.photoUrl} className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-darkBorder shadow-sm" alt="" /> : <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-darkInput flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 text-sm border dark:border-darkBorder">{currentAthlete.name.charAt(0)}</div>}
                      <div>
                          <h1 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-none truncate max-w-[150px]">{currentAthlete.name}</h1>
                          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-widest">{currentAthlete.position}</p>
                      </div>
                  </div>
              )}
          </div>
          <div className="flex items-center gap-2">
              <div className={`flex flex-col items-center px-4 py-1 rounded-xl border-2 transition-all ${isRunning ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-gray-100 dark:bg-darkInput text-gray-400 dark:text-gray-600 border-gray-200 dark:border-darkBorder'}`}>
                  <span className="text-[8px] font-black uppercase tracking-widest mb-0.5">{isHalftime ? 'Intervalo' : `${gamePeriod}º Tempo`}</span>
                  <span className="font-mono text-xl font-black leading-none">{formatTime(timer)}</span>
              </div>
              <button onClick={handleMainButton} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-white text-sm font-black shadow-md active:scale-95 uppercase ${btnState.color} transition-all`}>
                  {btnState.icon} <span className="hidden sm:inline">{btnState.text}</span>
              </button>
          </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
          {/* Campo */}
          <div className="relative w-full aspect-[16/8] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner select-none transition-all">
              <div className={`absolute inset-0 z-0 ${isRunning && step === 0 ? 'cursor-crosshair' : ''}`} onClick={handleFieldClick}>
                  <div className="absolute inset-4 border-2 border-white/50 rounded-sm pointer-events-none"></div>
                  <div className="absolute left-4 top-1/2 w-16 h-32 border-2 border-white/40 border-l-0 transform -translate-y-1/2 pointer-events-none"></div>
                  <div className="absolute right-4 top-1/2 w-16 h-32 border-2 border-white/40 border-r-0 transform -translate-y-1/2 pointer-events-none"></div>
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/50 pointer-events-none"></div>
                  <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                  <div className="absolute bottom-4 left-10 text-white/60 font-black text-xl md:text-3xl uppercase tracking-tighter">{fieldFlipped ? 'ATAQUE' : 'DEFESA'}</div>
                  <div className="absolute bottom-4 right-10 text-white/60 font-black text-xl md:text-3xl uppercase tracking-tighter">{fieldFlipped ? 'DEFESA' : 'ATAQUE'}</div>
                  {capturedLocation && <div className="absolute w-8 h-8 bg-yellow-400 border-4 border-white rounded-full shadow-2xl transform -translate-x-1/2 -translate-y-1/2 z-20 animate-ping-once" style={{ left: `${capturedLocation.x}%`, top: `${capturedLocation.y}%` }} />}
                  {currentEvents.map(evt => <div key={evt.id} className={`absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-60 ${evt.result === 'POSITIVA' ? 'bg-green-300' : evt.result === 'NEGATIVA' ? 'bg-red-400' : 'bg-white'}`} style={{ left: `${evt.location.x}%`, top: `${evt.location.y}%` }} />)}
              </div>
              {showResultFeedback && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center animate-ping-once bg-white/10 pointer-events-none">
                      <div className={`text-4xl font-black uppercase px-8 py-4 rounded-3xl shadow-2xl border-4 ${showResultFeedback === 'POSITIVA' ? 'bg-green-600 text-white' : showResultFeedback === 'NEGATIVA' ? 'bg-red-600 text-white' : 'bg-gray-600 text-white'}`}>{showResultFeedback}</div>
                  </div>
              )}
          </div>

          {/* Registro */}
          {isRunning ? (
              <div className="space-y-4 animate-fade-in">
                  {step === 0 && (
                      <div className="grid grid-cols-4 gap-2">
                          {(['OFENSIVA', 'DEFENSIVA', 'TRANSICAO_OF', 'TRANSICAO_DEF'] as GamePhase[]).map(phase => (
                              <button key={phase} onClick={() => setActivePhase(phase)} className={`py-4 rounded-xl text-[9px] md:text-[10px] font-black uppercase transition-all shadow-sm border-2 flex flex-col items-center justify-center gap-1 leading-tight ${activePhase === phase ? 'bg-gray-900 dark:bg-indigo-600 text-white border-gray-700 dark:border-indigo-400 scale-105 shadow-xl' : 'bg-white dark:bg-darkCard text-gray-400 dark:text-gray-500 border-gray-100 dark:border-darkBorder'}`}>
                                  {PHASE_ICONS[phase]} <span>{PHASE_LABELS[phase]}</span>
                              </button>
                          ))}
                      </div>
                  )}

                  {step > 0 && (
                      <div className="bg-white dark:bg-darkCard rounded-2xl shadow-xl border-2 border-blue-100 dark:border-darkBorder overflow-hidden animate-slide-up transition-colors">
                          <div className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-3 flex justify-between items-center">
                              <h3 className="font-black uppercase tracking-widest text-xs">
                                  {step === 1 ? `1. AÇÃO - ${PHASE_LABELS[activePhase]}` : '2. RESULTADO'}
                              </h3>
                              <span className="font-mono bg-black/20 px-2 py-0.5 rounded font-bold text-[10px]">{capturedTime}</span>
                          </div>
                          <div className="p-4 space-y-4">
                              {step === 1 && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {PHASE_ACTIONS[activePhase].map(action => (
                                          <button key={action} onClick={() => handleActionClick(action)} className={`py-5 px-2 rounded-xl font-black text-xs border-2 transition-all uppercase tracking-widest flex items-center justify-center gap-2 ${['Gol', 'Assistência'].includes(action) ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'bg-gray-50 dark:bg-darkInput text-gray-800 dark:text-gray-200 border-gray-100 dark:border-darkBorder hover:border-blue-400 dark:hover:border-blue-500 active:scale-95'}`}>
                                              {action === 'Gol' && <Trophy size={16} className="text-yellow-500" />}
                                              {action === 'Assistência' && <Footprints size={16} className="text-blue-500" />}
                                              {action}
                                          </button>
                                      ))}
                                  </div>
                              )}
                              {step === 2 && (
                                  <div className="grid grid-cols-3 gap-3">
                                      <button onClick={() => handleResultClick('POSITIVA')} className="bg-green-600 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 border-b-4 border-green-800 uppercase tracking-widest">POSITIVA</button>
                                      <button onClick={() => handleResultClick('NEUTRA')} className="bg-gray-500 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 border-b-4 border-gray-700 uppercase tracking-widest">NEUTRA</button>
                                      <button onClick={() => handleResultClick('NEGATIVA')} className="bg-red-600 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 border-b-4 border-red-800 uppercase tracking-widest">NEGATIVA</button>
                                  </div>
                              )}
                              <button onClick={() => {setStep(0); setCapturedLocation(null);}} className="w-full py-3 text-gray-400 dark:text-gray-500 font-black text-[10px] uppercase bg-gray-50 dark:bg-darkInput rounded-xl hover:text-red-500 transition-colors tracking-widest">Cancelar Registro</button>
                          </div>
                      </div>
                  )}

                  {step === 0 && (
                      <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                              <div className="bg-green-50 dark:bg-emerald-900/10 p-4 rounded-2xl border-2 border-green-100 dark:border-emerald-800/30 text-center"><span className="text-3xl font-black text-green-700 dark:text-emerald-400">{currentEvents.filter(e => e.result === 'POSITIVA').length}</span><p className="text-[10px] font-black text-green-600 dark:text-emerald-500 uppercase tracking-widest">Positivas</p></div>
                              <div className="bg-gray-100 dark:bg-darkInput p-4 rounded-2xl border-2 border-gray-200 dark:border-darkBorder text-center"><span className="text-3xl font-black text-gray-700 dark:text-gray-300">{currentEvents.filter(e => e.result === 'NEUTRA').length}</span><p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Neutras</p></div>
                              <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border-2 border-red-100 dark:border-red-800/30 text-center"><span className="text-3xl font-black text-red-700 dark:text-red-400">{currentEvents.filter(e => e.result === 'NEGATIVA').length}</span><p className="text-[10px] font-black text-red-600 dark:text-red-500 uppercase tracking-widest">Negativas</p></div>
                          </div>

                          <div className="bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-200 dark:border-darkBorder shadow-sm">
                              <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                  <FileText size={12}/> Observações e Notas Técnicas
                              </h3>
                              <div className="relative">
                                  <textarea 
                                      className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24"
                                      placeholder="Digite observações ou use o microfone para gravar notas..."
                                      value={observationText}
                                      onChange={(e) => setObservationText(e.target.value)}
                                  ></textarea>
                                  <button 
                                      onClick={handleVoiceInput}
                                      className={`absolute bottom-3 right-3 p-2 rounded-full transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                      title="Digitação por Voz"
                                  >
                                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          ) : (
            <div className="bg-white dark:bg-darkCard rounded-2xl p-10 text-center border-2 border-dashed border-gray-200 dark:border-darkBorder transition-colors">
                <Activity size={48} className="mx-auto text-blue-200 dark:text-gray-700 mb-4" />
                <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Pronto para a Coleta</h2>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2 max-w-xs mx-auto font-medium">Toque em "Iniciar" para monitorar o desempenho tático por eventos e pesos de impacto.</p>
            </div>
          )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkCard border-t border-gray-200 dark:border-darkBorder p-4 shadow-2xl z-40 flex flex-col md:flex-row gap-4 md:items-center md:px-8 transition-colors">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setShowCancelModal(true)} className="text-red-500 dark:text-red-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg whitespace-nowrap"><XCircle size={18} /> Cancelar</button>
              <button onClick={() => setShowAddAthleteModal(true)} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 p-3 rounded-full border border-blue-200 dark:border-blue-800 transition-colors"><UserPlus size={20} /></button>
          </div>
          <div className="flex-1 overflow-x-auto flex gap-3 pb-1 hide-scrollbar">
              {activeAthletes.map(ath => (
                  <button key={ath.id} onClick={() => setSelectedAthleteId(ath.id)} className={`flex items-center gap-2 p-2 rounded-lg border transition-all min-w-[140px] ${selectedAthleteId === ath.id ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-300' : 'bg-white dark:bg-darkInput text-gray-700 dark:text-gray-300 border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-indigo-900/20'}`}>
                      {ath.photoUrl ? <img src={ath.photoUrl} className="w-8 h-8 rounded-full object-cover" /> : <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] ${selectedAthleteId === ath.id ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border dark:border-darkBorder'}`}>{ath.name.charAt(0)}</div>}
                      <div className="flex flex-col items-start min-w-0"><span className="text-xs font-black truncate w-full uppercase tracking-tighter">{ath.name.split(' ')[0]}</span><span className={`text-[10px] font-bold ${selectedAthleteId === ath.id ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>{sessionLogs[ath.id]?.length || 0} ações</span></div>
                  </button>
              ))}
          </div>
          <button onClick={() => setShowFinishModal(true)} disabled={!currentEvents.length} className="bg-gray-900 dark:bg-emerald-600 text-white font-black py-4 px-8 rounded-2xl shadow-xl flex items-center gap-2 hover:bg-black dark:hover:bg-emerald-700 transition-all disabled:opacity-50 uppercase tracking-widest text-xs w-full md:w-auto justify-center border-b-4 border-black dark:border-emerald-800">
              <StopCircle size={20} /> Salvar Atuação
          </button>
      </div>

      {/* Modais */}
      {showFinishModal && currentAthlete && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard border dark:border-darkBorder rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center">
                 <div className="w-20 h-20 bg-green-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-darkBorder shadow-md"><CheckCircle className="text-green-600 dark:text-emerald-400" size={40} /></div>
                 <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Finalizar Análise?</h3>
                 <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">Registrar <strong>{currentEvents.length} ações</strong> para <strong>{currentAthlete.name}</strong>. O score será calculado automaticamente com base nos pesos táticos.</p>
                 <div className="flex flex-col gap-3">
                     <button onClick={handleFinishSession} className="w-full bg-blue-600 dark:bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs border-b-4 border-blue-800 dark:border-indigo-800">Confirmar e Gerar Notas</button>
                     <button onClick={() => setShowFinishModal(false)} className="w-full bg-gray-100 dark:bg-darkInput text-gray-500 dark:text-gray-400 font-black py-3 rounded-2xl text-xs uppercase tracking-widest">Voltar</button>
                 </div>
             </div>
         </div>
      )}

      {showCancelModal && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard border dark:border-darkBorder rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center">
                 <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white dark:border-darkBorder shadow-md"><AlertTriangle className="text-red-600 dark:text-red-400" size={40} /></div>
                 <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Descartar Dados?</h3>
                 <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">Todos os eventos de hoje serão perdidos permanentemente.</p>
                 <div className="flex flex-col gap-3">
                     <button onClick={() => navigate(`/athletes/${id}`)} className="w-full bg-red-600 dark:bg-red-700 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs border-b-4 border-red-900">Sim, Descartar</button>
                     <button onClick={() => setShowCancelModal(false)} className="w-full bg-gray-100 dark:bg-darkInput text-gray-500 dark:text-gray-400 font-black py-3 rounded-2xl text-xs uppercase tracking-widest">Voltar ao Jogo</button>
                 </div>
             </div>
         </div>
      )}

      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
             <div className="bg-white dark:bg-darkCard border dark:border-darkBorder rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full">
                 <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${feedback.type === 'success' ? 'bg-green-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>{feedback.type === 'success' ? <CheckCircle className="text-green-600 dark:text-emerald-400" size={24} /> : <AlertCircle className="text-red-600 dark:text-red-400" size={24} />}</div>
                 <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-1 uppercase tracking-tighter">{feedback.title}</h3>
                 <p className="text-gray-500 dark:text-gray-400 text-center text-xs font-medium">{feedback.message}</p>
             </div>
         </div>
      )}
    </div>
  );
};

export default RealTimeEvaluation;
