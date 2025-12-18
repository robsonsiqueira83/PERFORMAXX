import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  deleteAthlete, 
  saveAthlete,
  getCategories,
  deleteTrainingEntry,
  getTeams
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { calculateTotalScore, TrainingEntry, Athlete, Position, TrainingSession, getCalculatedCategory, HeatmapPoint, User, canEditData, canDeleteData, Team, UserRole } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, Cell
} from 'recharts';
import { 
  Edit, Trash2, ArrowLeft, ClipboardList, User as UserIcon, Save, X, FileText, Loader2, 
  Calendar, ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Upload, 
  Clock, Copy, CheckCircle, Timer, PlayCircle, PauseCircle, Activity, Target, Zap, Info, Filter, MousePointer2, AlertCircle, AlertTriangle, RefreshCw, ArrowRightLeft, Search
} from 'lucide-react';
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

const AthleteProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Motor de Filtros
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [selectedTimePoint, setSelectedTimePoint] = useState<string | null>(null); // Filtro por jogo (sessionId)
  const [mapMode, setMapMode] = useState<'all' | 'positiva' | 'negativa'>('all');

  // Modais e UI
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; type: 'athlete' | 'entry' | null; id?: string }>({ isOpen: false, type: null });
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});
  const [uploading, setUploading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
     const storedUser = localStorage.getItem('performax_current_user');
     if (storedUser) setCurrentUser(JSON.parse(storedUser));

     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allCats, teams] = await Promise.all([
             getAthletes(),
             getTrainingEntries(),
             getTrainingSessions(),
             getCategories(),
             getTeams()
         ]);
         
         setAllTeams(teams);
         const foundAthlete = allAthletes.find(a => a.id === id);
         
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setEditFormData({...foundAthlete});
             setCategories(allCats.filter(c => c.teamId === foundAthlete.teamId));
             setEntries(allEntries.filter(e => e.athleteId === id));
             setSessions(allSessions);
         }
         setLoading(false);
     };
     load();
  }, [id, refreshKey]);

  // --- EXTRAÇÃO DE EVENTOS TÁTICOS (AGREGADO) ---
  const allEvents = useMemo(() => {
      let events: any[] = [];
      entries.forEach(entry => {
          try {
              const notes = JSON.parse(entry.notes || '{}');
              if (notes.events) {
                  // Adiciona o ID da sessão para filtro temporal
                  events = [...events, ...notes.events.map((e: any) => ({ ...e, sessionId: entry.sessionId }))];
              }
          } catch (e) { /* ignore */ }
      });
      return events;
  }, [entries]);

  // --- MOTOR DE FILTROS REATIVO ---
  const filteredEvents = useMemo(() => {
      let ds = allEvents;
      if (filterPhase !== 'all') ds = ds.filter(e => e.phase === filterPhase);
      if (filterResult !== 'all') ds = ds.filter(e => e.result === filterResult);
      if (selectedTimePoint) ds = ds.filter(e => e.sessionId === selectedTimePoint);
      
      // Filtro de Período (Últimos treinos)
      const now = new Date();
      if (selectedPeriod !== 'all') {
          ds = ds.filter(e => {
              const session = sessions.find(s => s.id === e.sessionId);
              if (!session) return false;
              const sDate = new Date(session.date);
              if (selectedPeriod === 'today') return session.date === now.toISOString().split('T')[0];
              if (selectedPeriod === 'week') return sDate >= new Date(now.setDate(now.getDate() - 7));
              if (selectedPeriod === 'month') return sDate >= new Date(now.setMonth(now.getMonth() - 1));
              return true;
          });
      }
      return ds;
  }, [allEvents, filterPhase, filterResult, selectedTimePoint, selectedPeriod, sessions]);

  // --- CAMADA 1: PERFIL (ESTÁVEL) ---
  const globalStats = useMemo(() => {
      if (allEvents.length === 0) return null;
      const calcPhaseScore = (phase: string) => {
          const phaseEvents = allEvents.filter(e => e.phase === phase);
          return phaseEvents.length === 0 ? 0 : phaseEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / phaseEvents.length;
      };
      const avgGlobal = allEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / allEvents.length;
      return {
          avgGlobal,
          radarData: [
              { phase: 'Org. Ofensiva', A: calcPhaseScore('OFENSIVA') },
              { phase: 'Org. Defensiva', A: calcPhaseScore('DEFENSIVA') },
              { phase: 'Trans. Ofensiva', A: calcPhaseScore('TRANSICAO_OF') },
              { phase: 'Trans. Defensiva', A: calcPhaseScore('TRANSICAO_DEF') },
          ]
      };
  }, [allEvents]);

  // --- CAMADA 2: CONTEXTO (REATIVO) ---
  const dominantChartData = useMemo(() => {
      if (filterPhase === 'all') {
          return globalStats?.radarData.map(d => ({ name: d.phase, score: d.A }));
      } else {
          const actions = filteredEvents.reduce((acc: any, curr) => {
              if (!acc[curr.action]) acc[curr.action] = { name: curr.action, score: 0, count: 0 };
              acc[curr.action].score += curr.eventScore;
              acc[curr.action].count += 1;
              return acc;
          }, {});
          return Object.values(actions).map((a: any) => ({ name: a.name, score: a.score / a.count }));
      }
  }, [filterPhase, filteredEvents, globalStats]);

  const impactRanking = useMemo(() => {
      const grouped = filteredEvents.reduce((acc: any, curr) => {
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
  }, [filteredEvents]);

  // --- CAMADA 3: ESPAÇO E TEMPO ---
  const timelineData = useMemo(() => {
      return entries.map(entry => {
          const session = sessions.find(s => s.id === entry.sessionId);
          if (!session) return null;
          return {
              date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              score: calculateTotalScore(entry.technical, entry.physical, entry.tactical),
              sessionId: session.id
          };
      }).filter(Boolean).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [entries, sessions]);

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* CAMADA 1 – PERFIL DO ATLETA (Topo Fixo) */}
      {/* Bloco de dados do atleta mantido conforme solicitado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
              {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-md" alt="" />
              ) : (
                 <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-blue-100 flex items-center justify-center text-4xl font-bold text-blue-600">{athlete.name.charAt(0)}</div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{athlete.name}</h1>
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                   <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold">{athlete.position}</span>
                   <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded font-bold">{getCalculatedCategory(athlete.birthDate)}</span>
                   {athlete.rg && <span className="text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-1 rounded font-mono">RG: {athlete.rg}</span>}
                </div>
                <div className="mt-4 flex gap-2">
                    {canEditData(currentUser?.role || UserRole.TECNICO) && (
                        <>
                            <button onClick={() => navigate(`/athletes/${id}/realtime`)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md"><Timer size={14} /> Análise RealTime</button>
                            <button onClick={() => setShowEditModal(true)} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg text-xs font-bold transition-all">Editar Perfil</button>
                        </>
                    )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                 <div className="flex items-center gap-2 mb-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contexto Temporal:</label>
                    <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="bg-gray-100 border-none rounded-lg px-3 py-1 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="all">Todo o Histórico</option>
                        <option value="today">Hoje</option>
                        <option value="week">Últimos 7 dias</option>
                        <option value="month">Últimos 30 dias</option>
                    </select>
                 </div>
                 <div className="text-center px-8 py-3 bg-gray-50 rounded-2xl border border-gray-100 min-w-[160px] shadow-inner">
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Média Tática Global</span>
                    <span className={`block text-5xl font-black ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(1)}</span>
                    <span className={`text-[10px] font-bold uppercase ${impact.text}`}>{impact.label}</span>
                 </div>
            </div>
        </div>
      </div>

      {/* Radar de Fases (Parte da Camada 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-8">
                <div className="w-full md:w-1/2 h-[250px]">
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
                    <div className="bg-blue-900 text-white p-6 rounded-2xl shadow-xl flex flex-col justify-between h-full">
                        <h3 className="text-xs font-black text-blue-300 uppercase tracking-widest mb-4 flex items-center gap-2"><Filter size={14}/> Motor de Filtros Táticos</h3>
                        <div className="space-y-3">
                            <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)} className="w-full bg-blue-800 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-400">
                                <option value="all">Todas as Fases</option>
                                <option value="OFENSIVA">Org. Ofensiva</option>
                                <option value="DEFENSIVA">Org. Defensiva</option>
                                <option value="TRANSICAO_OF">Trans. Ofensiva</option>
                                <option value="TRANSICAO_DEF">Trans. Defensiva</option>
                            </select>
                            <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)} className="w-full bg-blue-800 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-400">
                                <option value="all">Todos os Resultados</option>
                                <option value="POSITIVA">Ações Positivas</option>
                                <option value="NEUTRA">Ações Neutras</option>
                                <option value="NEGATIVA">Ações Negativas</option>
                            </select>
                            <button onClick={() => {setFilterPhase('all'); setFilterResult('all'); setSelectedTimePoint(null);}} className="w-full py-2 text-[10px] font-black uppercase text-blue-300 hover:text-white transition-colors underline underline-offset-4">Limpar Filtros</button>
                        </div>
                    </div>
                </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={12}/> Top Impacto</h3>
                </div>
                <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[300px]">
                    <div>
                        <span className="text-[9px] font-bold text-green-600 uppercase mb-2 block tracking-tight">Destaques</span>
                        <div className="space-y-1">
                            {impactRanking.best.map((a, i) => (
                                <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-green-50 border border-green-100">
                                    <span className="text-[10px] font-black text-green-800 truncate pr-2">{a.name}</span>
                                    <span className="text-[10px] font-mono font-black text-green-600">+{a.avg.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border-t border-dashed border-gray-100 pt-4">
                        <span className="text-[9px] font-bold text-red-500 uppercase mb-2 block tracking-tight">Risco Tático</span>
                        <div className="space-y-1">
                            {impactRanking.worst.map((a, i) => (
                                <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-red-50 border border-red-100">
                                    <span className="text-[10px] font-black text-red-800 truncate pr-2">{a.name}</span>
                                    <span className="text-[10px] font-mono font-black text-red-600">{a.avg.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
          </div>
      </div>

      {/* CAMADA 2 – CONTEXTO DE DESEMPENHO (Meio da Tela) */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm min-h-[350px]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                   {filterPhase === 'all' ? <Activity size={18} className="text-blue-500"/> : <Zap size={18} className="text-yellow-500"/>}
                   {filterPhase === 'all' ? 'Desempenho Contextualizado por Fase' : `Impacto Detalhado: ${filterPhase.replace('_', ' ')}`}
                </h3>
            </div>

            {filteredEvents.length >= 1 ? (
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dominantChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 700}} />
                            <YAxis domain={[-1.5, 1.5]} axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} />
                            <RechartsTooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="score" radius={[6, 6, 0, 0]} barSize={40}>
                                {dominantChartData?.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={entry.score >= 0.3 ? '#10b981' : entry.score <= -0.3 ? '#ef4444' : '#9ca3af'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-[250px] flex flex-col items-center justify-center text-gray-400 gap-2">
                    <AlertCircle size={32} className="opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-50">Volume Insuficiente para Análise Tática</p>
                </div>
            )}
      </div>

      {/* CAMADA 3 – ESPAÇO E TEMPO (Base da Tela) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MousePointer2 size={14}/> Distribuição Espacial Filtrada</h3>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                      {(['all', 'positiva', 'negativa'] as const).map(mode => (
                          <button key={mode} onClick={() => setMapMode(mode)} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${mapMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                              {mode === 'all' ? 'Todas' : mode === 'positiva' ? 'Sucesso' : 'Erro'}
                          </button>
                      ))}
                  </div>
              </div>
              <div className="flex-1 flex items-center justify-center">
                  <HeatmapField 
                      perspective={true} 
                      readOnly={true} 
                      points={filteredEvents.filter(e => {
                          if (mapMode === 'all') return true;
                          return mapMode === 'positiva' ? e.result === 'POSITIVA' : e.result === 'NEGATIVA';
                      }).map(e => e.location)} 
                  />
              </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Activity size={14}/> Timeline de Evolução (Filtro Master)</h3>
              <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData} onClick={(data) => data && data.activePayload && setSelectedTimePoint(data.activePayload[0].payload.sessionId)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} />
                          <YAxis domain={[0, 10]} hide />
                          <RechartsTooltip cursor={{stroke: '#2563eb', strokeWidth: 2}} content={({ active, payload }) => {
                              if (active && payload && payload.length) return (
                                  <div className="bg-gray-900 text-white p-2 rounded-lg text-[10px] font-bold shadow-xl border border-gray-700">
                                      <p>{payload[0].payload.date}: Score Geral {payload[0].value?.toFixed(1)}</p>
                                      <p className="text-blue-400 mt-1">Clique para isolar este jogo</p>
                                  </div>
                              );
                              return null;
                          }} />
                          <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
              {selectedTimePoint && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center animate-fade-in">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Filtro Ativo: Jogo selecionado na timeline</span>
                      <button onClick={() => setSelectedTimePoint(null)} className="text-[10px] font-black text-blue-500 uppercase hover:text-blue-800">Limpar</button>
                  </div>
              )}
          </div>
      </div>

      {/* --- MODAIS DE EDIÇÃO --- */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
           <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-8">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-gray-800">Editar Perfil do Atleta</h3>
                 <button onClick={() => setShowEditModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editFormData.name || !athlete) return;
                  await saveAthlete({ ...athlete, ...editFormData } as Athlete);
                  setShowEditModal(false);
                  setRefreshKey(prev => prev + 1);
              }} className="space-y-4">
                 <div className="flex flex-col items-center mb-6">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                        {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={32} className="text-gray-400" />}
                    </div>
                    <label className={`cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? 'Enviando...' : <><Upload size={14} /> Alterar Foto</>}
                        <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={async (ev) => {
                            const file = ev.target.files?.[0];
                            if (file) {
                                setUploading(true);
                                try {
                                    ev.target.value = ''; 
                                    const url = await processImageUpload(file);
                                    setEditFormData(prev => ({ ...prev, photoUrl: url }));
                                } catch (err) { alert("Erro no upload"); } finally { setUploading(false); }
                            }
                        }} />
                    </label>
                 </div>
                 <div>
                     <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome Completo</label>
                     <input className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Posição</label>
                         <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                             {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                         </select>
                     </div>
                     <div>
                         <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Categoria</label>
                         <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                             {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                     </div>
                 </div>
                 <button type="submit" className="w-full bg-blue-600 text-white font-black py-3 rounded-xl mt-2 hover:bg-blue-700 transition-all shadow-lg uppercase tracking-widest text-xs" disabled={uploading}>Salvar Alterações</button>
              </form>
           </div>
        </div>
      )}

    </div>
  );
};

export default AthleteProfile;