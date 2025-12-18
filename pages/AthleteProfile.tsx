
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, getTrainingEntries, getTrainingSessions, saveAthlete, getCategories, getEvaluationSessions, deleteAthlete, getTeams
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { calculateTotalScore, TrainingEntry, Athlete, Category, TrainingSession, getCalculatedCategory, User, canEditData, UserRole, EvaluationSession, formatDateSafe, Team, Position, HeatmapPoint } from '../types';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from 'recharts';
import { 
  Edit, User as UserIcon, Save, X, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  TrendingUp, Activity, Target, Zap, Filter, MousePointer2, AlertCircle, Timer, ClipboardCheck, Eye,
  Plus, Trash2, ArrowRightLeft, Mail, Phone, UserCircle, CheckCircle, Upload, HelpCircle, Users
} from 'lucide-react';
import HeatmapField from '../components/HeatmapField';
import { supabase } from '../services/supabaseClient';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  const [activeTab, setActiveTab] = useState<'realtime' | 'snapshots'>('realtime');
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  const [modalType, setModalType] = useState<'none' | 'edit' | 'confirm_delete' | 'confirm_delete_eval' | 'success' | 'error'>('none');
  const [modalMessage, setModalMessage] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});
  const [uploading, setUploading] = useState(false);
  const [showTransferField, setShowTransferField] = useState(false);

  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');

  useEffect(() => {
     const storedUser = localStorage.getItem('performax_current_user');
     if (storedUser) setCurrentUser(JSON.parse(storedUser));

     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allCats, allEvals, teamsData] = await Promise.all([
             getAthletes(), getTrainingEntries(), getTrainingSessions(), getCategories(), getEvaluationSessions(id), getTeams()
         ]);
         
         const foundAthlete = allAthletes.find(a => a.id === id);
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setEditFormData({...foundAthlete});
             setCategories(allCats.filter(c => c.teamId === foundAthlete.teamId));
             setEntries(allEntries.filter(e => e.athleteId === id));
             setSessions(allSessions);
             setEvalSessions(allEvals);
             setAllTeams(teamsData);
         }
         setLoading(false);
     };
     load();
  }, [id, refreshKey]);

  const avgStructuredTech = useMemo(() => {
    if (evalSessions.length === 0) return 0;
    return evalSessions.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / evalSessions.length;
  }, [evalSessions]);

  const radarAveragesData = useMemo(() => {
    if (entries.length === 0) return null;
    const techKeys: Record<string, string> = { controle_bola: 'Controle', conducao: 'Condução', passe: 'Passe', recepcao: 'Recepção', drible: 'Drible', finalizacao: 'Finaliz.', cruzamento: 'Cruzam.', desarme: 'Desarme', interceptacao: 'Intercep.' };
    const techGroup = Object.keys(techKeys).map(key => {
        const sum = entries.reduce((acc, curr) => acc + (Number((curr.technical as any)[key]) || 0), 0);
        return { subject: techKeys[key], A: sum / entries.length };
    });
    const physKeys: Record<string, string> = { velocidade: 'Velocidade', agilidade: 'Agilidade', resistencia: 'Resist.', forca: 'Força', coordenacao: 'Coord.', mobilidade: 'Mobil.', estabilidade: 'Estab.' };
    const physGroup = Object.keys(physKeys).map(key => {
        const sum = entries.reduce((acc, curr) => acc + (Number((curr.physical as any)[key]) || 0), 0);
        return { subject: physKeys[key], A: sum / entries.length };
    });
    return { tech: techGroup, phys: physGroup };
  }, [entries]);

  const tacticalEvents = useMemo(() => {
      let events: any[] = [];
      const relevantEntries = !filterDate ? entries : entries.filter(e => {
          const s = sessions.find(sess => sess.id === e.sessionId);
          return s?.date === filterDate;
      });
      relevantEntries.forEach(entry => {
          try {
              const notes = JSON.parse(entry.notes || '{}');
              if (notes.events) events = [...events, ...notes.events];
          } catch (e) {}
      });
      return events;
  }, [entries, sessions, filterDate]);

  const filteredTacticalEvents = useMemo(() => {
      let ds = tacticalEvents;
      if (filterPhase !== 'all') ds = ds.filter(e => e.phase === filterPhase);
      if (filterResult !== 'all') ds = ds.filter(e => e.result === filterResult);
      return ds;
  }, [tacticalEvents, filterPhase, filterResult]);

  const aggregateHeatmapPoints = useMemo(() => filteredTacticalEvents.map(e => e.location), [filteredTacticalEvents]);

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
                ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-darkInput text-gray-500 dark:text-gray-400 border-gray-100 dark:border-darkBorder hover:border-indigo-200'}
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
        <div className="bg-white dark:bg-darkCard p-4 rounded-xl border border-gray-100 dark:border-darkBorder shadow-sm w-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest flex items-center gap-2"><CalendarIcon size={12}/> Atividades</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCalendarMonth(new Date(year, month - 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-darkInput rounded text-gray-400"><ChevronLeft size={16}/></button>
                    <span className="text-[10px] font-black uppercase text-gray-800 dark:text-gray-100">{calendarMonth.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                    <button onClick={() => setCalendarMonth(new Date(year, month + 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-darkInput rounded text-gray-400"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 dark:text-gray-600">{d}</div>)}
                {days}
            </div>
        </div>
    );
  };

  if (loading && modalType === 'none') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in transition-colors duration-300">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-darkCard rounded-2xl shadow-sm border border-gray-100 dark:border-darkBorder p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                {athlete.photoUrl ? (
                    <img src={athlete.photoUrl} className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-darkBorder shadow-lg" alt="" />
                ) : (
                    <div className="w-32 h-32 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-5xl font-black text-indigo-600 dark:text-indigo-400">{athlete.name.charAt(0)}</div>
                )}
                {canEditData(currentUser?.role || UserRole.TECNICO) && (
                    <button onClick={() => { setEditFormData({...athlete}); setShowTransferField(false); setModalType('edit'); }} className="absolute bottom-1 right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all"><Edit size={16}/></button>
                )}
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tighter truncate">{athlete.name}</h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                   <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 text-[10px] px-2 py-1 rounded font-black uppercase">{athlete.position}</span>
                   <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-[10px] px-2 py-1 rounded font-black uppercase">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                   <span className="bg-gray-100 dark:bg-darkInput text-gray-600 dark:text-gray-400 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-tighter">RG: {athlete.rg}</span>
                </div>
                <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                    <button onClick={() => navigate(`/athletes/${id}/realtime`)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><Timer size={16} /> Analisar Jogo</button>
                    <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><ClipboardCheck size={16} /> Nova Avaliação</button>
                </div>
              </div>
          </div>
          <div className="lg:col-span-1">{renderCalendar()}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-darkCard p-6 rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1"><Timer size={12} className="text-indigo-500"/> Impacto em Jogo</span>
                  <p className={`text-3xl font-black ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(2)}</p>
                  <span className={`text-[8px] font-black uppercase ${impact.text}`}>{impact.label}</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 dark:bg-darkInput overflow-hidden">
                  <div className={`w-full transition-all duration-1000 ${impact.color}`} style={{ height: `${Math.min(100, Math.max(0, ((globalStats?.avgGlobal || 0) + 1.5) / 3 * 100))}%` }}></div>
              </div>
          </div>
          <div className="bg-white dark:bg-darkCard p-6 rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1"><ClipboardCheck size={12} className="text-emerald-500"/> Média Técnica</span>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{avgStructuredTech.toFixed(1)}</p>
                  <span className={`text-[8px] font-black uppercase text-emerald-400`}>Escala controlada 1-5</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 dark:bg-darkInput overflow-hidden">
                  <div className="w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(avgStructuredTech / 5) * 100}%` }}></div>
              </div>
          </div>
      </div>

      <div className="flex bg-white dark:bg-darkCard p-1.5 rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm max-w-md mx-auto">
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
      </div>

      {activeTab === 'realtime' && (
          <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Desempenho Tático</h3>
                      {globalStats ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={globalStats.radarData}>
                                  <PolarGrid stroke="#334155" />
                                  <PolarAngleAxis dataKey="phase" tick={{ fill: '#64748b', fontSize: 8, fontWeight: 800 }} />
                                  <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                  <Radar name="Score" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                              </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-[10px] font-bold uppercase italic">Sem dados táticos</div>}
                  </div>

                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Fundamentos Técnicos</h3>
                      {radarAveragesData?.tech ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.tech}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 8, fontWeight: 700 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-[10px] font-bold uppercase italic">Sem dados técnicos</div>}
                  </div>

                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={16}/> Condição Física</h3>
                      {radarAveragesData?.phys ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.phys}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 8, fontWeight: 700 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#10b981" fill="#34d399" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-[10px] font-bold uppercase italic">Sem dados físicos</div>}
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col items-center">
                    <div className="w-full max-w-sm">
                         <HeatmapField perspective points={aggregateHeatmapPoints} readOnly label="Mapa de Calor (Posicionamento)" />
                    </div>
                </div>
                <div className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col">
                    <div className="p-4 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-darkInput flex justify-between items-center"><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Resumo de Impacto</h3><TrendingUp size={14} className="text-indigo-400"/></div>
                    <div className="flex-1 p-4 space-y-4">
                        {impactRanking.best.length > 0 ? (
                            <>
                                <div>
                                    <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase mb-2 block tracking-wider">Pontos Fortes</span>
                                    {impactRanking.best.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 mb-1.5">
                                            <span className="text-[9px] font-black text-indigo-800 dark:text-indigo-300 truncate pr-2 uppercase">{a.name}</span>
                                            <span className="text-[9px] font-mono font-black text-indigo-600 dark:text-indigo-400">+{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-dashed border-gray-100 dark:border-darkBorder pt-4">
                                    <span className="text-[9px] font-black text-red-500 dark:text-red-400 uppercase mb-2 block tracking-wider">Atenção</span>
                                    {impactRanking.worst.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 mb-1.5">
                                            <span className="text-[9px] font-black text-red-800 dark:text-red-300 truncate pr-2 uppercase">{a.name}</span>
                                            <span className="text-[9px] font-mono font-black text-red-600 dark:text-red-400">{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div className="h-full flex items-center justify-center text-[9px] text-gray-300 dark:text-gray-700 font-bold uppercase text-center italic">Sem dados...</div>}
                    </div>
                </div>
              </div>
          </div>
      )}

      {activeTab === 'snapshots' && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-darkBorder flex justify-between items-center bg-gray-50/50 dark:bg-darkInput">
                      <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><ClipboardCheck size={18} className="text-emerald-500"/> Histórico de Avaliações</h3>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                      {evalSessions.length > 0 ? evalSessions.map(ev => (
                          <div key={ev.id} className="p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-indigo-900/10 transition-all border-l-4 border-transparent hover:border-emerald-600">
                              <div className="flex items-center gap-5">
                                  <div className="bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-sm"><Target size={24}/></div>
                                  <div>
                                      <p className="text-base font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">{ev.type}</p>
                                      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">
                                          <div className="flex items-center gap-1"><CalendarIcon size={12}/> {formatDateSafe(ev.date)}</div>
                                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><TrendingUp size={12}/> TÉC: {ev.scoreTecnico.toFixed(1)}</div>
                                          <div className="flex items-center gap-1 text-blue-500 dark:text-blue-400"><Activity size={12}/> FÍS: {ev.scoreFisico.toFixed(0)}%</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2">
                                  <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="p-2.5 bg-gray-50 dark:bg-darkInput text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all shadow-sm">
                                      <Edit size={16}/>
                                  </button>
                                  <button onClick={() => { setSelectedEvalId(ev.id); setModalType('confirm_delete_eval'); setModalMessage('Deseja excluir permanentemente esta avaliação?'); }} className="p-2.5 bg-gray-50 dark:bg-darkInput text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm">
                                      <Trash2 size={16}/>
                                  </button>
                                  <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-all shadow-sm"><Eye size={16}/> Relatório</button>
                              </div>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 dark:text-gray-700 text-xs font-bold uppercase tracking-widest italic">Nenhuma avaliação encontrada</div>}
                  </div>
              </div>
          </div>
      )}

      {/* MODAIS COM PADRÃO DARK */}
      {modalType === 'edit' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-4xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 dark:border-darkBorder pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 dark:text-gray-100">
                    <div className="p-2.5 rounded-2xl text-white shadow-lg bg-indigo-600">
                        <Edit size={24}/>
                    </div>
                    Editar Cadastro do Atleta
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
              </div>
              
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editFormData.name || !athlete) return;
                  setLoading(true);
                  try {
                      await saveAthlete({ ...athlete, ...editFormData } as Athlete);
                      setModalType('success');
                      setModalMessage('Perfil atualizado com sucesso!');
                      setRefreshKey(prev => prev + 1);
                  } catch (err) { setModalType('error'); setModalMessage('Erro ao salvar.'); } finally { setLoading(false); }
              }} className="space-y-12">
                 
                 <div className="flex flex-col items-center">
                    <div className="w-32 h-32 bg-gray-50 dark:bg-darkInput rounded-full flex items-center justify-center mb-4 overflow-hidden border-4 border-dashed border-gray-200 dark:border-darkBorder shadow-inner relative">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <Users size={48} className="text-gray-200 dark:text-gray-700" />)}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-5 py-2.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Processando...' : <><Upload size={14} /> Alterar Foto</>}
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

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-gray-800 dark:text-gray-100">
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-indigo-50 dark:border-darkBorder">
                            <HelpCircle size={14} className="text-indigo-400"/>
                            <h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Identificação</h4>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label>
                           <input required type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label>
                                <input type="date" required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG / Identificador</label>
                                <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.rg} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label>
                                <select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                                    {Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label>
                                <select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-emerald-50 dark:border-darkBorder">
                            <Target size={14} className="text-emerald-400"/>
                            <h4 className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Responsáveis</h4>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Responsável</label>
                           <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.responsibleName} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail para Contato</label>
                           <input type="email" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsibleEmail} onChange={e => setEditFormData({...editFormData, responsibleEmail: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone WhatsApp</label>
                           <input type="tel" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsiblePhone} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} />
                        </div>
                    </div>
                 </div>

                 <div className="flex gap-4 pt-6">
                    <button type="button" onClick={() => setModalType('confirm_delete')} className="flex-1 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all flex items-center justify-center gap-2 border-b-4 border-red-200 dark:border-red-900/30"><Trash2 size={16}/> Excluir Perfil</button>
                    <button type="submit" disabled={uploading || loading} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 border-b-4 border-indigo-900">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                        {loading ? 'Gravando...' : 'Salvar Alterações'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {(modalType === 'success' || modalType === 'error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full text-center border border-indigo-50">
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner ${modalType === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {modalType === 'success' ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">{modalType === 'success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mb-8">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className={`text-white font-black py-4 px-12 rounded-2xl transition-all w-full shadow-lg uppercase tracking-widest text-[11px] active:scale-95 ${modalType === 'success' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}>Entendido</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AthleteProfile;
