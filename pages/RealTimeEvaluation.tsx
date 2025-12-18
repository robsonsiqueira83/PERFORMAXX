import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTeams, getCategories } from '../services/storageService';
import { Athlete, TrainingEntry, getCalculatedCategory, Team, Category, User, UserRole, Position } from '../types';
import { ArrowLeft, Play, Pause, XCircle, CheckCircle, StopCircle, Flag, Mic, UserPlus, Users, X, Plus, Search, Filter, Loader2, AlertTriangle, AlertCircle, RefreshCw, Map as MapIcon, ChevronRight, Activity } from 'lucide-react';
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
    zoneId?: number; // 0-11 for 12 zones
    location?: { x: number; y: number };
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

  // Tactical State (Etapa 2)
  const [activePhase, setActivePhase] = useState<GamePhase>('OFENSIVA');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  
  // UI States
  const [showMapOverlay, setShowMapOverlay] = useState(false);
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
          setFieldFlipped(prev => !prev); // Auto flip on halftime
      } else if (!isRunning && isHalftime) {
          setIsHalftime(false);
          setGamePeriod(2);
          setIsRunning(true);
      } else {
          setIsRunning(!isRunning);
      }
  };

  const getButtonLabel = () => {
      if (!isRunning && timer === 0) return { text: "Iniciar Jogo", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 1) return { text: "Encerrar 1º Tempo", icon: <Flag size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      if (isHalftime) return { text: "Iniciar 2º Tempo", icon: <Play size={20} />, color: "bg-green-600 hover:bg-green-700" };
      if (isRunning && gamePeriod === 2) return { text: "Pausar", icon: <Pause size={20} />, color: "bg-yellow-500 hover:bg-yellow-600" };
      return { text: "Retomar", icon: <Play size={20} />, color: "bg-blue-600 hover:bg-blue-700" };
  };

  const btnState = getButtonLabel();

  // Etapa 2: Registro Tático
  const handleActionClick = (actionName: string) => {
      if (!isRunning) return;
      setPendingAction(actionName);
  };

  const handleResultClick = (result: GameResult) => {
      if (!pendingAction || !selectedAthleteId) return;

      const eventId = uuidv4();
      const newEvent: TacticalEvent = {
          id: eventId,
          timestamp: formatTime(timer),
          seconds: timer,
          period: gamePeriod,
          phase: activePhase,
          action: pendingAction,
          result: result
      };

      setSessionLogs(prev => ({
          ...prev,
          [selectedAthleteId]: [...(prev[selectedAthleteId] || []), newEvent]
      }));

      setLastEventId(eventId);
      setPendingAction(null);
      
      // Feedback Etapa 4
      setShowResultFeedback(result);
      setTimeout(() => setShowResultFeedback(null), 1000);
  };

  // Etapa 3: Mapa de Zonas
  const handleZoneClick = (zoneId: number) => {
      if (!lastEventId || !selectedAthleteId) return;

      setSessionLogs(prev => {
          const athleteLogs = [...(prev[selectedAthleteId] || [])];
          const lastIdx = athleteLogs.findIndex(e => e.id === lastEventId);
          if (lastIdx !== -1) {
              athleteLogs[lastIdx] = { ...athleteLogs[lastIdx], zoneId };
          }
          return { ...prev, [selectedAthleteId]: athleteLogs };
      });

      setShowMapOverlay(false);
      setFeedback({
          type: 'success',
          title: 'Zona Registrada',
          message: 'Localização vinculada à última ação.'
      });
      setTimeout(() => setFeedback(null), 1500);
  };

  const handleAddAthlete = (newAthlete: Athlete) => {
      if (activeAthletes.some(a => a.id === newAthlete.id)) return;
      setActiveAthletes(prev => [...prev, newAthlete]);
      setSessionLogs(prev => ({ ...prev, [newAthlete.id]: [] }));
      setSelectedAthleteId(newAthlete.id);
      setShowAddAthleteModal(false);
  };

  // Finalização (Etapa 5)
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

      // Cálculo simplificado de score baseado em % de ações positivas para manter Radar chart
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
          notes: JSON.stringify({ type: 'TACTICAL_EVENT_LOG', startTime, events: logs })
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
                  <div className={`font-mono text-xl font-black px-4 py-2 rounded-xl transition-all ${isRunning ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-100 text-gray-400'}`}>
                      {formatTime(timer)}
                  </div>
                  <button onClick={handleMainButton} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold shadow-md transition-all active:scale-95 ${btnState.color}`}>
                      {btnState.icon}
                  </button>
              </div>
          </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 flex flex-col gap-4">
          
          {/* Campo com Marcas d'Água Aumentadas */}
          <div className={`relative w-full aspect-[16/8] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner group select-none`}>
              <div className="absolute inset-0 z-0">
                  <div className="absolute inset-4 border-2 border-white/50 rounded-sm"></div>
                  <div className="absolute left-4 top-1/2 w-16 h-32 border-2 border-white/40 border-l-0 transform -translate-y-1/2"></div>
                  <div className="absolute right-4 top-1/2 w-16 h-32 border-2 border-white/40 border-r-0 transform -translate-y-1/2"></div>
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/50"></div>
                  <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                  
                  {/* Legendas Ampliadas */}
                  <div className={`absolute bottom-6 left-10 text-white/80 font-black text-xl md:text-2xl uppercase pointer-events-none drop-shadow-lg`}>
                      {fieldFlipped ? 'ATAQUE' : 'DEFESA'}
                  </div>
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-white/80 font-black text-xl md:text-2xl uppercase pointer-events-none drop-shadow-lg">
                      CONSTRUÇÃO
                  </div>
                  <div className={`absolute bottom-6 right-10 text-white/80 font-black text-xl md:text-2xl uppercase pointer-events-none drop-shadow-lg`}>
                      {fieldFlipped ? 'DEFESA' : 'ATAQUE'}
                  </div>
              </div>

              {/* Feedback de Resultado Visual Instantâneo */}
              {showResultFeedback && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center animate-ping-once bg-white/10 pointer-events-none">
                      <div className={`text-4xl font-black uppercase px-6 py-3 rounded-2xl shadow-2xl border-4 ${
                          showResultFeedback === 'POSITIVA' ? 'bg-green-600 text-white border-green-400' :
                          showResultFeedback === 'NEGATIVA' ? 'bg-red-600 text-white border-red-400' :
                          'bg-gray-600 text-white border-gray-400'
                      }`}>
                          {showResultFeedback}
                      </div>
                  </div>
              )}
          </div>

          {/* Registro Tático por Cliques */}
          {!isRunning && timer === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-gray-200">
                  <Activity size={48} className="mx-auto text-gray-300 mb-4" />
                  <h2 className="text-xl font-bold text-gray-800">Pronto para a Análise Individual?</h2>
                  <p className="text-gray-500 max-w-xs mx-auto mt-2">Inicie o cronômetro para começar a registrar ações táticas em tempo real.</p>
              </div>
          ) : (
              <div className="space-y-4">
                  {/* 2.1: Seleção de Fase do Jogo (1 Clique) */}
                  <div className="grid grid-cols-4 gap-2">
                      {(['OFENSIVA', 'DEFENSIVA', 'TRANSICAO_OF', 'TRANSICAO_DEF'] as GamePhase[]).map(phase => (
                          <button 
                            key={phase}
                            onClick={() => setActivePhase(phase)}
                            className={`py-3 rounded-xl text-[10px] md:text-xs font-black uppercase transition-all shadow-sm border-2 ${
                                activePhase === phase 
                                    ? 'bg-gray-900 text-white border-gray-700 shadow-lg scale-105' 
                                    : 'bg-white text-gray-400 border-transparent hover:bg-gray-50'
                            }`}
                          >
                              {phase.replace('_', ' ')}
                          </button>
                      ))}
                  </div>

                  {/* 2.2: Grid de Ações por Fase */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <ChevronRight size={14} className="text-blue-600"/> Ações da Fase {activePhase.replace('_', ' ')}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {PHASE_ACTIONS[activePhase].map(action => (
                              <button
                                key={action}
                                onClick={() => handleActionClick(action)}
                                className={`py-4 px-2 rounded-xl font-bold text-sm transition-all border-2 text-center flex items-center justify-center min-h-[60px] ${
                                    pendingAction === action 
                                        ? 'bg-blue-600 text-white border-blue-400 scale-[0.98]' 
                                        : 'bg-gray-50 text-gray-700 border-gray-100 hover:border-blue-200'
                                }`}
                              >
                                  {action}
                              </button>
                          ))}
                      </div>
                  </div>

                  {/* 2.3: Qualificação do Resultado (Clique Final) */}
                  {pendingAction && (
                      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end justify-center p-4">
                          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-slide-up">
                              <p className="text-center text-xs font-black text-gray-400 uppercase mb-4 tracking-tighter">Qualificar: {pendingAction}</p>
                              <div className="grid grid-cols-3 gap-4 mb-4">
                                  <button onClick={() => handleResultClick('POSITIVA')} className="bg-green-600 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">POSITIVA</button>
                                  <button onClick={() => handleResultClick('NEUTRA')} className="bg-gray-500 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">NEUTRA</button>
                                  <button onClick={() => handleResultClick('NEGATIVA')} className="bg-red-600 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">NEGATIVA</button>
                              </div>
                              <button onClick={() => setPendingAction(null)} className="w-full py-4 text-gray-400 font-bold text-sm">CANCELAR</button>
                          </div>
                      </div>
                  )}
              </div>
          )}

          {/* Feedback Visual Mínimo (Contadores) */}
          <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100 text-center">
                  <span className="text-2xl font-black text-green-700">{currentEvents.filter(e => e.result === 'POSITIVA').length}</span>
                  <p className="text-[10px] font-black text-green-600 uppercase">Positivas</p>
              </div>
              <div className="bg-gray-100 p-4 rounded-2xl border border-gray-200 text-center">
                  <span className="text-2xl font-black text-gray-700">{currentEvents.filter(e => e.result === 'NEUTRA').length}</span>
                  <p className="text-[10px] font-black text-gray-500 uppercase">Neutras</p>
              </div>
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center">
                  <span className="text-2xl font-black text-red-700">{currentEvents.filter(e => e.result === 'NEGATIVA').length}</span>
                  <p className="text-[10px] font-black text-red-600 uppercase">Negativas</p>
              </div>
          </div>
      </div>

      {/* Floating Buttons Bar (Fixed) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl z-40 flex flex-col md:flex-row gap-4 md:items-center md:px-8">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold text-sm flex items-center gap-2 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap">
                  <XCircle size={20} /> Cancelar
              </button>
              <button onClick={() => setShowAddAthleteModal(true)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-3 rounded-full shadow-sm border border-blue-200" title="Adicionar Atleta">
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
          
          <div className="flex gap-2">
            {/* ETAPA 3: Botão Flutuante do Mapa */}
            <button 
                onClick={() => setShowMapOverlay(true)}
                disabled={!lastEventId}
                className="bg-orange-500 text-white p-3 rounded-xl shadow-lg flex items-center gap-2 hover:bg-orange-600 transition-all disabled:opacity-50"
            >
                <MapIcon size={20} />
            </button>
            <button 
                onClick={() => setShowFinishModal(true)}
                disabled={!currentEvents.length}
                className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl shadow-lg flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 whitespace-nowrap"
            >
                <StopCircle size={20} /> 
                <span>SALVAR</span>
            </button>
          </div>
      </div>

      {/* Overlay de Mapa de Zonas (Etapa 3) */}
      {showMapOverlay && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">Marcar Zona da Última Ação</h3>
                      <button onClick={() => setShowMapOverlay(false)} className="p-2"><X size={24} /></button>
                  </div>
                  <div className="p-4">
                      <div className="relative w-full aspect-[16/9] bg-green-700 rounded-xl grid grid-cols-4 grid-rows-3 gap-1 overflow-hidden border-2 border-white/20">
                          {Array.from({length: 12}).map((_, idx) => (
                              <button 
                                key={idx}
                                onClick={() => handleZoneClick(idx)}
                                className="w-full h-full bg-white/5 hover:bg-white/30 border border-white/10 transition-colors flex items-center justify-center"
                              >
                                  <span className="text-white/20 font-black text-xl">{idx + 1}</span>
                              </button>
                          ))}
                          {/* Linhas do Campo (Decoration only) */}
                          <div className="absolute inset-0 pointer-events-none">
                              <div className="absolute inset-4 border border-white/20 rounded-sm"></div>
                              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20"></div>
                              <div className="absolute top-1/2 left-1/2 w-16 h-16 border border-white/20 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                          </div>
                      </div>
                      <p className="text-center text-gray-500 text-xs mt-4">Toque na zona onde a jogada ocorreu.</p>
                  </div>
              </div>
          </div>
      )}

      {/* ... (Modals de Add Athlete, Finish e Cancel - Mantidos do Turno Anterior) ... */}
      {showAddAthleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Users className="text-blue-600"/> Adicionar Atleta</h3>
                      <button onClick={() => setShowAddAthleteModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                  </div>
                  <div className="space-y-3 mb-4">
                      <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Time</label>
                          <select className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm font-semibold" value={selectedTeamIdForAdd} onChange={(e) => setSelectedTeamIdForAdd(e.target.value)}>
                              {userAllowedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                      </div>
                      <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                          <input type="text" className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-9 p-2 text-sm" placeholder="Nome do atleta..." value={filterName} onChange={(e) => setFilterName(e.target.value)} />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
                      {filteredAthletesList.map(athlete => (
                          <button key={athlete.id} onClick={() => handleAddAthlete(athlete)} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 text-sm">{athlete.name.charAt(0)}</div>
                              <div className="text-left">
                                  <p className="font-bold text-gray-800 text-sm">{athlete.name}</p>
                                  <p className="text-[10px] text-gray-400">{athlete.position}</p>
                              </div>
                              <Plus className="ml-auto text-green-600" size={20} />
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {showFinishModal && currentAthlete && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckCircle className="text-blue-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Encerrar: {currentAthlete.name}?</h3>
                 <p className="text-gray-500 mb-6 text-sm">Foram registradas <strong>{currentEvents.length} ações</strong> táticas nesta sessão.</p>
                 <div className="flex gap-3">
                     <button onClick={() => setShowFinishModal(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl">Voltar</button>
                     <button onClick={handleFinishSession} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg">Confirmar</button>
                 </div>
             </div>
         </div>
      )}

      {showCancelModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Cancelar Sessão?</h3>
                 <p className="text-gray-500 mb-6 text-sm">Todos os eventos registrados neste jogo serão descartados.</p>
                 <div className="flex gap-3">
                     <button onClick={() => setShowCancelModal(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl">Voltar</button>
                     <button onClick={() => navigate(`/athletes/${id}`)} className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl">Sair</button>
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
                 <h3 className="text-lg font-bold text-gray-800 mb-1">{feedback.title}</h3>
                 <p className="text-gray-500 text-center text-xs">{feedback.message}</p>
             </div>
         </div>
      )}

    </div>
  );
};

export default RealTimeEvaluation;