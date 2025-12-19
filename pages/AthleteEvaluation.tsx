
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  saveTrainingEntry,
  saveTrainingSession
} from '../services/storageService';
import { Athlete, TrainingEntry, TrainingSession, HeatmapPoint, User } from '../types';
import { 
  ArrowLeft, Save, FileText, Loader2, Calendar, AlertCircle, TrendingUp, TrendingDown, 
  Target, Zap, Shield, Rocket, Info, ChevronRight, Activity, Filter, MousePointer2
} from 'lucide-react';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line
} from 'recharts';
import StatSlider from '../components/StatSlider';
import HeatmapField from '../components/HeatmapField';
import { v4 as uuidv4 } from 'uuid';

// --- CONFIGURAÇÃO SEMÂNTICA ---
const IMPACT_LEVELS = [
    { min: 0.61, label: 'Impacto Muito Alto', color: 'bg-green-600', text: 'text-green-600', border: 'border-green-600' },
    { min: 0.30, label: 'Impacto Positivo', color: 'bg-green-400', text: 'text-green-400', border: 'border-green-400' },
    { min: -0.29, label: 'Impacto Neutro', color: 'bg-gray-400', text: 'text-gray-400', border: 'border-gray-400' },
    { min: -0.60, label: 'Impacto Negativo', color: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
    { min: -Infinity, label: 'Risco Tático', color: 'bg-red-600', text: 'text-red-600', border: 'border-red-600' }
];

const getImpact = (score: number) => IMPACT_LEVELS.find(l => score >= l.min) || IMPACT_LEVELS[4];

const AthleteEvaluation: React.FC = () => {
  const { id, entryId } = useParams<{ id: string; entryId?: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [entry, setEntry] = useState<TrainingEntry | null>(null);
  
  // Motor de Filtros
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [selectedTimePoint, setSelectedTimePoint] = useState<number | null>(null);
  const [mapMode, setMapMode] = useState<'all' | 'positiva' | 'negativa'>('all');

  // Dados Brutos (Eventos Táticos extraídos das notas)
  const [events, setEvents] = useState<any[]>([]);
  const [trainingDate, setTrainingDate] = useState('');

  useEffect(() => {
     const load = async () => {
         setLoading(true);
         try {
             const [allAthletes, allEntries, allSessions] = await Promise.all([
                 getAthletes(),
                 getTrainingEntries(),
                 getTrainingSessions(),
             ]);
             
             const foundAthlete = allAthletes.find(a => a.id === id);
             setAthlete(foundAthlete || null);

             if (entryId) {
                 const foundEntry = allEntries.find(e => e.id === entryId);
                 if (foundEntry) {
                     setEntry(foundEntry);
                     const session = allSessions.find(s => s.id === foundEntry.sessionId);
                     if (session) setTrainingDate(session.date);
                     
                     // Extrair eventos do JSON nas notas
                     try {
                        // Ensure it's a string before parsing or assume it's object
                        const noteStr = typeof foundEntry.notes === 'string' ? foundEntry.notes : JSON.stringify(foundEntry.notes || {});
                        const parsed = JSON.parse(noteStr);
                        if (parsed.events) {
                            setEvents(parsed.events);
                        }
                     } catch (e) {
                         setEvents([]);
                     }
                 }
             }
         } catch (err) {
             console.error("Erro ao carregar avaliação:", err);
         } finally {
             setLoading(false);
         }
     };
     load();
  }, [id, entryId]);

  // --- CÁLCULOS TÁTICOS (ESTÁVEIS - CAMADA 1) ---
  const globalStats = useMemo(() => {
      if (events.length === 0) return null;
      
      const calcPhaseScore = (phase: string) => {
          const phaseEvents = events.filter(e => e.phase === phase);
          if (phaseEvents.length === 0) return 0;
          return phaseEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / phaseEvents.length;
      };

      const avgGlobal = events.reduce((acc, curr) => acc + curr.eventScore, 0) / events.length;

      return {
          avgGlobal,
          radarData: [
              { phase: 'Org. Ofensiva', A: calcPhaseScore('OFENSIVA'), fullMark: 1.5 },
              { phase: 'Org. Defensiva', A: calcPhaseScore('DEFENSIVA'), fullMark: 1.5 },
              { phase: 'Trans. Ofensiva', A: calcPhaseScore('TRANSICAO_OF'), fullMark: 1.5 },
              { phase: 'Trans. Defensiva', A: calcPhaseScore('TRANSICAO_DEF'), fullMark: 1.5 },
          ]
      };
  }, [events]);

  const filteredDataset = useMemo(() => {
      let ds = events;
      if (filterPhase !== 'all') ds = ds.filter(e => e.phase === filterPhase);
      if (filterResult !== 'all') ds = ds.filter(e => e.result === filterResult);
      if (selectedTimePoint !== null) {
          ds = ds.filter(e => e.seconds >= selectedTimePoint && e.seconds < selectedTimePoint + 300);
      }
      return ds;
  }, [events, filterPhase, filterResult, selectedTimePoint]);

  const impactRanking = useMemo(() => {
      const grouped = filteredDataset.reduce((acc: any, curr) => {
          if (!acc[curr.action]) acc[curr.action] = { name: curr.action, score: 0, count: 0 };
          acc[curr.action].score += curr.eventScore;
          acc[curr.action].count += 1;
          return acc;
      }, {});

      const list = Object.values(grouped).map((g: any) => ({ ...g, avg: g.score / g.count }));
      return {
          best: [...list].sort((a, b) => b.avg - a.avg).slice(0, 3),
          worst: [...list].sort((a, b) => a.avg - b.avg).slice(0, 3)
      };
  }, [filteredDataset]);

  const dominantChartData = useMemo(() => {
      if (filterPhase === 'all') {
          return globalStats?.radarData.map(d => ({ name: d.phase, score: d.A }));
      } else {
          const actions = filteredDataset.reduce((acc: any, curr) => {
              if (!acc[curr.action]) acc[curr.action] = { name: curr.action, score: 0, count: 0 };
              acc[curr.action].score += curr.eventScore;
              acc[curr.action].count += 1;
              return acc;
          }, {});
          return Object.values(actions).map((a: any) => ({ name: a.name, score: a.score / a.count }));
      }
  }, [filterPhase, filteredDataset, globalStats]);

  const timelineData = useMemo(() => {
      const blocks: any[] = [];
      const maxSeconds = events.length > 0 ? Math.max(...events.map(e => e.seconds)) : 0;
      for (let i = 0; i <= maxSeconds; i += 60) {
          const minEvents = events.filter(e => e.seconds >= i && e.seconds < i + 60);
          const score = minEvents.length > 0 ? minEvents.reduce((acc, c) => acc + c.eventScore, 0) / minEvents.length : 0;
          blocks.push({ time: `${Math.floor(i/60)}'`, score, raw: i });
      }
      return blocks;
  }, [events]);

  const getNotesContent = () => {
      if (!entry?.notes) return 'Nenhuma observação registrada.';
      // Safe conversion for rendering
      if (typeof entry.notes !== 'string') return JSON.stringify(entry.notes);
      return entry.notes;
  };

  const notesStr = getNotesContent();

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center">Atleta não encontrado.</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                 <div className="flex items-center gap-4">
                     <button onClick={() => navigate(`/athletes/${athlete.id}`)} className="text-gray-400 hover:text-blue-600 transition-colors">
                         <ArrowLeft size={24} />
                     </button>
                     <div className="flex items-center gap-3">
                         {athlete.photoUrl ? <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">{athlete.name.charAt(0)}</div>}
                         <div>
                            <h2 className="text-lg font-bold text-gray-800 leading-none">{athlete.name}</h2>
                            <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-wider">{athlete.position} • {trainingDate}</p>
                         </div>
                     </div>
                 </div>
                 {/* Remove Save button from view mode to prevent confusion unless editing is implemented */}
            </div>

            {/* CAMADA 1 — PERFIL TÁTICO (FIXO) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-8">
                    <div className="w-full md:w-1/2 h-[220px]">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={14}/> Dominância por Fase</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={globalStats?.radarData || []}>
                                <PolarGrid stroke="#e5e7eb" />
                                <PolarAngleAxis dataKey="phase" tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                <Radar name="Score" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.5} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="w-full md:w-1/2 space-y-6">
                        <div>
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Activity size={14}/> Impacto Geral no Jogo</h3>
                            <div className="relative h-4 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                <div 
                                    className={`absolute inset-y-0 left-0 transition-all duration-1000 ${impact.color}`}
                                    style={{ width: `${Math.max(0, Math.min(100, ((globalStats?.avgGlobal || 0) + 1.5) / 3 * 100))}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <span className={`text-lg font-black uppercase tracking-tighter ${impact.text}`}>{impact.label}</span>
                                <span className="text-2xl font-mono font-black text-gray-800">{(globalStats?.avgGlobal || 0).toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Ações Analisadas</p>
                            <p className="text-xl font-black text-gray-800">{events.length} <span className="text-xs text-gray-400 font-medium">cliques táticos registrados</span></p>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-900 text-white p-6 rounded-2xl shadow-xl flex flex-col justify-between">
                    <h3 className="text-xs font-black text-blue-300 uppercase tracking-widest mb-4 flex items-center gap-2"><Filter size={14}/> Filtros de Contexto</h3>
                    <div className="space-y-3">
                        <select 
                            value={filterPhase} 
                            onChange={(e) => setFilterPhase(e.target.value)}
                            className="w-full bg-blue-800 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-400"
                        >
                            <option value="all">Todas as Fases</option>
                            <option value="OFENSIVA">Organização Ofensiva</option>
                            <option value="DEFENSIVA">Organização Defensiva</option>
                            <option value="TRANSICAO_OF">Transição Ofensiva</option>
                            <option value="TRANSICAO_DEF">Transição Defensiva</option>
                        </select>
                        <select 
                            value={filterResult} 
                            onChange={(e) => setFilterResult(e.target.value)}
                            className="w-full bg-blue-800 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-400"
                        >
                            <option value="all">Todos os Resultados</option>
                            <option value="POSITIVA">Ações Positivas</option>
                            <option value="NEUTRA">Ações Neutras</option>
                            <option value="NEGATIVA">Ações Negativas</option>
                        </select>
                        <button 
                            onClick={() => {setFilterPhase('all'); setFilterResult('all'); setSelectedTimePoint(null);}}
                            className="w-full py-2 text-[10px] font-black uppercase text-blue-300 hover:text-white transition-colors underline decoration-blue-500 underline-offset-4"
                        >
                            Limpar todos os filtros
                        </button>
                    </div>
                </div>
            </div>

            {/* CAMADA 2 — CONTEXTO DE DESEMPENHO (REATIVO) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative min-h-[350px]">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                           {filterPhase === 'all' ? <Activity size={18} className="text-blue-500"/> : <Zap size={18} className="text-yellow-500"/>}
                           {filterPhase === 'all' ? 'Desempenho por Fase do Jogo' : `Impacto das Ações: ${filterPhase.replace('_', ' ')}`}
                        </h3>
                    </div>

                    {filteredDataset.length >= 5 ? (
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dominantChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 700}} />
                                    <YAxis domain={[-1.5, 1.5]} axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} />
                                    <Tooltip 
                                        cursor={{fill: '#f9fafb'}}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar dataKey="score" radius={[6, 6, 0, 0]} barSize={40}>
                                        {dominantChartData?.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.score >= 0.3 ? '#10b981' : entry.score <= -0.3 ? '#ef4444' : '#9ca3af'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[250px] flex flex-col items-center justify-center text-gray-400 gap-2">
                            <AlertCircle size={32} className="opacity-20" />
                            <p className="text-sm font-bold uppercase tracking-widest opacity-50">Volume Insuficiente para Análise</p>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={12}/> Top Impacto</h3>
                    </div>
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        <div>
                            <span className="text-[9px] font-bold text-green-600 uppercase mb-2 block tracking-tight">Melhores Decisões</span>
                            <div className="space-y-1">
                                {impactRanking.best.map((a, i) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-green-50 border border-green-100">
                                        <span className="text-xs font-black text-green-800 truncate pr-2">{a.name}</span>
                                        <span className="text-xs font-mono font-black text-green-600">+{a.avg.toFixed(1)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="border-t border-dashed border-gray-100 pt-4">
                            <span className="text-[9px] font-bold text-red-500 uppercase mb-2 block tracking-tight">Risco/Atenção</span>
                            <div className="space-y-1">
                                {impactRanking.worst.map((a, i) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-red-50 border border-red-100">
                                        <span className="text-xs font-black text-red-800 truncate pr-2">{a.name}</span>
                                        <span className="text-xs font-mono font-black text-red-600">{a.avg.toFixed(1)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CAMADA 3 — ESPAÇO E TEMPO (DINÂMICA) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MousePointer2 size={14}/> Distribuição Espacial</h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['all', 'positiva', 'negativa'] as const).map(mode => (
                                <button 
                                    key={mode} 
                                    onClick={() => setMapMode(mode)}
                                    className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${mapMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                                >
                                    {mode === 'all' ? 'Todas' : mode === 'positiva' ? 'Sucesso' : 'Erro'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        <HeatmapField 
                            perspective={true} 
                            readOnly={true} 
                            points={filteredDataset.filter(e => {
                                if (mapMode === 'all') return true;
                                return mapMode === 'positiva' ? e.result === 'POSITIVA' : e.result === 'NEGATIVA';
                            }).map(e => e.location)} 
                        />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Activity size={14}/> Timeline de Intensidade</h3>
                    <div className="flex-1 min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart 
                                data={timelineData} 
                                onClick={(data) => {
                                    if (data && data.activePayload) {
                                        setSelectedTimePoint(data.activePayload[0].payload.raw);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} />
                                <YAxis domain={[-1.5, 1.5]} hide />
                                <Tooltip 
                                    cursor={{stroke: '#2563eb', strokeWidth: 2}}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length > 0) {
                                            const val = Number(payload[0].value);
                                            return (
                                                <div className="bg-gray-900 text-white p-2 rounded-lg text-[10px] font-bold shadow-xl border border-gray-700">
                                                    <p>{payload[0].payload.time}: Impacto {!isNaN(val) ? val.toFixed(2) : '0.00'}</p>
                                                    <p className="text-blue-400 mt-1">Clique para filtrar este período</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="score" 
                                    stroke="#2563eb" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} 
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    {selectedTimePoint !== null && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center animate-fade-in">
                            <span className="text-xs font-bold text-blue-700">Filtro Temporal Ativo: Minutos {Math.floor(selectedTimePoint/60)} a {Math.floor(selectedTimePoint/60) + 5}</span>
                            <button onClick={() => setSelectedTimePoint(null)} className="text-[10px] font-black text-blue-500 uppercase hover:text-blue-800 transition-colors">Remover</button>
                        </div>
                    )}
                    <p className="text-[10px] text-gray-400 font-medium mt-4 text-center">Clique nos pontos da linha para isolar momentos específicos do jogo.</p>
                </div>
            </div>

            {/* Observações de Campo */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><FileText size={14}/> Observações e Notas Técnicas</h3>
                <div className="prose prose-sm max-w-none text-gray-600 italic">
                    {notesStr.startsWith('[Log') ? (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
                            <Info className="text-blue-500 shrink-0" size={20} />
                            <p className="text-blue-700 text-sm font-medium">Os dados desta sessão foram capturados através da ferramenta de <span className="font-bold underline">Análise em Tempo Real</span>. Os scores e mapas de calor foram gerados automaticamente pelo algoritmo de impacto.</p>
                        </div>
                    ) : (
                        <div dangerouslySetInnerHTML={{ __html: notesStr }} />
                    )}
                </div>
            </div>

        </div>
    </div>
  );
};

export default AthleteEvaluation;
