import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  saveTrainingEntry,
  saveTrainingSession,
  deleteTrainingEntry
} from '../services/storageService';
import { Athlete, TrainingEntry, TrainingSession, HeatmapPoint, User } from '../types';
import { ArrowLeft, Save, Trash2, FileText, Loader2, Calendar, AlertCircle } from 'lucide-react';
import StatSlider from '../components/StatSlider';
import HeatmapField from '../components/HeatmapField';
import { v4 as uuidv4 } from 'uuid';

const AthleteEvaluation: React.FC = () => {
  const { id, entryId } = useParams<{ id: string; entryId?: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  
  // Form State
  const [trainingDate, setTrainingDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentHeatmapPoints, setCurrentHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [currentNotes, setCurrentNotes] = useState('');
  
  // Logic for Real Time Filtering
  const [isRealTimeLog, setIsRealTimeLog] = useState(false);
  const [registeredKeys, setRegisteredKeys] = useState<Set<string>>(new Set());

  const [currentStats, setCurrentStats] = useState({
    // Condição Física
    velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5,
    // Fundamentos
    controle_bola: 5, conducao: 5, passe: 5, recepcao: 5, drible: 5, finalizacao: 5, cruzamento: 5, desarme: 5, interceptacao: 5,
    // Tático - Defendendo
    def_posicionamento: 5, def_pressao: 5, def_cobertura: 5, def_fechamento: 5, def_temporizacao: 5, def_desarme_tatico: 5, def_reacao: 5,
    // Tático - Construindo
    const_qualidade_passe: 5, const_visao: 5, const_apoios: 5, const_mobilidade: 5, const_circulacao: 5, const_quebra_linhas: 5, const_tomada_decisao: 5,
    // Tático - Último Terço
    ult_movimentacao: 5, ult_ataque_espaco: 5, ult_1v1: 5, ult_ultimo_passe: 5, ult_finalizacao_eficiente: 5, ult_ritmo: 5, ult_bolas_paradas: 5
  });

  useEffect(() => {
     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions] = await Promise.all([
             getAthletes(),
             getTrainingEntries(),
             getTrainingSessions(),
         ]);
         
         const foundAthlete = allAthletes.find(a => a.id === id);
         setAthlete(foundAthlete || null);

         if (entryId && foundAthlete) {
             const entry = allEntries.find(e => e.id === entryId);
             if (entry) {
                 const session = allSessions.find(s => s.id === entry.sessionId);
                 if (session) setTrainingDate(session.date);
                 
                 // Handle Notes and Real Time Logs logic
                 let displayNotes = entry.notes || '';
                 let isRT = false;
                 const keysFound = new Set<string>();

                 try {
                    const parsed = JSON.parse(displayNotes);
                    if (parsed.type === 'REAL_TIME_LOG') {
                        isRT = true;
                        displayNotes = `[Log de Tempo Real: ${parsed.totalEvents} ações registradas]`;
                        
                        // Parse events to find which stats were actually touched
                        if (parsed.events && Array.isArray(parsed.events)) {
                            parsed.events.forEach((evt: any) => {
                                if (evt.stats) {
                                    Object.entries(evt.stats).forEach(([key, val]) => {
                                        if (Number(val) > 0) {
                                            keysFound.add(key);
                                        }
                                    });
                                }
                            });
                        }
                    }
                 } catch (e) {
                     // Not JSON or standard note
                 }

                 setIsRealTimeLog(isRT);
                 setRegisteredKeys(keysFound);
                 setCurrentNotes(displayNotes);
                 setCurrentHeatmapPoints(entry.heatmapPoints || []);
                 
                 const reset = resetStats();
                 setCurrentStats({
                     ...reset,
                     ...entry.technical,
                     ...entry.physical,
                     ...entry.tactical
                 });
             }
         } else if (foundAthlete) {
             // Calculate Averages for NEW entry
             const athleteEntries = allEntries.filter(e => e.athleteId === id);
             if (athleteEntries.length > 0) {
                 const defaultKeys = resetStats();
                 const newStats: any = {};
                 
                 Object.keys(defaultKeys).forEach(key => {
                    let sum = 0;
                    let count = 0;
                    
                    athleteEntries.forEach(entry => {
                        const val = (entry.technical as any)[key] ?? (entry.physical as any)[key] ?? (entry.tactical as any)?.[key];
                        if (val !== undefined && val !== null) {
                            sum += Number(val);
                            count++;
                        }
                    });
                    
                    if (count > 0) {
                        newStats[key] = Math.round((sum / count) * 2) / 2;
                    } else {
                        newStats[key] = 5;
                    }
                });
                setCurrentStats(newStats);
             }
         }
         setLoading(false);
     };
     load();
  }, [id, entryId]);

  const resetStats = () => ({
        velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5,
        controle_bola: 5, conducao: 5, passe: 5, recepcao: 5, drible: 5, finalizacao: 5, cruzamento: 5, desarme: 5, interceptacao: 5,
        def_posicionamento: 5, def_pressao: 5, def_cobertura: 5, def_fechamento: 5, def_temporizacao: 5, def_desarme_tatico: 5, def_reacao: 5,
        const_qualidade_passe: 5, const_visao: 5, const_apoios: 5, const_mobilidade: 5, const_circulacao: 5, const_quebra_linhas: 5, const_tomada_decisao: 5,
        ult_movimentacao: 5, ult_ataque_espaco: 5, ult_1v1: 5, ult_ultimo_passe: 5, ult_finalizacao_eficiente: 5, ult_ritmo: 5, ult_bolas_paradas: 5
  });

  const handleSaveTraining = async () => {
     if (!athlete || !trainingDate) return;
     
     let sessionId = null;
     const allSessions = await getTrainingSessions();
     
     // Find or create session
     const existingSession = allSessions.find(s => s.date === trainingDate && s.teamId === athlete.teamId && s.categoryId === athlete.categoryId);
     if (existingSession) {
         sessionId = existingSession.id;
     } else {
         sessionId = uuidv4();
         const newSession: TrainingSession = {
             id: sessionId,
             date: trainingDate,
             teamId: athlete.teamId,
             categoryId: athlete.categoryId,
             description: 'Atuação (Perfil)'
         };
         await saveTrainingSession(newSession);
     }

     // Preserve original notes if it was a real-time log and user didn't change it
     let notesToSave = currentNotes;
     if (entryId && isRealTimeLog && currentNotes.startsWith('[Log de Tempo Real')) {
         const allEntries = await getTrainingEntries();
         const originalEntry = allEntries.find(e => e.id === entryId);
         if (originalEntry) notesToSave = originalEntry.notes || '';
     }

     const entry: TrainingEntry = {
         id: entryId || uuidv4(),
         sessionId: sessionId,
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
         heatmapPoints: currentHeatmapPoints,
         notes: notesToSave
     };
     
     await saveTrainingEntry(entry);
     navigate(`/athletes/${athlete.id}`);
  };

  const handleDelete = async () => {
      if (entryId && window.confirm('Deseja realmente excluir esta atuação?')) {
          await deleteTrainingEntry(entryId);
          navigate(`/athletes/${athlete?.id}`);
      }
  };

  // Helper to check visibility based on Real Time mode
  const shouldShowStat = (key: string) => {
      if (!isRealTimeLog) return true; // Show all for normal editing
      return registeredKeys.has(key);
  };

  // Helper to render a slider conditionally
  const renderStat = (label: string, key: keyof typeof currentStats) => {
      if (!shouldShowStat(key as string)) return null;
      return (
          <StatSlider 
              label={label} 
              value={currentStats[key]} 
              onChange={v => setCurrentStats(prev => ({...prev, [key]: v}))} 
          />
      );
  };

  // Helper to check if a section should be rendered at all
  const shouldShowSection = (keysToCheck: (keyof typeof currentStats)[]) => {
      if (!isRealTimeLog) return true;
      return keysToCheck.some(key => registeredKeys.has(key as string));
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm sticky top-0 z-20">
                 <div className="flex items-center gap-4">
                     <button onClick={() => navigate(`/athletes/${athlete.id}`)} className="text-gray-500 hover:text-blue-600">
                         <ArrowLeft size={24} />
                     </button>
                     <div>
                         <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                             {entryId ? 'Editar Atuação' : 'Nova Atuação'}
                         </h2>
                         <p className="text-sm text-gray-500">{athlete.name} • {athlete.position}</p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-3">
                     <input 
                       type="date" 
                       value={trainingDate} 
                       onChange={(e) => setTrainingDate(e.target.value)} 
                       className="text-sm font-bold text-gray-700 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" 
                     />
                     {entryId && (
                         <button onClick={handleDelete} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Excluir">
                             <Trash2 size={20} />
                         </button>
                     )}
                 </div>
            </div>

            {isRealTimeLog && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex items-center gap-3 animate-fade-in">
                    <AlertCircle className="text-blue-600" />
                    <p className="text-blue-800 text-sm">
                        Esta é uma análise de tempo real. Apenas os indicadores registrados durante o jogo estão sendo exibidos. 
                        <span className="font-bold ml-1">Indicadores não avaliados foram ocultados.</span>
                    </p>
                </div>
            )}

            <div className="space-y-6">
                  {/* Heatmap Input */}
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                       <HeatmapField 
                          points={currentHeatmapPoints} 
                          onChange={setCurrentHeatmapPoints} 
                          label="Mapa de Calor (Toque para marcar)" 
                       />
                  </div>

                  {/* Stats Sliders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Defendendo */}
                      {shouldShowSection(['def_posicionamento', 'def_pressao', 'def_cobertura', 'def_fechamento', 'def_temporizacao', 'def_desarme_tatico', 'def_reacao']) && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 h-fit">
                               <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Defendendo</h4>
                               {renderStat("Posicionamento", "def_posicionamento")}
                               {renderStat("Pressão", "def_pressao")}
                               {renderStat("Cobertura", "def_cobertura")}
                               {renderStat("Fechamento", "def_fechamento")}
                               {renderStat("Temporização", "def_temporizacao")}
                               {renderStat("Desarme Tát.", "def_desarme_tatico")}
                               {renderStat("Reação", "def_reacao")}
                          </div>
                      )}

                      {/* Construindo */}
                      {shouldShowSection(['const_qualidade_passe', 'const_visao', 'const_apoios', 'const_mobilidade', 'const_circulacao', 'const_quebra_linhas', 'const_tomada_decisao']) && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 h-fit">
                               <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Construindo</h4>
                               {renderStat("Qual. Passe", "const_qualidade_passe")}
                               {renderStat("Visão", "const_visao")}
                               {renderStat("Apoios", "const_apoios")}
                               {renderStat("Mobilidade", "const_mobilidade")}
                               {renderStat("Circulação", "const_circulacao")}
                               {renderStat("Quebra Linhas", "const_quebra_linhas")}
                               {renderStat("Decisão", "const_tomada_decisao")}
                          </div>
                      )}

                      {/* Último Terço */}
                      {shouldShowSection(['ult_movimentacao', 'ult_ataque_espaco', 'ult_1v1', 'ult_ultimo_passe', 'ult_finalizacao_eficiente', 'ult_ritmo', 'ult_bolas_paradas']) && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 h-fit">
                               <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Último Terço</h4>
                               {renderStat("Movimentação", "ult_movimentacao")}
                               {renderStat("Atq Espaço", "ult_ataque_espaco")}
                               {renderStat("1v1", "ult_1v1")}
                               {renderStat("Último Passe", "ult_ultimo_passe")}
                               {renderStat("Finalização", "ult_finalizacao_eficiente")}
                               {renderStat("Ritmo", "ult_ritmo")}
                               {renderStat("Bolas Paradas", "ult_bolas_paradas")}
                          </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Technical */}
                      {shouldShowSection(['controle_bola', 'conducao', 'passe', 'recepcao', 'drible', 'finalizacao', 'cruzamento', 'desarme', 'interceptacao']) && (
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 h-fit">
                               <h4 className="text-sm uppercase font-bold text-blue-700 mb-4 border-b border-blue-200 pb-2">Fundamentos</h4>
                               {renderStat("Controle", "controle_bola")}
                               {renderStat("Condução", "conducao")}
                               {renderStat("Passe", "passe")}
                               {renderStat("Recepção", "recepcao")}
                               {renderStat("Drible", "drible")}
                               {renderStat("Finalização", "finalizacao")}
                               {renderStat("Cruzamento", "cruzamento")}
                               {renderStat("Desarme", "desarme")}
                               {renderStat("Intercept.", "interceptacao")}
                          </div>
                      )}

                      {/* Physical */}
                      {shouldShowSection(['velocidade', 'agilidade', 'resistencia', 'forca', 'coordenacao', 'mobilidade', 'estabilidade']) && (
                          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 h-fit">
                               <h4 className="text-sm uppercase font-bold text-orange-700 mb-4 border-b border-orange-200 pb-2">Físico</h4>
                               {renderStat("Velocidade", "velocidade")}
                               {renderStat("Agilidade", "agilidade")}
                               {renderStat("Resistência", "resistencia")}
                               {renderStat("Força", "forca")}
                               {renderStat("Coordenação", "coordenacao")}
                               {renderStat("Mobilidade", "mobilidade")}
                               {renderStat("Estabilidade", "estabilidade")}
                          </div>
                      )}
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                          <FileText size={16} /> Observações
                      </h4>
                      <textarea 
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                        value={currentNotes}
                        onChange={(e) => setCurrentNotes(e.target.value)}
                        placeholder="Notas sobre a atuação..."
                      ></textarea>
                  </div>

                  <button 
                    onClick={handleSaveTraining}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 text-lg"
                  >
                      <Save size={20} /> Salvar Atuação
                  </button>
            </div>
        </div>
    </div>
  );
};

export default AthleteEvaluation;