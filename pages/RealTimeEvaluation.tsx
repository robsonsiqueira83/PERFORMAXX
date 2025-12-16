import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAthletes, saveTrainingEntry, saveTrainingSession, getTrainingSessions } from '../services/storageService';
import { Athlete, TrainingSession, TrainingEntry, HeatmapPoint } from '../types';
import { ArrowLeft, Timer, Play, Pause, MapPin, Save, FileText, Loader2, AlertCircle } from 'lucide-react';
import StatSlider from '../components/StatSlider';
import { v4 as uuidv4 } from 'uuid';

const RealTimeEvaluation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);

  // Timer State
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Evaluation Flow State
  // 0: Idle/Running, 1: Action Timestamp Captured (Waiting for Field Click), 2: Zone Selected (Form Open)
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [capturedTime, setCapturedTime] = useState<string>('');
  
  // Field Data
  const [fieldClick, setFieldClick] = useState<{x: number, y: number} | null>(null);
  const [zone, setZone] = useState<'DEF' | 'MID' | 'ATT' | null>(null);

  // Form Data
  const [currentNotes, setCurrentNotes] = useState('');
  const [currentStats, setCurrentStats] = useState({
    // Condição Física (Optional here, mostly focusing on Tactical/Tech)
    velocidade: 0, agilidade: 0, resistencia: 0, forca: 0, coordenacao: 0, mobilidade: 0, estabilidade: 0,
    // Fundamentos
    controle_bola: 0, conducao: 0, passe: 0, recepcao: 0, drible: 0, finalizacao: 0, cruzamento: 0, desarme: 0, interceptacao: 0,
    // Tático - Defendendo
    def_posicionamento: 0, def_pressao: 0, def_cobertura: 0, def_fechamento: 0, def_temporizacao: 0, def_desarme_tatico: 0, def_reacao: 0,
    // Tático - Construindo
    const_qualidade_passe: 0, const_visao: 0, const_apoios: 0, const_mobilidade: 0, const_circulacao: 0, const_quebra_linhas: 0, const_tomada_decisao: 0,
    // Tático - Último Terço
    ult_movimentacao: 0, ult_ataque_espaco: 0, ult_1v1: 0, ult_ultimo_passe: 0, ult_finalizacao_eficiente: 0, ult_ritmo: 0, ult_bolas_paradas: 0
  });

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
      timerRef.current = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
      
      // Request Wake Lock
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

  const handleToggleTimer = () => setIsRunning(!isRunning);

  // Step 1: Capture Time
  const handleInsertAction = () => {
    setCapturedTime(formatTime(timer));
    setStep(1);
    // Do not stop timer, game continues
  };

  // Step 2: Field Click
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (step !== 1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setFieldClick({ x, y });

    // Determine Zone (0-33: Def, 33-66: Mid, 66-100: Att)
    // Assuming Left is Defense, Right is Attack
    if (x < 33.33) setZone('DEF');
    else if (x < 66.66) setZone('MID');
    else setZone('ATT');

    setStep(2);
  };

  // Step 3: Save Action
  const handleSaveAction = async () => {
    if (!athlete) return;

    // 1. Find or Create Session for Today
    const today = new Date().toISOString().split('T')[0];
    const sessions = await getTrainingSessions();
    let sessionId = sessions.find(s => s.teamId === athlete.teamId && s.date === today && s.categoryId === athlete.categoryId)?.id;

    if (!sessionId) {
        sessionId = uuidv4();
        await saveTrainingSession({
            id: sessionId,
            teamId: athlete.teamId,
            categoryId: athlete.categoryId,
            date: today,
            description: 'Análise em Tempo Real'
        });
    }

    // 2. Prepare Entry Data
    // We only save the stats that were populated (non-zero). 
    // Ideally, "Real-time" should append to a single session entry or create granular entries. 
    // Given the constraints, we create a discrete entry representing this action event.
    
    // Notes auto-format
    const timestampNote = `[${capturedTime}] Ação em ${zone}: ${currentNotes}`;

    const entry: TrainingEntry = {
        id: uuidv4(),
        sessionId,
        athleteId: athlete.id,
        technical: {
            controle_bola: currentStats.controle_bola, conducao: currentStats.conducao, passe: currentStats.passe,
            recepcao: currentStats.recepcao, drible: currentStats.drible, finalizacao: currentStats.finalizacao,
            cruzamento: currentStats.cruzamento, desarme: currentStats.desarme, interceptacao: currentStats.interceptacao
        },
        physical: {
            velocidade: currentStats.velocidade, agilidade: currentStats.agilidade, resistencia: currentStats.resistencia,
            forca: currentStats.forca, coordenacao: currentStats.coordenacao, mobilidade: currentStats.mobilidade, estabilidade: currentStats.estabilidade
        },
        tactical: {
            def_posicionamento: currentStats.def_posicionamento, def_pressao: currentStats.def_pressao, def_cobertura: currentStats.def_cobertura,
            def_fechamento: currentStats.def_fechamento, def_temporizacao: currentStats.def_temporizacao, def_desarme_tatico: currentStats.def_desarme_tatico,
            def_reacao: currentStats.def_reacao,
            const_qualidade_passe: currentStats.const_qualidade_passe, const_visao: currentStats.const_visao, const_apoios: currentStats.const_apoios,
            const_mobilidade: currentStats.const_mobilidade, const_circulacao: currentStats.const_circulacao, const_quebra_linhas: currentStats.const_quebra_linhas,
            const_tomada_decisao: currentStats.const_tomada_decisao,
            ult_movimentacao: currentStats.ult_movimentacao, ult_ataque_espaco: currentStats.ult_ataque_espaco, ult_1v1: currentStats.ult_1v1,
            ult_ultimo_passe: currentStats.ult_ultimo_passe, ult_finalizacao_eficiente: currentStats.ult_finalizacao_eficiente,
            ult_ritmo: currentStats.ult_ritmo, ult_bolas_paradas: currentStats.ult_bolas_paradas
        },
        heatmapPoints: fieldClick ? [{ x: fieldClick.x, y: fieldClick.y }] : [],
        notes: timestampNote
    };

    await saveTrainingEntry(entry);

    // 3. Reset for next action (Keep timer running)
    setStep(0);
    setFieldClick(null);
    setZone(null);
    setCapturedTime('');
    setCurrentNotes('');
    // Reset stats to 0 for next entry
    setCurrentStats(prev => {
        const reset: any = {};
        Object.keys(prev).forEach(k => reset[k] = 0);
        return reset as any;
    });
  };

  const handleCancelAction = () => {
      setStep(0);
      setFieldClick(null);
      setZone(null);
      setCapturedTime('');
  };

  if (loading || !athlete) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      
      {/* Header */}
      <div className="bg-white p-4 shadow-sm border-b border-gray-100 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-blue-600">
                  <ArrowLeft size={24} />
              </button>
              <div>
                  <h1 className="font-bold text-gray-800 leading-tight">{athlete.name}</h1>
                  <span className="text-xs text-gray-500 font-mono">Análise Ao Vivo</span>
              </div>
          </div>
          
          <div className="flex items-center gap-2">
              <div className={`font-mono text-xl font-bold px-3 py-1 rounded-lg ${isRunning ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-100 text-gray-500'}`}>
                  {formatTime(timer)}
              </div>
              <button 
                onClick={handleToggleTimer}
                className={`p-2 rounded-full shadow-sm transition-all ${isRunning ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
              >
                  {isRunning ? <Pause size={20} /> : <Play size={20} />}
              </button>
          </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-6">
          
          {/* ACTION BUTTON */}
          <div className="flex items-center gap-4">
              <button 
                onClick={handleInsertAction}
                disabled={!isRunning && timer === 0}
                className={`flex-1 py-4 rounded-2xl font-bold text-lg shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2
                    ${step > 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}
                `}
              >
                  <MapPin size={24} /> {step === 0 ? 'REGISTRAR AÇÃO' : 'Ação em andamento...'}
              </button>
          </div>

          {/* FIELD AREA */}
          <div className="relative w-full aspect-[16/9] bg-green-600 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner group select-none">
              {/* Overlay Prompt */}
              {step === 1 && (
                  <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center pointer-events-none">
                      <div className="bg-white px-4 py-2 rounded-full shadow-lg text-blue-900 font-bold text-sm animate-bounce">
                          Toque no campo para localizar
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

                  {/* Marker */}
                  {fieldClick && (
                      <div 
                        className="absolute w-6 h-6 bg-yellow-400 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-300 ease-out"
                        style={{ left: `${fieldClick.x}%`, top: `${fieldClick.y}%` }}
                      >
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                              {capturedTime}
                          </div>
                      </div>
                  )}
              </div>
          </div>

          {/* DYNAMIC FORM (Step 2) */}
          {step === 2 && zone && (
              <div className="animate-slide-up bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                  <div className={`p-4 border-b text-white flex justify-between items-center
                      ${zone === 'DEF' ? 'bg-purple-600' : zone === 'MID' ? 'bg-blue-600' : 'bg-orange-600'}
                  `}>
                      <div>
                          <h3 className="font-bold text-lg">
                              {zone === 'DEF' && 'Ação Defensiva'}
                              {zone === 'MID' && 'Construção / Meio'}
                              {zone === 'ATT' && 'Ação Ofensiva / Final'}
                          </h3>
                          <p className="text-xs opacity-80">Preencha os dados da jogada</p>
                      </div>
                      <div className="font-mono bg-white/20 px-2 py-1 rounded text-sm">{capturedTime}</div>
                  </div>

                  <div className="p-6 space-y-6">
                      
                      {/* 1. Zone Specific Stats */}
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

                      {/* 2. Observations */}
                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <FileText size={16} /> Observações Rápidas
                          </label>
                          <textarea 
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 text-sm"
                            placeholder="Detalhes do lance..."
                            value={currentNotes}
                            onChange={(e) => setCurrentNotes(e.target.value)}
                          ></textarea>
                      </div>

                      {/* 3. Actions */}
                      <div className="flex gap-3 pt-2">
                          <button 
                            onClick={handleCancelAction}
                            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50"
                          >
                              Cancelar
                          </button>
                          <button 
                            onClick={handleSaveAction}
                            className={`flex-[2] py-3 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2
                                ${zone === 'DEF' ? 'bg-purple-600 hover:bg-purple-700' : zone === 'MID' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}
                            `}
                          >
                              <Save size={18} /> Salvar & Continuar
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {step === 0 && (
              <div className="text-center text-gray-400 text-sm py-10 border-2 border-dashed border-gray-200 rounded-xl">
                  <Timer size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Aguardando início da ação...</p>
              </div>
          )}

      </div>
    </div>
  );
};

export default RealTimeEvaluation;