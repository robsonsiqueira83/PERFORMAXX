
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, getTrainingEntries, getTrainingSessions, saveAthlete, getCategories, getEvaluationSessions 
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { calculateTotalScore, TrainingEntry, Athlete, TrainingSession, getCalculatedCategory, User, canEditData, UserRole, EvaluationSession, formatDateSafe } from '../types';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip
} from 'recharts';
import { 
  Edit, ArrowLeft, User as UserIcon, Save, X, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  TrendingUp, Activity, Target, Zap, Filter, MousePointer2, AlertCircle, Timer, ClipboardCheck, Eye, Info,
  Plus, ChevronDown, ChevronUp, MapPin
} from 'lucide-react';
import HeatmapField from '../components/HeatmapField';

const IMPACT_LEVELS = [
    { min: 0.61, label: 'Impacto Muito Alto', color: 'bg-indigo-600', text: 'text-indigo-600', border: 'border-indigo-600' },
    { min: 0.30, label: 'Impacto Positivo', color: 'bg-indigo-400', text: 'text-indigo-400', border: 'border-indigo-400' },
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
  const [evalSessions, setEvalSessions] = useState<EvaluationSession[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'realtime' | 'snapshots'>('realtime');
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});
  const [uploading, setUploading] = useState(false);

  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [mapMode, setMapMode] = useState<'all' | 'positiva' | 'negativa'>('all');

  useEffect(() => {
     const storedUser = localStorage.getItem('performax_current_user');
     if (storedUser) setCurrentUser(JSON.parse(storedUser));

     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allCats, allEvals] = await Promise.all([
             getAthletes(), getTrainingEntries(), getTrainingSessions(), getCategories(), getEvaluationSessions(id)
         ]);
         
         const foundAthlete = allAthletes.find(a => a.id === id);
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setEditFormData({...foundAthlete});
             setCategories(allCats.filter(c => c.teamId === foundAthlete.teamId));
             setEntries(allEntries.filter(e => e.athleteId === id));
             setSessions(allSessions);
             setEvalSessions(allEvals);
         }
         setLoading(false);
     };
     load();
  }, [id, refreshKey]);

  const avgStructuredTech = useMemo(() => {
    if (evalSessions.length === 0) return 0;
    return evalSessions.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / evalSessions.length;
  }, [evalSessions]);

  const filteredEntries = useMemo(() => {
      if (!filterDate) return entries;
      const sessionIdsInDate = sessions.filter(s => s.date === filterDate).map(s => s.id);
      return entries.filter(e => sessionIdsInDate.includes(e.sessionId));
  }, [entries, sessions, filterDate]);

  const tacticalEvents = useMemo(() => {
      let events: any[] = [];
      filteredEntries.forEach(entry => {
          try {
              const notes = JSON.parse(entry.notes || '{}');
              if (notes.events) events = [...events, ...notes.events];
          } catch (e) {}
      });
      return events;
  }, [filteredEntries]);

  const filteredTacticalEvents = useMemo(() => {
      let ds = tacticalEvents;
      if (filterPhase !== 'all') ds = ds.filter(e => e.phase === filterPhase);
      if (filterResult !== 'all') ds = ds.filter(e => e.result === filterResult);
      return ds;
  }, [tacticalEvents, filterPhase, filterResult]);

  const globalStats = useMemo(() => {
      if (tacticalEvents.length === 0) return null;
      const calcPhaseScore = (phase: string) => {
          const phaseEvents = tacticalEvents.filter(e => e.phase === phase);
          return phaseEvents.length === 0 ? 0 : phaseEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / phaseEvents.length;
      };
      return {
          avgGlobal: tacticalEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / tacticalEvents.length,
          radarData: [
              { phase: 'Org. Ofensiva', A: calcPhaseScore('OFENSIVA') },
              { phase: 'Org. Defensiva', A: calcPhaseScore('DEFENSIVA') },
              { phase: 'Trans. Ofensiva', A: calcPhaseScore('TRANSICAO_OF') },
              { phase: 'Trans. Defensiva', A: calcPhaseScore('TRANSICAO_DEF') },
          ]
      };
  }, [tacticalEvents]);

  const impactRanking = useMemo(() => {
      const grouped = filteredTacticalEvents.reduce((acc: any, curr) => {
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
  }, [filteredTacticalEvents]);

  const activityDates = useMemo(() => {
      const map = new Map<string, 'realtime' | 'snapshot' | 'both'>();
      sessions.filter(s => entries.some(e => e.sessionId === s.id)).forEach(s => map.set(s.date, 'realtime'));
      evalSessions.forEach(s => {
          const current = map.get(s.date);
          map.set(s.date, current === 'realtime' ? 'both' : 'snapshot');
      });
      return map;
  }, [sessions, entries, evalSessions]);

  const renderCalendar = () => {
    const month = calendarMonth.getMonth();
    const year = calendarMonth.getFullYear();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`e-${i}`} />);
    for (let d = 1; d <= lastDate; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const type = activityDates.get(dateStr);
        const isSelected = filterDate === dateStr;
        days.push(
            <button key={d} onClick={() => setFilterDate(isSelected ? null : dateStr)} 
              className={`h-9 w-9 flex flex-col items-center justify-center text-[10px] rounded-lg border transition-all
                ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-gray-500 border-gray-100 hover:border-indigo-200'}
              `}>
                <span className="font-bold">{d}</span>
                {type && !isSelected && (
                    <div className="flex gap-0.5 mt-0.5">
                        {(type === 'realtime' || type === 'both') && <div className="w-1 h-1 rounded-full bg-indigo-500"></div>}
                        {(type === 'snapshot' || type === 'both') && <div className="w-1 h-1 rounded-full bg-emerald-500"></div>}
                    </div>
                )}
            </button>
        );
    }
    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm w-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-2"><CalendarIcon size={12}/> Atividades</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCalendarMonth(new Date(year, month - 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400"><ChevronLeft size={16}/></button>
                    <span className="text-[10px] font-black uppercase text-gray-800">{calendarMonth.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                    <button onClick={() => setCalendarMonth(new Date(year, month + 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300">{d}</div>)}
                {days}
            </div>
        </div>
    );
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in">
      
      {/* BLOCO SUPERIOR: PERFIL + CALENDÁRIO FIXO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Info Atleta */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                {athlete.photoUrl ? (
                    <img src={athlete.photoUrl} className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg" alt="" />
                ) : (
                    <div className="w-32 h-32 rounded-full bg-indigo-100 flex items-center justify-center text-5xl font-black text-indigo-600">{athlete.name.charAt(0)}</div>
                )}
                {canEditData(currentUser?.role || UserRole.TECNICO) && (
                    <button onClick={() => setShowEditModal(true)} className="absolute bottom-1 right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all"><Edit size={16}/></button>
                )}
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <h1 className="text-3xl font-black text-gray-900 tracking-tighter truncate">{athlete.name}</h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                   <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-1 rounded font-black uppercase">{athlete.position}</span>
                   <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-1 rounded font-black uppercase">{getCalculatedCategory(athlete.birthDate)}</span>
                   <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-tighter">Nasc: {formatDateSafe(athlete.birthDate)}</span>
                </div>
                <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                    <button onClick={() => navigate(`/athletes/${id}/realtime`)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><Timer size={16} /> Analisar Jogo (RealTime)</button>
                    <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><ClipboardCheck size={16} /> Nova Avaliação</button>
                </div>
              </div>
          </div>
          
          {/* Calendário Fixo */}
          <div className="lg:col-span-1">
             {renderCalendar()}
          </div>
      </div>

      {/* BLOCO SCORES MÉDIOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Timer size={12} className="text-indigo-500"/> Impacto em Jogo</span>
                  <p className={`text-3xl font-black ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(1)}</p>
                  <span className={`text-[8px] font-black uppercase ${impact.text}`}>{impact.label}</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`w-full transition-all duration-1000 ${impact.color}`} style={{ height: `${Math.min(100, Math.max(0, ((globalStats?.avgGlobal || 0) + 1.5) / 3 * 100))}%` }}></div>
              </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><ClipboardCheck size={12} className="text-emerald-500"/> Média Técnica (Snapshots)</span>
                  <p className="text-3xl font-black text-emerald-600">{avgStructuredTech.toFixed(1)}</p>
                  <span className="text-[8px] font-black uppercase text-emerald-400">Escala controlada 1-5</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(avgStructuredTech / 5) * 100}%` }}></div>
              </div>
          </div>
      </div>

      {/* ABAS DE CONTEÚDO */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm max-w-md mx-auto">
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
      </div>

      {/* CONTEÚDO REALTIME (Indigo/Roxo) */}
      {activeTab === 'realtime' && (
          <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
                        <div className="w-full md:w-1/2 h-[260px]">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={14} className="text-indigo-500"/> Desempenho por Fase</h3>
                            {globalStats ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={globalStats.radarData}>
                                        <PolarGrid stroke="#e5e7eb" />
                                        <PolarAngleAxis dataKey="phase" tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 800 }} />
                                        <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                        <Radar name="Score" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] uppercase font-bold bg-gray-50 rounded-xl italic">Sem registros táticos no período</div>}
                        </div>
                        <div className="w-full md:w-1/2">
                            <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
                                <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest flex items-center gap-2"><Filter size={14}/> Filtros de Scout</h3>
                                <div className="space-y-2.5">
                                    <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)} className="w-full bg-indigo-800 border-none rounded-xl p-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-400">
                                        <option value="all">Todas as Fases</option>
                                        <option value="OFENSIVA">Org. Ofensiva</option>
                                        <option value="DEFENSIVA">Org. Defensiva</option>
                                        <option value="TRANSICAO_OF">Trans. Ofensiva</option>
                                        <option value="TRANSICAO_DEF">Trans. Defensiva</option>
                                    </select>
                                    <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)} className="w-full bg-indigo-800 border-none rounded-xl p-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-400">
                                        <option value="all">Todos os Resultados</option>
                                        <option value="POSITIVA">Sucesso</option>
                                        <option value="NEUTRA">Neutro</option>
                                        <option value="NEGATIVA">Erro</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Top Impacto</h3>
                        <TrendingUp size={14} className="text-indigo-400"/>
                    </div>
                    <div className="flex-1 p-4 space-y-4">
                        {impactRanking.best.length > 0 ? (
                            <>
                                <div>
                                    <span className="text-[9px] font-black text-indigo-600 uppercase mb-2 block tracking-wider">Pontos Fortes</span>
                                    {impactRanking.best.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-indigo-50 border border-indigo-100 mb-1.5">
                                            <span className="text-[9px] font-black text-indigo-800 truncate pr-2 uppercase">{a.name}</span>
                                            <span className="text-[9px] font-mono font-black text-indigo-600">+{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-dashed border-gray-100 pt-4">
                                    <span className="text-[9px] font-black text-red-500 uppercase mb-2 block tracking-wider">Erros Críticos</span>
                                    {impactRanking.worst.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-red-50 border border-red-100 mb-1.5">
                                            <span className="text-[9px] font-black text-red-800 truncate pr-2 uppercase">{a.name}</span>
                                            <span className="text-[9px] font-mono font-black text-red-600">{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div className="h-full flex items-center justify-center text-[9px] text-gray-300 font-bold uppercase text-center italic">Aguardando dados...</div>}
                    </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MousePointer2 size={14}/> Mapeamento de Campo</h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['all', 'positiva', 'negativa'] as const).map(mode => (
                                <button key={mode} onClick={() => setMapMode(mode)} className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-all ${mapMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>{mode === 'all' ? 'Tudo' : mode === 'positiva' ? 'Sucesso' : 'Erro'}</button>
                            ))}
                        </div>
                    </div>
                    <HeatmapField perspective={true} readOnly={true} points={filteredTacticalEvents.filter(e => {
                        if (mapMode === 'all') return true;
                        return mapMode === 'positiva' ? e.result === 'POSITIVA' : e.result === 'NEGATIVA';
                    }).map(e => e.location)} />
                </div>
                <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center items-center text-center">
                    <div className="bg-indigo-50 p-6 rounded-full mb-4 border border-indigo-100"><Zap size={40} className="text-indigo-500" /></div>
                    <h4 className="text-lg font-black uppercase text-gray-800 tracking-tighter">Motor de Análise Tática</h4>
                    <p className="text-[11px] text-gray-400 mt-2 max-w-xs font-medium uppercase leading-relaxed">As métricas de jogo são ponderadas pelo impacto da fase e dificuldade da ação executada pelo atleta em tempo real.</p>
                </div>
              </div>
          </div>
      )}

      {/* CONTEÚDO AVALIAÇÃO (Emerald/Verde) */}
      {activeTab === 'snapshots' && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><ClipboardCheck size={18} className="text-emerald-500"/> Histórico Estruturado</h3>
                      <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-md"><Plus size={14}/> Nova Avaliação</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                      {evalSessions.length > 0 ? evalSessions.map(ev => (
                          <div key={ev.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-all border-l-4 border-transparent hover:border-emerald-600">
                              <div className="flex items-center gap-5">
                                  <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600 shadow-sm"><Target size={24}/></div>
                                  <div>
                                      <p className="text-base font-black text-gray-800 uppercase tracking-tighter">{ev.type}</p>
                                      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-gray-400 font-black uppercase tracking-widest">
                                          <div className="flex items-center gap-1"><CalendarIcon size={12}/> {formatDateSafe(ev.date)}</div>
                                          <span className="text-gray-200">|</span>
                                          <div className="flex items-center gap-1 text-emerald-600"><TrendingUp size={12}/> TÉC: {ev.scoreTecnico.toFixed(1)}</div>
                                          <span className="text-gray-200">|</span>
                                          <div className="flex items-center gap-1 text-blue-500"><Activity size={12}/> FÍS: {ev.scoreFisico.toFixed(0)}%</div>
                                      </div>
                                  </div>
                              </div>
                              <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all active:scale-95 shadow-sm">
                                  <Eye size={16}/> Relatório
                              </button>
                          </div>
                      )) : (
                          <div className="p-24 text-center flex flex-col items-center gap-6">
                              <div className="bg-gray-50 p-8 rounded-full border-2 border-dashed border-gray-100"><AlertCircle size={48} className="text-gray-200" /></div>
                              <div className="max-w-xs">
                                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Nenhuma avaliação encontrada</p>
                                <p className="text-[10px] text-gray-300 mt-2 font-bold uppercase italic leading-relaxed">Este atleta ainda não passou por avaliações controladas de fundamentos e capacidades físicas.</p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL EDIÇÃO ATLETA */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><Edit className="text-indigo-600" size={24}/> Editar Perfil</h3>
                <button onClick={() => setShowEditModal(false)} className="bg-gray-100 p-2 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"><X size={20} /></button>
              </div>
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editFormData.name || !athlete) return;
                  await saveAthlete({ ...athlete, ...editFormData } as Athlete);
                  setShowEditModal(false);
                  setRefreshKey(prev => prev + 1);
              }} className="space-y-5">
                 <div className="flex flex-col items-center mb-8">
                    <div className="w-28 h-28 bg-gray-50 rounded-full flex items-center justify-center mb-3 overflow-hidden relative border-4 border-white shadow-xl">
                        {uploading ? <Loader2 className="animate-spin text-indigo-600" /> : editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={40} className="text-gray-200" />}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-800 ${uploading ? 'opacity-50' : ''}`}>
                       <Save size={14} /> {uploading ? 'Processando...' : 'Atualizar Foto'}
                       <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={async (ev) => {
                            const file = ev.target.files?.[0];
                            if (file) {
                                setUploading(true);
                                try {
                                    const url = await processImageUpload(file);
                                    setEditFormData(prev => ({ ...prev, photoUrl: url }));
                                } catch (err) { alert("Erro upload"); } finally { setUploading(false); }
                            }
                        }} />
                    </label>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nome Completo</label>
                   <input required className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Data de Nascimento</label>
                        <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.birthDate || ''} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">RG / Identificador</label>
                        <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.rg || ''} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} />
                    </div>
                 </div>
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl mt-4 hover:bg-indigo-700 transition-all uppercase tracking-widest text-[11px] shadow-xl shadow-indigo-100">Atualizar Atleta</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default AthleteProfile;
