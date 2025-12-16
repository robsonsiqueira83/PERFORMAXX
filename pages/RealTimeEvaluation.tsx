import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTrainingSessions } from '../services/storageService';
import { Athlete, TrainingSession, TrainingEntry, HeatmapPoint } from '../types';
import { ArrowLeft, Timer, Play, Pause, MapPin, Save, FileText, Loader2, XCircle, CheckCircle, StopCircle, Clock, AlertTriangle, Flag, Mic } from 'lucide-react';
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
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);

  // Timer & Game State
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [gamePeriod, setGamePeriod] = useState<1 | 2>(1); // 1 = 1st Half, 2 = 2nd Half
  const [isHalftime, setIsHalftime] = useState(false);
  
  const timerRef = useRef<number | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);

  // Data Collection State
  const [eventsLog, setEventsLog] = useState<GameEvent[]>([]);
  
  // Interaction State
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0: Idle, 1: Pick Location, 2: Rate Stats
  const [capturedTime, setCapturedTime] = useState<string>('');
  const [capturedSeconds, setCapturedSeconds] = useState<number>(0);
  
  // Custom Modal States
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  // Voice Recognition State
  const [isListening, setIsListening] = useState(false);

  // Temp Data for Current Action
  const [fieldClick, setFieldClick] = useState<{x: number, y: number} | null>(null);
  const [zone, setZone] = useState<'DEF' | 'MID' | 'ATT' | null>(null);
  const [currentNotes, setCurrentNotes] = useState('');
  const [currentStats, setCurrentStats] = useState(getEmptyStats());

  function getEmptyStats() {
      return {
        // Init all to 0 (meaning "not rated" for this specific action)
        velocidade: 0, agilidade: 0, resistencia: 0, forca: 0, coordenacao: 0, mobilidade: 0, estabilidade: 0,
        controle_bola: 0, conducao: 0, passe: 0, recepcao: 0, drible: 0, finalizacao: 0, cruzamento: 0, desarme: 0, interceptacao: 0,
        def_posicionamento: 0, def_pressao: 0, def_cobertura: 0, def_fechamento: 0, def_temporizacao: 0, def_desarme_tatico: 0, def_reacao: 0,
        const_qualidade_passe: 0, const_visao: 0, const_apoios: 0, const_mobilidade: 0, const_circulacao: 0, const_quebra_linhas: 0, const_tomada_decisao: 0,
        ult_movimentacao: 0, ult_ataque_espaco: 0, ult_1v1: 0, ult_ultimo_passe: 0, ult_finalizacao_eficiente: 0, ult_ritmo: 0, ult_bolas_paradas: 0
      };
  }

  useEffect(() => {
    const load = async () => {
      const allAthletes = await getAthletes();
      const found = allAthletes.find(a => a.id === id);
      setAthlete(found || null);
      setLoading(false);
    };
    load();
  }, [id]);

  // Timer Logic
  useEffect(() => {
    if (isRunning) {
      if (!startTime) setStartTime(new Date().toISOString()); // Capture start Date/Time for DB
      
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
          // START GAME (1st Half)
          setIsRunning(true);
      } else if (isRunning && gamePeriod === 1) {
          // END 1st HALF -> PAUSE
          setIsRunning(false);
          setIsHalftime(true);
      } else if (!isRunning && isHalftime) {
          // START 2nd HALF
          setIsHalftime(false);
          setGamePeriod(2);
          setIsRunning(true);
      } else {
          // PAUSE / RESUME (Standard)
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
          alert("Seu navegador não suporta reconhecimento de voz.");
          return;
      }

      if (isListening) return; // Already active

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

  // Step 1: Capture Time
  const handleInsertAction = () => {
    if (!isRunning && timer === 0) return;
    setCapturedTime(formatTime(timer));
    setCapturedSeconds(timer);
    setStep(1);
  };

  // Step 2: Field Click
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (step !== 1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setFieldClick({ x, y });

    // Determine Zone
    if (x < 33.33) setZone('DEF');
    else if (x < 66.66) setZone('MID');
    else setZone('ATT');

    setStep(2);
  };

  // Step 3: Confirm Action (Push to Log)
  const handleConfirmAction = () => {
      if (!zone || !fieldClick) return;

      const newEvent: GameEvent = {
          timestamp: capturedTime,
          seconds: capturedSeconds,
          period: gamePeriod,
          zone: zone,
          location: fieldClick,
          stats: { ...currentStats }, // Copy values
          note: currentNotes
      };

      setEventsLog(prev => [...prev, newEvent]);

      // Reset UI for next action
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

  // --- FINISH SESSION ---
  const handleFinishSession = async () => {
      setShowFinishModal(false);
      setLoading(true);

      // 1. Calculate Averages
      const finalStats: any = getEmptyStats();
      const counts: any = getEmptyStats();

      // Initialize counts to 0
      Object.keys(counts).forEach(k => counts[k] = 0);

      eventsLog.forEach(evt => {
          Object.keys(evt.stats).forEach(key => {
              const val = evt.stats[key];
              if (val > 0) {
                  finalStats[key] += val;
                  counts[key]++;
              }
          });
      });

      // Divide by count
      Object.keys(finalStats).forEach(key => {
          if (counts[key] > 0) {
              finalStats[key] = Math.round((finalStats[key] / counts[key]) * 2) / 2; // Round to 0.5
          } else {
              finalStats[key] = 5; // Default average if no data points for this stat
          }
      });

      // 2. Create Session
      const sessionDate = startTime ? startTime.split('T')[0] : new Date().toISOString().split('T')[0];
      const sessionId = uuidv4();

      await saveTrainingSession({
          id: sessionId,
          teamId: athlete!.teamId,
          categoryId: athlete!.categoryId,
          date: sessionDate,
          description: 'Análise em Tempo Real' 
      });

      // 3. Create Single Entry with Log in Notes
      const entry: TrainingEntry = {
          id: uuidv4(),
          sessionId,
          athleteId: athlete!.id,
          // Map calculated averages to structure
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
          heatmapPoints: eventsLog.map(e => e.location), // All points
          // STORE THE JSON LOG HERE
          notes: JSON.stringify({
              type: 'REAL_TIME_LOG',
              startTime: startTime,
              totalEvents: eventsLog.length,
              events: eventsLog
          })
      };

      await saveTrainingEntry(entry);
      navigate(`/athletes/${athlete!.id}`);
  };

  const handleAbort = () => {
      setShowCancelModal(false);
      navigate(`/athletes/${athlete?.id}`);
  };

  if (loading || !athlete) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/athletes/${athlete.id}`)} className="text-gray-500 hover:text-blue-600">
                  <ArrowLeft size={24} />
              </button>
              <div>
                  <h1 className="font-bold text-gray-800 leading-tight truncate max-w-[150px] md:max-w-none">{athlete.name}</h1>
                  <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isHalftime ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {isHalftime ? 'Intervalo' : `${gamePeriod}º Tempo`}
                      </span>
                  </span>
              </div>
          </div>
          
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

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-6">
          
          {/* MAIN ACTION BUTTON */}
          {step === 0 && (
              <div className="flex justify-center">
                  <button 
                    onClick={handleInsertAction}
                    disabled={!isRunning}
                    className={`
                        w-full py-6 rounded-2xl font-black text-xl shadow-xl transform transition-all active:scale-95 flex items-center justify-center gap-3 border-b-4
                        ${isRunning ? 'bg-blue-600 text-white border-blue-800 hover:bg-blue-700' : 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'}
                    `}
                  >
                      <MapPin size={28} /> REGISTRAR AÇÃO
                  </button>
              </div>
          )}

          {/* FIELD AREA */}
          <div className={`relative w-full aspect-[16/9] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner group select-none transition-all duration-300 ${step === 1 ? 'ring-4 ring-blue-400 scale-[1.02]' : ''}`}>
              {/* Overlay Prompt */}
              {step === 1 && (
                  <div className="absolute inset-0 bg-black/20 z-10 flex items-center justify-center pointer-events-none">
                      <div className="bg-white/90 backdrop-blur-sm px-6 py-3 rounded-full shadow-2xl text-blue-900 font-bold text-lg animate-bounce border border-blue-200">
                          Toque na posição do atleta
                      </div>
                  </div>
              )}

              {/* Interaction Layer */}
              <div 
                className={`absolute inset-0 z-0 ${step === 1 ? 'cursor-crosshair' : ''}`}
                onClick={handleFieldClick}
              >
                  {/* Field Lines */}
                  <div className="absolute inset-4 border-2 border-white/50 rounded-sm pointer-events-none"></div>
                  <div className="absolute top-0 bottom-0 left-1/3 w-0.5 bg-white/20 pointer-events-none border-r border-dashed border-white/30"></div>
                  <div className="absolute top-0 bottom-0 left-2/3 w-0.5 bg-white/20 pointer-events-none border-r border-dashed border-white/30"></div>
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/50 pointer-events-none"></div>
                  <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                  
                  {/* Helper Labels */}
                  <div className="absolute bottom-2 left-4 text-white/40 font-bold text-[10px] uppercase">Defesa</div>
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white/40 font-bold text-[10px] uppercase">Construção</div>
                  <div className="absolute bottom-2 right-4 text-white/40 font-bold text-[10px] uppercase">Ataque</div>

                  {/* Marker for Current Action */}
                  {fieldClick && (
                      <div 
                        className="absolute w-8 h-8 bg-yellow-400 border-4 border-white rounded-full shadow-xl transform -translate-x-1/2 -translate-y-1/2 z-20 animate-ping-once"
                        style={{ left: `${fieldClick.x}%`, top: `${fieldClick.y}%` }}
                      >
                      </div>
                  )}

                  {/* Ghost Markers for Past Actions */}
                  {eventsLog.map((evt, idx) => (
                      <div 
                        key={idx}
                        className="absolute w-3 h-3 bg-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-0"
                        style={{ left: `${evt.location.x}%`, top: `${evt.location.y}%` }}
                      />
                  ))}
              </div>
          </div>

          {/* DYNAMIC FORM (Step 2) */}
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

                  <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
                      
                      {/* 1. Zone Specific Stats - Only show 3-4 key stats for speed */}
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

                      {/* 2. Observations with Voice Input */}
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

                      {/* 3. Actions */}
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

          {/* Event Log Preview */}
          {eventsLog.length > 0 && step === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex justify-between">
                      <span>Timeline da Sessão</span>
                      <span className="bg-gray-100 text-gray-600 px-2 rounded-full text-xs py-0.5">{eventsLog.length} ações</span>
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                      {eventsLog.slice().reverse().map((evt, i) => (
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

      {/* FIXED FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl z-40 flex justify-between items-center md:px-8">
          <button 
            onClick={() => setShowCancelModal(true)}
            className="text-red-500 font-bold text-sm flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"
          >
              <XCircle size={20} /> <span className="hidden md:inline">Cancelar Análise</span>
          </button>
          
          <button 
            onClick={() => setShowFinishModal(true)}
            disabled={eventsLog.length === 0}
            className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl shadow-lg flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
              <StopCircle size={20} /> ENCERRAR E SALVAR
          </button>
      </div>

      {/* CUSTOM FINISH MODAL */}
      {showFinishModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckCircle className="text-blue-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Encerrar Análise?</h3>
                 <p className="text-gray-500 mb-6">
                     Foram registradas <strong>{eventsLog.length} ações</strong>. 
                     Os dados serão compilados em uma média geral para o perfil do atleta.
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
                         Salvar
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
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Cancelar Análise?</h3>
                 <p className="text-gray-500 mb-6">
                     Tem certeza que deseja cancelar? Todos os dados desta sessão <strong>serão perdidos permanentemente</strong>.
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
                         Sim, Cancelar
                     </button>
                 </div>
             </div>
         </div>
      )}

    </div>
  );
};

export default RealTimeEvaluation;