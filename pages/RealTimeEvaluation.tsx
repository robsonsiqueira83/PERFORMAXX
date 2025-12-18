import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTeams, getCategories } from '../services/storageService';
import { Athlete, TrainingEntry, getCalculatedCategory, Team, Category, User, UserRole, Position } from '../types';
import { ArrowLeft, Play, Pause, XCircle, CheckCircle, StopCircle, Flag, Mic, UserPlus, Users, X, Plus, Search, Filter, Loader2, AlertTriangle, AlertCircle, RefreshCw, Activity, ChevronRight, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Types for Tactical Events
type GamePhase = 'OFENSIVA' | 'DEFENSIVA' | 'TRANSICAO_OF' | 'TRANSICAO_DEF';
type GameResult = 'POSITIVA' | 'NEUTRA' | 'NEGATIVA';

interface TacticalEvent {
    id: string;
    timestamp: string;
    seconds: number;
    period: 1 | 2;
    phase: GamePhase;
    action: string;
    result: GameResult;
    location: { x: number; y: number };
}

const PHASE_ACTIONS: Record<GamePhase, string[]> = {
    'OFENSIVA': ['Apoio', 'Profundidade', 'Amplitude', 'Entrelinhas', 'Penetração', 'Manutenção da posse'],
    'DEFENSIVA': ['Contenção', 'Pressão direta', 'Cobertura', 'Fechamento de linha', 'Proteção do centro', 'Marcação ativa'],
    'TRANSICAO_OF': ['Acelerar jogo', 'Ataque ao espaço', 'Passe vertical', 'Condução progressiva', 'Apoio imediato', 'Pausa estratégica'],
    'TRANSICAO_DEF': ['Pressão pós-perda', 'Retardo', 'Fechamento de passe', 'Recuo organizado', 'Proteção de profundidade', 'Falta tática']
};

const RealTimeEvaluation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  
  // Data for Filters
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Multi-Athlete State
  const [activeAthletes, setActiveAthletes] = useState<Athlete[]>([]); 
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(''); 
  
  // Modal Filter States
  const [selectedTeamIdForAdd, setSelectedTeamIdForAdd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterName, setFilterName] = useState('');

  // Data Collection State (Keyed by Athlete ID)
  const [sessionLogs, setSessionLogs] = useState<Record<string, TacticalEvent[]>>({});

  // Timer & Game State
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [gamePeriod, setGamePeriod] = useState<1 | 2>(1);
  const [isHalftime, setIsHalftime] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [fieldFlipped, setFieldFlipped] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Interaction State
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0: Idle, 1: Action Selected, 2: Final Result Choice
  const [capturedLocation, setCapturedLocation] = useState<{x: number, y: number} | null>(null);
  const [capturedTime, setCapturedTime] = useState('');
  const [capturedSeconds, setCapturedSeconds] = useState(0);
  
  // Tactical Choices
  const [activePhase, setActivePhase] = useState<GamePhase>('OFENSIVA');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  
  // UI States
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', title: string, message: string } | null>(null);
  const [showResultFeedback, setShowResultFeedback] = useState<GameResult | null>(null);

  // Current Athlete Helper
  const currentAthlete = useMemo(() => 
      activeAthletes.find(a => a.id === selectedAthleteId) || null, 
  [activeAthletes, selectedAthleteId]);

  // Current Events Helper
  const currentEvents = useMemo(() => 
      sessionLogs[selectedAthleteId] || [], 
  [sessionLogs, selectedAthleteId]);

  // Filtered Athletes for Modal
  const filteredAthletesList = useMemo(() => {
      return allAthletes.filter(a => {
          if (a.teamId !== selectedTeamIdForAdd) return false;
          if (activeAthletes.some(active => active.id === a.id)) return false;
          if (filterCategory && a.categoryId !== filterCategory) return false;
          if (filterPosition && a.position !== filterPosition) return false;
          if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;
          return true;
      });
  }, [allAthletes, selectedTeamIdForAdd, activeAthletes, filterCategory, filterPosition, filterName]);

  // Get User Allowed Teams
  const userAllowedTeams = useMemo(() => {
      if (!currentUser) return [];
      if (currentUser.role === UserRole.GLOBAL) return allTeams;
      const allowedIds = currentUser.teamIds || [];
      return allTeams.filter(t => t.ownerId === currentUser.id || allowedIds.includes(t.id));
  }, [currentUser, allTeams]);

  useEffect(() => {
    const load = async () => {
      const uStr = localStorage.getItem('performax_current_user');
      const u = uStr ? JSON.parse(uStr) : null;
      setCurrentUser(u);

      const [athletesData, teamsData, catsData] = await Promise.all([
          getAthletes(),
          getTeams(),
          getCategories()
      ]);

      setAllAthletes(athletesData);
      setAllTeams(teamsData);
      setAllCategories(catsData);

      const initialAthlete = athletesData.find(a => a.id === id);
      if (initialAthlete) {
          setActiveAthletes([initialAthlete]);
          setSelectedAthleteId(initialAthlete.id);
          setSessionLogs({ [initialAthlete.id]: [] });
          setSelectedTeamIdForAdd(initialAthlete.teamId);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // Timer Logic
  useEffect(() => {
    if (isRunning) {
      if (!startTime) setStartTime(new Date().toISOString()); 
      timerRef.current = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(console.log);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMainButton = () => {
      if (!isRunning && timer === 0) {
          setIsRunning(true);
      } else if (isRunning && gamePeriod === 1) {
          setIsRunning(false);
          setIsHalftime(true);
      } else if (!isRunning && isHalftime) {
          setIsHalftime(false);
          setGamePeriod(2);
          setFieldFlipped(prev => !prev); // Auto flip when starting 2nd half
          setIsRunning(true);
      } else {
          setIsRunning(!isRunning);
      }
  };

  const getButtonLabel = () => {
      if (!isRunning && timer === 0) return { text: "Iniciar Jogo", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 1) return { text: "Intervalo", icon: <Flag size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      if (isHalftime) return { text: "Iniciar 2º Tempo", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 2) return { text: "Pausar", icon: <Pause size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      return { text: "Retomar", icon: <Play size={20} />, color: "bg-blue-600 hover:bg-blue-700" };
  };

  const btnState = getButtonLabel();

  // Field Interaction
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isRunning || step !== 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setCapturedLocation({ x, y });
      setCapturedTime(formatTime(timer));
      setCapturedSeconds(timer);
      setStep(1);
  };

  const handleActionClick = (actionName: string) => {
      setPendingAction(actionName);
      setStep(2);
  };

  const handleResultClick = (result: GameResult) => {
      if (!pendingAction || !capturedLocation || !selectedAthleteId) return;

      const newEvent: TacticalEvent = {
          id: uuidv4(),
          timestamp: capturedTime,
          seconds: capturedSeconds,
          period: gamePeriod,
          phase: activePhase,
          action: pendingAction,
          result: result,
          location: capturedLocation
      };

      setSessionLogs(prev => ({
          ...prev,
          [selectedAthleteId]: [...(prev[selectedAthleteId] || []), newEvent]
      }));

      // Feedback Etapa 4
      setShowResultFeedback(result);
      setTimeout(() => setShowResultFeedback(null), 1000);

      // Reset for next action
      setStep(0);
      setCapturedLocation(null);
      setPendingAction(null);
  };

  const handleCancelAction = () => {
      setStep(0);
      setCapturedLocation(null);
      setPendingAction(null);
  };

  const handleAddAthlete = (newAthlete: Athlete) => {
      if (activeAthletes.some(a => a.id === newAthlete.id)) return;
      setActiveAthletes(prev => [...prev, newAthlete]);
      setSessionLogs(prev => ({ ...prev, [newAthlete.id]: [] }));
      setSelectedAthleteId(newAthlete.id);
      setShowAddAthleteModal(false);
  };

  const handleFinishSession = async () => {
      if (!currentAthlete) return;
      setShowFinishModal(false);
      setLoading(true);

      const logs = sessionLogs[selectedAthleteId] || [];
      const sessionDate = startTime ? startTime.split('T')[0] : new Date().toISOString().split('T')[0];
      const sessionId = uuidv4();

      await saveTrainingSession({
          id: sessionId,
          teamId: currentAthlete.teamId,
          categoryId: currentAthlete.categoryId,
          date: sessionDate,
          description: `Análise Individual: ${logs.length} Ações`
      });

      const positiveCount = logs.filter(l => l.result === 'POSITIVA').length;
      const totalCount = logs.length;
      const score = totalCount > 0 ? Math.min(10, Math.round((positiveCount / totalCount) * 10 * 2) / 2) : 5;

      const entry: TrainingEntry = {
          id: uuidv4(),
          sessionId,
          athleteId: currentAthlete.id,
          technical: { controle_bola: score, conducao: score, passe: score, recepcao: score, drible: score, finalizacao: score, cruzamento: score, desarme: score, interceptacao: score },
          physical: { velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5 },
          tactical: { def_posicionamento: score, def_pressao: score, def_cobertura: score, def_fechamento: score, def_temporizacao: score, def_desarme_tatico: score, def_reacao: score, const_qualidade_passe: score, const_visao: score, const_apoios: score, const_mobilidade: score, const_circulacao: score, const_quebra_linhas: score, const_tomada_decisao: score, ult_movimentacao: score, ult_ataque_espaco: score, ult_1v1: score, ult_ultimo_passe: score, ult_finalizacao_eficiente: score, ult_ritmo: score, ult_bolas_paradas: score },
          heatmapPoints: logs.map(l => l.location),
          notes: JSON.stringify({ type: 'REAL_TIME_LOG', startTime, events: logs, totalEvents: logs.length })
      };

      await saveTrainingEntry(entry);

      const remaining = activeAthletes.filter(a => a.id !== selectedAthleteId);
      if (remaining.length === 0) navigate(`/athletes/${currentAthlete.id}`);
      else {
          setActiveAthletes(remaining);
          setSelectedAthleteId(remaining[0].id);
          setLoading(false);
          setFeedback({ type: 'success', title: 'Dados Salvos!', message: `Salvo para ${currentAthlete.name}.` });
      }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-500 hover:text-blue-600"><ArrowLeft size={24} /></button>
              {currentAthlete && (
                  <div className="flex items-center gap-3">
                      {currentAthlete.photoUrl ? (
                          <img src={currentAthlete.photoUrl} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" alt="" />
                      ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">
                              {currentAthlete.name.charAt(0)}
                          </div>
                      )}
                      <div>
                          <h1 className="font-bold text-gray-900 text-base leading-none truncate max-w-[150px]">{currentAthlete.name}</h1>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">{currentAthlete.position}</p>
                      </div>
                  </div>
              )}
          </div>
          
          <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                  {!isRunning && timer === 0 && (
                      <button 
                        onClick={() => setFieldFlipped(!fieldFlipped)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all border border-blue-700 shadow-md animate-pulse"
                      >
                          <RefreshCw size={16} className={fieldFlipped ? 'rotate-180 transition-transform' : 'transition-transform'} />
                          <span className="text-xs font-bold uppercase hidden sm:inline">Trocar Lado</span>
                      </button>
                  )}
                  
                  <div className={`relative flex flex-col items-center px-4 py-1 rounded-xl border-2 transition-all ${isRunning ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-0.5">
                          {isHalftime ? 'Intervalo' : `${gamePeriod}º Tempo`}
                      </span>
                      <span className="font-mono text-xl font-black leading-none">{formatTime(timer)}</span>
                  </div>

                  <button onClick={handleMainButton} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-white text-sm font-black shadow-md transition-all active:scale-95 uppercase ${btnState.color}`}>
                      {btnState.icon}
                      <span className="hidden sm:inline ml-1">{btnState.text}</span>
                  </button>
              </div>
          </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
          
          {/* Campo de Futebol Tático */}
          <div className={`relative w-full aspect-[16/8] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner group select-none transition-all`}>
              <div className={`absolute inset-0 z-0 ${isRunning && step === 0 ? 'cursor-crosshair' : ''}`} onClick={handleFieldClick}>
                  {/* Linhas do Campo */}
                  <div className="absolute inset-4 border-2 border-white/50 rounded-sm pointer-events-none"></div>
                  <div className="absolute left-4 top-1/2 w-16 h-32 border-2 border-white/40 border-l-0 transform -translate-y-1/2 pointer-events-none"></div>
                  <div className="absolute right-4 top-1/2 w-16 h-32 border-2 border-white/40 border-r-0 transform -translate-y-1/2 pointer-events-none"></div>
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/50 pointer-events-none"></div>
                  <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                  
                  {/* Legendas Ampliadas Táticas */}
                  <div className={`absolute bottom-6 left-10 text-white/80 font-black text-xl md:text-3xl uppercase pointer-events-none drop-shadow-2xl tracking-tighter`}>
                      {fieldFlipped ? 'ATAQUE' : 'DEFESA'}
                  </div>
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-white/80 font-black text-xl md:text-3xl uppercase pointer-events-none drop-shadow-2xl tracking-tighter">
                      CONSTRUÇÃO
                  </div>
                  <div className={`absolute bottom-6 right-10 text-white/80 font-black text-xl md:text-3xl uppercase pointer-events-none drop-shadow-2xl tracking-tighter`}>
                      {fieldFlipped ? 'DEFESA' : 'ATAQUE'}
                  </div>

                  {/* Marker de clique atual */}
                  {capturedLocation && (
                      <div 
                        className="absolute w-8 h-8 bg-yellow-400 border-4 border-white rounded-full shadow-2xl transform -translate-x-1/2 -translate-y-1/2 z-20 animate-ping-once"
                        style={{ left: `${capturedLocation.x}%`, top: `${capturedLocation.y}%` }}
                      />
                  )}

                  {/* Histórico visual rápido (pontinhos) */}
                  {currentEvents.map(evt => (
                      <div 
                        key={evt.id}
                        className={`absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-60 ${evt.result === 'POSITIVA' ? 'bg-green-300' : evt.result === 'NEGATIVA' ? 'bg-red-400' : 'bg-white'}`}
                        style={{ left: `${evt.location.x}%`, top: `${evt.location.y}%` }}
                      />
                  ))}
              </div>

              {/* Feedback Instantâneo de Resultado */}
              {showResultFeedback && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center animate-ping-once bg-white/10 pointer-events-none">
                      <div className={`text-4xl font-black uppercase px-8 py-4 rounded-3xl shadow-2xl border-4 ${
                          showResultFeedback === 'POSITIVA' ? 'bg-green-600 text-white border-green-400' :
                          showResultFeedback === 'NEGATIVA' ? 'bg-red-600 text-white border-red-400' :
                          'bg-gray-600 text-white border-gray-400'
                      }`}>
                          {showResultFeedback}
                      </div>
                  </div>
              )}
          </div>

          {/* FLUXO DE REGISTRO TÁTICO */}
          {isRunning && (
              <div className="space-y-4 animate-fade-in">
                  
                  {/* Etapa 0: Instrução ou Seleção de Fase */}
                  {step === 0 && (
                      <div className="grid grid-cols-4 gap-2">
                          {(['OFENSIVA', 'DEFENSIVA', 'TRANSICAO_OF', 'TRANSICAO_DEF'] as GamePhase[]).map(phase => (
                              <button 
                                key={phase}
                                onClick={() => setActivePhase(phase)}
                                className={`py-4 rounded-xl text-[9px] md:text-xs font-black uppercase transition-all shadow-sm border-2 ${
                                    activePhase === phase 
                                        ? 'bg-gray-900 text-white border-gray-700 scale-105 shadow-xl' 
                                        : 'bg-white text-gray-400 border-gray-100'
                                }`}
                              >
                                  {phase.replace('_', ' ')}
                              </button>
                          ))}
                      </div>
                  )}

                  {/* Etapa 1 ou 2: Formulário Dinâmico abaixo do campo */}
                  {step > 0 && (
                      <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-100 overflow-hidden animate-slide-up">
                          <div className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center">
                              <h3 className="font-black uppercase tracking-tighter flex items-center gap-2">
                                  {step === 1 ? '1. SELECIONE A AÇÃO' : '2. QUALIFIQUE O RESULTADO'}
                              </h3>
                              <span className="font-mono bg-black/20 px-2 py-0.5 rounded font-bold text-sm">{capturedTime}</span>
                          </div>

                          <div className="p-4 space-y-4">
                              {/* Grid de Ações (Renderização Condicional Step 1) */}
                              {step === 1 && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {PHASE_ACTIONS[activePhase].map(action => (
                                          <button
                                            key={action}
                                            onClick={() => handleActionClick(action)}
                                            className="py-5 px-2 rounded-xl font-bold text-sm bg-gray-50 text-gray-800 border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95"
                                          >
                                              {action}
                                          </button>
                                      ))}
                                  </div>
                              )}

                              {/* Seleção de Resultado (Step 2) */}
                              {step === 2 && (
                                  <div className="grid grid-cols-3 gap-3">
                                      <button 
                                        onClick={() => handleResultClick('POSITIVA')}
                                        className="bg-green-600 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all border-b-4 border-green-800"
                                      >
                                          POSITIVA
                                      </button>
                                      <button 
                                        onClick={() => handleResultClick('NEUTRA')}
                                        className="bg-gray-500 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all border-b-4 border-gray-700"
                                      >
                                          NEUTRA
                                      </button>
                                      <button 
                                        onClick={() => handleResultClick('NEGATIVA')}
                                        className="bg-red-600 text-white py-10 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all border-b-4 border-red-800"
                                      >
                                          NEGATIVA
                                      </button>
                                  </div>
                              )}

                              {/* Botão de Cancelamento / Voltar */}
                              <button 
                                onClick={handleCancelAction}
                                className="w-full py-4 text-gray-400 font-bold text-xs uppercase tracking-widest"
                              >
                                  Cancelar Registro
                              </button>
                          </div>
                      </div>
                  )}

                  {/* Feedback Mínimo de Contagem */}
                  {step === 0 && (
                      <div className="grid grid-cols-3 gap-3">
                          <div className="bg-green-50 p-4 rounded-2xl border-2 border-green-100 text-center">
                              <span className="text-3xl font-black text-green-700 leading-none">{currentEvents.filter(e => e.result === 'POSITIVA').length}</span>
                              <p className="text-[10px] font-black text-green-600 uppercase mt-1">Positivas</p>
                          </div>
                          <div className="bg-gray-100 p-4 rounded-2xl border-2 border-gray-200 text-center">
                              <span className="text-3xl font-black text-gray-700 leading-none">{currentEvents.filter(e => e.result === 'NEUTRA').length}</span>
                              <p className="text-[10px] font-black text-gray-500 uppercase mt-1">Neutras</p>
                          </div>
                          <div className="bg-red-50 p-4 rounded-2xl border-2 border-red-100 text-center">
                              <span className="text-3xl font-black text-red-700 leading-none">{currentEvents.filter(e => e.result === 'NEGATIVA').length}</span>
                              <p className="text-[10px] font-black text-red-600 uppercase mt-1">Negativas</p>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {!isRunning && timer === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-200">
                  <Activity size={48} className="mx-auto text-blue-200 mb-4" />
                  <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Análise Tática em Tempo Real</h2>
                  <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto font-medium">Toque no botão iniciar para começar o scout individual sem digitação.</p>
              </div>
          )}

      </div>

      {/* FOOTER BAR - MULTI-ATHLETE & SAVE */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl z-40 flex flex-col md:flex-row gap-4 md:items-center md:px-8">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold text-sm flex items-center gap-2 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap">
                  <XCircle size={20} /> Cancelar
              </button>
              <button onClick={() => setShowAddAthleteModal(true)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-3 rounded-full shadow-sm border border-blue-200">
                  <UserPlus size={20} />
              </button>
          </div>

          <div className="flex-1 overflow-x-auto flex gap-3 pb-1 md:pb-0 hide-scrollbar px-1">
              {activeAthletes.map(ath => (
                  <button 
                      key={ath.id}
                      onClick={() => setSelectedAthleteId(ath.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-all min-w-[140px]
                          ${selectedAthleteId === ath.id 
                              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-300' 
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }
                      `}
                  >
                      <div className="flex flex-col items-start min-w-0">
                          <span className="text-xs font-bold truncate w-full text-left">{ath.name.split(' ')[0]}</span>
                          <span className={`text-[10px] ${selectedAthleteId === ath.id ? 'text-blue-100' : 'text-gray-400'}`}>
                              {sessionLogs[ath.id]?.length || 0} ações
                          </span>
                      </div>
                  </button>
              ))}
          </div>
          
          <button 
            onClick={() => setShowFinishModal(true)}
            disabled={!currentEvents.length}
            className="bg-gray-900 text-white font-black py-4 px-8 rounded-2xl shadow-xl flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 whitespace-nowrap w-full md:w-auto justify-center"
          >
              <StopCircle size={20} /> 
              <span className="uppercase tracking-tighter">Encerrar e Salvar</span>
          </button>
      </div>

      {/* MODALS */}
      {showAddAthleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 uppercase tracking-tighter"><Users className="text-blue-600"/> Adicionar à Análise</h3>
                      <button onClick={() => setShowAddAthleteModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                  </div>
                  <div className="space-y-3 mb-4">
                      <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Time</label>
                          <select className="w-full bg-gray-100 border border-gray-300 rounded-lg p-3 text-sm font-black text-blue-900" value={selectedTeamIdForAdd} onChange={(e) => setSelectedTeamIdForAdd(e.target.value)}>
                              {userAllowedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                      </div>
                      <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                          <input type="text" className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-9 p-3 text-sm" placeholder="Buscar por nome..." value={filterName} onChange={(e) => setFilterName(e.target.value)} />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 min-h-[300px]">
                      {filteredAthletesList.map(athlete => (
                          <button key={athlete.id} onClick={() => handleAddAthlete(athlete)} className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 rounded-xl border border-gray-100 transition-colors">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 text-sm">{athlete.name.charAt(0)}</div>
                              <div className="text-left flex-1">
                                  <p className="font-bold text-gray-800 text-sm">{athlete.name}</p>
                                  <p className="text-[10px] text-gray-500 font-black uppercase">{athlete.position}</p>
                              </div>
                              <Plus className="text-green-600" size={20} />
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {showFinishModal && currentAthlete && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center">
                 <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md">
                     <CheckCircle className="text-green-600" size={40} />
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tighter">Salvar Atuação?</h3>
                 <p className="text-gray-500 mb-8 text-sm">Serão registradas <strong>{currentEvents.length} ações</strong> táticas para o atleta <strong>{currentAthlete.name}</strong>.</p>
                 <div className="flex flex-col gap-3">
                     <button onClick={handleFinishSession} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-sm">Confirmar e Salvar</button>
                     <button onClick={() => setShowFinishModal(false)} className="w-full bg-gray-100 text-gray-500 font-bold py-3 rounded-2xl text-sm">Voltar</button>
                 </div>
             </div>
         </div>
      )}

      {showCancelModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center">
                 <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md">
                     <AlertTriangle className="text-red-600" size={40} />
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tighter">Cancelar Análise?</h3>
                 <p className="text-gray-500 mb-8 text-sm">Todos os eventos registrados até agora nesta sessão de jogo serão descartados permanentemente.</p>
                 <div className="flex flex-col gap-3">
                     <button onClick={() => navigate(`/athletes/${id}`)} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-sm">Sim, Descartar Tudo</button>
                     <button onClick={() => setShowCancelModal(false)} className="w-full bg-gray-100 text-gray-500 font-bold py-3 rounded-2xl text-sm">Voltar ao Jogo</button>
                 </div>
             </div>
         </div>
      )}

      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full">
                 <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${feedback.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="text-green-600" size={24} /> : <AlertCircle className="text-red-600" size={24} />}
                 </div>
                 <h3 className="text-lg font-black text-gray-800 mb-1 uppercase tracking-tighter">{feedback.title}</h3>
                 <p className="text-gray-500 text-center text-xs font-medium">{feedback.message}</p>
             </div>
         </div>
      )}

    </div>
  );
};

export default RealTimeEvaluation;