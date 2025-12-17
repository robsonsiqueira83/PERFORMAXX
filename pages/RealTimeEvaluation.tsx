import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTeams, getCategories } from '../services/storageService';
import { Athlete, TrainingEntry, HeatmapPoint, getCalculatedCategory, Team, Category, Position, User, UserRole } from '../types';
import { ArrowLeft, Play, Pause, XCircle, CheckCircle, StopCircle, Flag, Mic, UserPlus, Users, X, Plus, Search, Filter, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import StatSlider from '../components/StatSlider';
import { v4 as uuidv4 } from 'uuid';

// Interface for a single event in the timeline
interface GameEvent {
    timestamp: string; // "05:30"
    seconds: number;   // 330
    period: 1 | 2;     // 1st or 2nd half
    zone: 'DEF' | 'MID' | 'ATT';
    location: { x: number; y: number };
    stats: any; // The specific stats modified in this event
    note: string;
}

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
  const [activeAthletes, setActiveAthletes] = useState<Athlete[]>([]); // Currently being evaluated
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(''); // Context focus
  
  // Modal Filter States
  const [selectedTeamIdForAdd, setSelectedTeamIdForAdd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterName, setFilterName] = useState('');

  // Data Collection State (Keyed by Athlete ID)
  const [sessionLogs, setSessionLogs] = useState<Record<string, GameEvent[]>>({});

  // Timer & Game State (Global for all athletes)
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [gamePeriod, setGamePeriod] = useState<1 | 2>(1);
  const [isHalftime, setIsHalftime] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  
  const timerRef = useRef<number | null>(null);

  // Interaction State
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [capturedTime, setCapturedTime] = useState<string>('');
  const [capturedSeconds, setCapturedSeconds] = useState<number>(0);
  
  // Custom Modal States
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  
  // System Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', title: string, message: string } | null>(null);
  
  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);

  // Temp Data for Current Action
  const [fieldClick, setFieldClick] = useState<{x: number, y: number} | null>(null);
  const [zone, setZone] = useState<'DEF' | 'MID' | 'ATT' | null>(null);
  const [currentNotes, setCurrentNotes] = useState('');
  const [currentStats, setCurrentStats] = useState(getEmptyStats());

  function getEmptyStats() {
      return {
        velocidade: 0, agilidade: 0, resistencia: 0, forca: 0, coordenacao: 0, mobilidade: 0, estabilidade: 0,
        controle_bola: 0, conducao: 0, passe: 0, recepcao: 0, drible: 0, finalizacao: 0, cruzamento: 0, desarme: 0, interceptacao: 0,
        def_posicionamento: 0, def_pressao: 0, def_cobertura: 0, def_fechamento: 0, def_temporizacao: 0, def_desarme_tatico: 0, def_reacao: 0,
        const_qualidade_passe: 0, const_visao: 0, const_apoios: 0, const_mobilidade: 0, const_circulacao: 0, const_quebra_linhas: 0, const_tomada_decisao: 0,
        ult_movimentacao: 0, ult_ataque_espaco: 0, ult_1v1: 0, ult_ultimo_passe: 0, ult_finalizacao_eficiente: 0, ult_ritmo: 0, ult_bolas_paradas: 0
      };
  }

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
          // 1. Must match selected team in modal
          if (a.teamId !== selectedTeamIdForAdd) return false;
          
          // 2. Must NOT be already active
          if (activeAthletes.some(active => active.id === a.id)) return false;

          // 3. Category Filter
          if (filterCategory && a.categoryId !== filterCategory) return false;

          // 4. Position Filter
          if (filterPosition && a.position !== filterPosition) return false;

          // 5. Name Search
          if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;

          return true;
      });
  }, [allAthletes, selectedTeamIdForAdd, activeAthletes, filterCategory, filterPosition, filterName]);

  // Get User Allowed Teams
  const userAllowedTeams = useMemo(() => {
      if (!currentUser) return [];
      if (currentUser.role === UserRole.GLOBAL) return allTeams;
      
      // Filter teams user has access to
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
          // Set Initial State
          setActiveAthletes([initialAthlete]);
          setSelectedAthleteId(initialAthlete.id);
          setSessionLogs({ [initialAthlete.id]: [] });
          
          // Set default add filter to current team
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
      
      if ('wakeLock' in navigator) {
          navigator.wakeLock.request('screen').catch(err => console.log(err));
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Game Control Logic
  const handleMainButton = () => {
      if (!isRunning && timer === 0) {
          setIsRunning(true);
      } else if (isRunning && gamePeriod === 1) {
          setIsRunning(false);
          setIsHalftime(true);
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

  // Voice Input Logic
  const handleVoiceInput = () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
          setFeedback({
              type: 'error',
              title: 'Não Suportado',
              message: 'Seu navegador não suporta reconhecimento de voz.'
          });
          return;
      }

      if (isListening) return; 

      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      setIsListening(true);

      recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setCurrentNotes(prev => (prev ? `${prev} ${transcript}` : transcript));
          setIsListening(false);
      };

      recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
      };

      recognition.onend = () => {
          setIsListening(false);
      };

      recognition.start();
  };

  // Add Athlete Logic
  const handleAddAthlete = (newAthlete: Athlete) => {
      if (activeAthletes.some(a => a.id === newAthlete.id)) return;
      
      setActiveAthletes(prev => [...prev, newAthlete]);
      setSessionLogs(prev => ({ ...prev, [newAthlete.id]: [] }));
      
      // Auto-switch to new athlete
      setSelectedAthleteId(newAthlete.id);
      setShowAddAthleteModal(false);
      
      // Reset filters
      setFilterName('');
      setFilterPosition('');
      setFilterCategory('');
  };

  // Direct Field Click
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRunning) return; 

    setCapturedTime(formatTime(timer));
    setCapturedSeconds(timer);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setFieldClick({ x, y });

    if (x < 33.33) setZone('DEF');
    else if (x < 66.66) setZone('MID');
    else setZone('ATT');

    setStep(2);
  };

  // Confirm Action
  const handleConfirmAction = () => {
      if (!zone || !fieldClick || !selectedAthleteId) return;

      const newEvent: GameEvent = {
          timestamp: capturedTime,
          seconds: capturedSeconds,
          period: gamePeriod,
          zone: zone,
          location: fieldClick,
          stats: { ...currentStats },
          note: currentNotes
      };

      // Push to specific athlete log
      setSessionLogs(prev => ({
          ...prev,
          [selectedAthleteId]: [...(prev[selectedAthleteId] || []), newEvent]
      }));

      setStep(0);
      setFieldClick(null);
      setZone(null);
      setCurrentNotes('');
      setCurrentStats(getEmptyStats());
  };

  const handleCancelAction = () => {
      setStep(0);
      setFieldClick(null);
      setZone(null);
  };

  // --- FINISH SESSION (PARTIAL SAVE) ---
  const handleFinishSession = async () => {
      if (!currentAthlete) return;
      
      setShowFinishModal(false);
      setLoading(true);

      const logsToSave = sessionLogs[selectedAthleteId] || [];

      // 1. Calculate Averages
      const finalStats: any = getEmptyStats();
      const counts: any = getEmptyStats();

      Object.keys(counts).forEach(k => counts[k] = 0);

      logsToSave.forEach(evt => {
          Object.keys(evt.stats).forEach(key => {
              const val = evt.stats[key];
              if (val > 0) {
                  finalStats[key] += val;
                  counts[key]++;
              }
          });
      });

      Object.keys(finalStats).forEach(key => {
          if (counts[key] > 0) {
              finalStats[key] = Math.round((finalStats[key] / counts[key]) * 2) / 2;
          } else {
              finalStats[key] = 5;
          }
      });

      // 2. Create Session
      const sessionDate = startTime ? startTime.split('T')[0] : new Date().toISOString().split('T')[0];
      const sessionId = uuidv4();

      await saveTrainingSession({
          id: sessionId,
          teamId: currentAthlete.teamId,
          categoryId: currentAthlete.categoryId,
          date: sessionDate,
          description: `Análise em Tempo Real (${logsToSave.length} ações)`
      });

      // 3. Create Entry
      const entry: TrainingEntry = {
          id: uuidv4(),
          sessionId,
          athleteId: currentAthlete.id,
          technical: {
            controle_bola: finalStats.controle_bola, conducao: finalStats.conducao, passe: finalStats.passe,
            recepcao: finalStats.recepcao, drible: finalStats.drible, finalizacao: finalStats.finalizacao,
            cruzamento: finalStats.cruzamento, desarme: finalStats.desarme, interceptacao: finalStats.interceptacao
          },
          physical: {
            velocidade: finalStats.velocidade, agilidade: finalStats.agilidade, resistencia: finalStats.resistencia,
            forca: finalStats.forca, coordenacao: finalStats.coordenacao, mobilidade: finalStats.mobilidade, estabilidade: finalStats.estabilidade
          },
          tactical: {
            def_posicionamento: finalStats.def_posicionamento, def_pressao: finalStats.def_pressao, def_cobertura: finalStats.def_cobertura,
            def_fechamento: finalStats.def_fechamento, def_temporizacao: finalStats.def_temporizacao, def_desarme_tatico: finalStats.def_desarme_tatico,
            def_reacao: finalStats.def_reacao,
            const_qualidade_passe: finalStats.const_qualidade_passe, const_visao: finalStats.const_visao, const_apoios: finalStats.const_apoios,
            const_mobilidade: finalStats.const_mobilidade, const_circulacao: finalStats.const_circulacao, const_quebra_linhas: finalStats.const_quebra_linhas,
            const_tomada_decisao: finalStats.const_tomada_decisao,
            ult_movimentacao: finalStats.ult_movimentacao, ult_ataque_espaco: finalStats.ult_ataque_espaco, ult_1v1: finalStats.ult_1v1,
            ult_ultimo_passe: finalStats.ult_ultimo_passe, ult_finalizacao_eficiente: finalStats.ult_finalizacao_eficiente,
            ult_ritmo: finalStats.ult_ritmo, ult_bolas_paradas: finalStats.ult_bolas_paradas
          },
          heatmapPoints: logsToSave.map(e => e.location),
          notes: JSON.stringify({
              type: 'REAL_TIME_LOG',
              startTime: startTime,
              totalEvents: logsToSave.length,
              events: logsToSave
          })
      };

      await saveTrainingEntry(entry);

      // --- POST SAVE LOGIC ---
      const remainingAthletes = activeAthletes.filter(a => a.id !== selectedAthleteId);
      
      if (remainingAthletes.length === 0) {
          navigate(`/athletes/${currentAthlete.id}`);
      } else {
          setActiveAthletes(remainingAthletes);
          setSelectedAthleteId(remainingAthletes[0].id);
          
          setSessionLogs(prev => {
              const newLogs = { ...prev };
              delete newLogs[selectedAthleteId];
              return newLogs;
          });
          
          setLoading(false);
          setFeedback({
              type: 'success',
              title: 'Dados Salvos!',
              message: `Dados de ${currentAthlete.name} registrados. Alternando para ${remainingAthletes[0].name}.`
          });
      }
  };

  const handleAbort = () => {
      setShowCancelModal(false);
      navigate(`/athletes/${id}`); 
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-500 hover:text-blue-600">
                  <ArrowLeft size={24} />
              </button>
              {currentAthlete ? (
                  <div className="flex items-center gap-3">
                      {currentAthlete.photoUrl ? (
                          <img src={currentAthlete.photoUrl} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md bg-gray-100" alt={currentAthlete.name} />
                      ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-lg border-2 border-white shadow-md">
                              {currentAthlete.name.charAt(0)}
                          </div>
                      )}
                      <div>
                          <h1 className="font-bold text-gray-900 text-xl leading-none truncate max-w-[200px]">{currentAthlete.name}</h1>
                          <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                                  {currentAthlete.position}
                              </span>
                              <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                                  {getCalculatedCategory(currentAthlete.birthDate)}
                              </span>
                          </div>
                      </div>
                  </div>
              ) : (
                  <span className="text-gray-400 font-bold">Nenhum atleta selecionado</span>
              )}
          </div>
          
          <div className="flex flex-col items-end">
              <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isHalftime ? 'text-yellow-600' : 'text-green-600'}`}>
                  {isHalftime ? 'Intervalo' : `${gamePeriod}º Tempo`}
              </span>
              <div className="flex items-center gap-2">
                  <div className={`font-mono text-xl md:text-2xl font-black px-4 py-2 rounded-xl transition-all ${isRunning ? 'bg-red-50 text-red-600 border border-red-100 shadow-inner' : 'bg-gray-100 text-gray-400'}`}>
                      {formatTime(timer)}
                  </div>
                  <button 
                    onClick={handleMainButton}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-bold shadow-md transition-all active:scale-95 ${btnState.color}`}
                  >
                      {btnState.icon}
                      <span className="hidden md:inline">{btnState.text}</span>
                  </button>
              </div>
          </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-6">
          
          {/* FIELD AREA */}
          <div className={`relative w-full aspect-[16/9] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner group select-none transition-all duration-300`}>
              
              {isRunning && step === 0 && currentAthlete && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                      <div className="bg-white/30 backdrop-blur-[2px] px-4 py-2 rounded-full shadow-lg text-white font-bold text-sm border border-white/40 animate-pulse">
                          Toque no campo para registrar ação
                      </div>
                  </div>
              )}

              {!isRunning && timer === 0 && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                      <div className="text-white font-bold text-lg text-center">
                          Inicie o cronômetro para avaliar
                      </div>
                  </div>
              )}

              <div 
                className={`absolute inset-0 z-0 ${isRunning && step === 0 && currentAthlete ? 'cursor-crosshair' : 'cursor-default'}`}
                onClick={handleFieldClick}
              >
                  {/* Field Lines */}
                  <div className="absolute inset-4 border-2 border-white/50 rounded-sm pointer-events-none"></div>
                  <div className="absolute top-0 bottom-0 left-1/3 w-0.5 bg-white/20 pointer-events-none border-r border-dashed border-white/30"></div>
                  <div className="absolute top-0 bottom-0 left-2/3 w-0.5 bg-white/20 pointer-events-none border-r border-dashed border-white/30"></div>
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/50 pointer-events-none"></div>
                  <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                  
                  <div className="absolute bottom-2 left-4 text-white/40 font-bold text-[10px] uppercase">Defesa</div>
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white/40 font-bold text-[10px] uppercase">Construção</div>
                  <div className="absolute bottom-2 right-4 text-white/40 font-bold text-[10px] uppercase">Ataque</div>

                  {fieldClick && (
                      <div 
                        className="absolute w-8 h-8 bg-yellow-400 border-4 border-white rounded-full shadow-xl transform -translate-x-1/2 -translate-y-1/2 z-20 animate-ping-once"
                        style={{ left: `${fieldClick.x}%`, top: `${fieldClick.y}%` }}
                      >
                      </div>
                  )}

                  {currentEvents.map((evt, idx) => (
                      <div 
                        key={idx}
                        className="absolute w-3 h-3 bg-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-0"
                        style={{ left: `${evt.location.x}%`, top: `${evt.location.y}%` }}
                      />
                  ))}
              </div>
          </div>

          {/* DYNAMIC FORM */}
          {step === 2 && zone && (
              <div className="animate-slide-up bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden relative z-20">
                  <div className={`p-4 border-b text-white flex justify-between items-center shadow-md
                      ${zone === 'DEF' ? 'bg-purple-600' : zone === 'MID' ? 'bg-blue-600' : 'bg-orange-600'}
                  `}>
                      <div>
                          <h3 className="font-bold text-lg flex items-center gap-2">
                              {zone === 'DEF' && '🛡️ Ação Defensiva'}
                              {zone === 'MID' && '⚙️ Construção / Meio'}
                              {zone === 'ATT' && '🚀 Ação Ofensiva'}
                          </h3>
                      </div>
                      <div className="font-mono bg-black/20 px-3 py-1 rounded-lg text-sm font-bold border border-white/20">{capturedTime}</div>
                  </div>

                  <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto pb-24">
                      {zone === 'DEF' && (
                          <div className="space-y-4">
                              <StatSlider label="Posicionamento" value={currentStats.def_posicionamento} onChange={v => setCurrentStats({...currentStats, def_posicionamento: v})} />
                              <StatSlider label="Desarme" value={currentStats.def_desarme_tatico} onChange={v => setCurrentStats({...currentStats, def_desarme_tatico: v})} />
                              <StatSlider label="Interceptação" value={currentStats.interceptacao} onChange={v => setCurrentStats({...currentStats, interceptacao: v})} />
                              <StatSlider label="Reação Pós-Perda" value={currentStats.def_reacao} onChange={v => setCurrentStats({...currentStats, def_reacao: v})} />
                          </div>
                      )}

                      {zone === 'MID' && (
                          <div className="space-y-4">
                              <StatSlider label="Qualidade Passe" value={currentStats.const_qualidade_passe} onChange={v => setCurrentStats({...currentStats, const_qualidade_passe: v})} />
                              <StatSlider label="Visão de Jogo" value={currentStats.const_visao} onChange={v => setCurrentStats({...currentStats, const_visao: v})} />
                              <StatSlider label="Controle de Bola" value={currentStats.controle_bola} onChange={v => setCurrentStats({...currentStats, controle_bola: v})} />
                              <StatSlider label="Quebra de Linhas" value={currentStats.const_quebra_linhas} onChange={v => setCurrentStats({...currentStats, const_quebra_linhas: v})} />
                          </div>
                      )}

                      {zone === 'ATT' && (
                          <div className="space-y-4">
                              <StatSlider label="Finalização" value={currentStats.ult_finalizacao_eficiente} onChange={v => setCurrentStats({...currentStats, ult_finalizacao_eficiente: v})} />
                              <StatSlider label="1 vs 1" value={currentStats.ult_1v1} onChange={v => setCurrentStats({...currentStats, ult_1v1: v})} />
                              <StatSlider label="Último Passe" value={currentStats.ult_ultimo_passe} onChange={v => setCurrentStats({...currentStats, ult_ultimo_passe: v})} />
                              <StatSlider label="Ataque ao Espaço" value={currentStats.ult_ataque_espaco} onChange={v => setCurrentStats({...currentStats, ult_ataque_espaco: v})} />
                          </div>
                      )}

                      <div>
                          <label className="block text-xs uppercase font-bold text-gray-400 mb-2 flex items-center gap-2">
                              Observação (Opcional)
                          </label>
                          <div className="relative">
                              <input 
                                type="text"
                                className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Ex: Errou o passe mas recuperou..."
                                value={currentNotes}
                                onChange={(e) => setCurrentNotes(e.target.value)}
                              />
                              <button 
                                onClick={handleVoiceInput}
                                className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                                title="Falar anotação"
                              >
                                  <Mic size={18} />
                              </button>
                          </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                          <button 
                            onClick={handleCancelAction}
                            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                          >
                              Cancelar
                          </button>
                          <button 
                            onClick={handleConfirmAction}
                            className={`flex-[2] py-3 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 transform active:scale-95 transition-all
                                ${zone === 'DEF' ? 'bg-purple-600 hover:bg-purple-700' : zone === 'MID' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}
                            `}
                          >
                              <CheckCircle size={20} /> Confirmar Jogada
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {currentEvents.length > 0 && step === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex justify-between">
                      <span>Timeline da Sessão</span>
                      <span className="bg-gray-100 text-gray-600 px-2 rounded-full text-xs py-0.5">{currentEvents.length} ações</span>
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                      {currentEvents.slice().reverse().map((evt, i) => (
                          <div key={i} className="flex-shrink-0 bg-gray-50 border border-gray-200 rounded-lg p-2 min-w-[100px] flex flex-col items-center">
                              <span className="text-xs font-mono text-gray-400 font-bold">{evt.timestamp}</span>
                              <span className={`text-[10px] font-bold px-1 rounded mt-1 
                                  ${evt.zone === 'DEF' ? 'text-purple-600 bg-purple-50' : evt.zone === 'MID' ? 'text-blue-600 bg-blue-50' : 'text-orange-600 bg-orange-50'}
                              `}>
                                  {evt.zone}
                              </span>
                          </div>
                      ))}
                  </div>
              </div>
          )}

      </div>

      {/* FIXED FOOTER - MULTI-ATHLETE BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl z-40 flex flex-col md:flex-row gap-4 md:items-center md:px-8">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                onClick={() => setShowCancelModal(true)}
                className="text-red-500 font-bold text-sm flex items-center gap-2 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
              >
                  <XCircle size={20} /> Cancelar
              </button>
              
              <button
                onClick={() => setShowAddAthleteModal(true)}
                className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-3 rounded-full md:rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm border border-blue-200"
                title="Adicionar Atleta"
              >
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
                      {ath.photoUrl ? (
                          <img src={ath.photoUrl} className="w-8 h-8 rounded-full object-cover border border-white/50 bg-white" />
                      ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border border-white/20 ${selectedAthleteId === ath.id ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                              {ath.name.charAt(0)}
                          </div>
                      )}
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
            className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl shadow-lg flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap w-full md:w-auto justify-center"
          >
              <StopCircle size={20} /> 
              <span>ENCERRAR E SALVAR</span>
          </button>
      </div>

      {/* ADD ATHLETE MODAL */}
      {showAddAthleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Users className="text-blue-600"/> Adicionar à Análise</h3>
                      <button onClick={() => setShowAddAthleteModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                  </div>
                  
                  {/* FILTERS SECTION */}
                  <div className="space-y-3 mb-4">
                      {/* Team Select */}
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">SELECIONAR TIME</label>
                          <select 
                              className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm font-semibold"
                              value={selectedTeamIdForAdd}
                              onChange={(e) => setSelectedTeamIdForAdd(e.target.value)}
                          >
                              {userAllowedTeams.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                          </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">CATEGORIA</label>
                              <select 
                                  className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm"
                                  value={filterCategory}
                                  onChange={(e) => setFilterCategory(e.target.value)}
                              >
                                  <option value="">Todas</option>
                                  {allCategories.filter(c => c.teamId === selectedTeamIdForAdd).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">POSIÇÃO</label>
                              <select 
                                  className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm"
                                  value={filterPosition}
                                  onChange={(e) => setFilterPosition(e.target.value)}
                              >
                                  <option value="">Todas</option>
                                  {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                          </div>
                      </div>

                      <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                          <input 
                              type="text" 
                              className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-9 p-2 text-sm"
                              placeholder="Buscar por nome..."
                              value={filterName}
                              onChange={(e) => setFilterName(e.target.value)}
                          />
                      </div>
                  </div>

                  {/* ATHLETE LIST */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
                      {filteredAthletesList.length > 0 ? (
                          filteredAthletesList.map(athlete => (
                              <button
                                  key={athlete.id}
                                  onClick={() => handleAddAthlete(athlete)}
                                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors"
                              >
                                  {athlete.photoUrl ? (
                                      <img src={athlete.photoUrl} className="w-10 h-10 rounded-full object-cover bg-gray-100" />
                                  ) : (
                                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600">{athlete.name.charAt(0)}</div>
                                  )}
                                  <div className="text-left">
                                      <p className="font-bold text-gray-800 text-sm">{athlete.name}</p>
                                      <div className="flex gap-2">
                                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{athlete.position}</span>
                                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{getCalculatedCategory(athlete.birthDate)}</span>
                                      </div>
                                  </div>
                                  <Plus className="ml-auto text-green-600" size={20} />
                              </button>
                          ))
                      ) : (
                          <div className="text-center py-8 text-gray-400 flex flex-col items-center gap-2">
                              <Filter size={32} className="opacity-20"/>
                              <p className="text-sm">Nenhum atleta encontrado com os filtros.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* CUSTOM FINISH MODAL */}
      {showFinishModal && currentAthlete && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckCircle className="text-blue-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Encerrar: {currentAthlete.name}?</h3>
                 <p className="text-gray-500 mb-6">
                     Foram registradas <strong>{currentEvents.length} ações</strong> para este atleta.
                     <br/><br/>
                     <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                         Os outros atletas da sessão continuarão ativos.
                     </span>
                 </p>
                 <div className="flex gap-3">
                     <button 
                        onClick={() => setShowFinishModal(false)} 
                        className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200"
                     >
                         Voltar
                     </button>
                     <button 
                        onClick={handleFinishSession} 
                        className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-lg"
                     >
                         Salvar & Próximo
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* CUSTOM CANCEL MODAL */}
      {showCancelModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Cancelar Sessão?</h3>
                 <p className="text-gray-500 mb-6">
                     Todos os dados não salvos de <strong>todos os atletas ativos</strong> serão perdidos.
                 </p>
                 <div className="flex gap-3">
                     <button 
                        onClick={() => setShowCancelModal(false)} 
                        className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200"
                     >
                         Voltar
                     </button>
                     <button 
                        onClick={handleAbort} 
                        className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-lg"
                     >
                         Sim, Sair
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* SYSTEM FEEDBACK MODAL (Replaces Alerts) */}
      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full relative">
                 <button onClick={() => setFeedback(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${feedback.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="text-green-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{feedback.title}</h3>
                 <p className="text-gray-500 text-center mb-6">{feedback.message}</p>
                 <button onClick={() => setFeedback(null)} className={`text-white font-bold py-3 px-6 rounded-xl transition-colors w-full shadow-lg ${feedback.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                     Continuar
                 </button>
             </div>
         </div>
      )}

    </div>
  );
};

export default RealTimeEvaluation;