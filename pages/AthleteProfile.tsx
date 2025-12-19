
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  getAthletes, getTrainingEntries, getTrainingSessions, saveAthlete, getCategories, getEvaluationSessions, deleteAthlete, getTeams,
  getTechnicalEvaluations, getPhysicalEvaluations, deleteTrainingEntry
} from '../services/storageService';
import { supabase } from '../services/supabaseClient';
import { processImageUpload } from '../services/imageService';
import { TrainingEntry, Athlete, Category, TrainingSession, getCalculatedCategory, User, canEditData, UserRole, EvaluationSession, formatDateSafe, Team, Position, TechnicalEvaluation, PhysicalEvaluation } from '../types';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LineChart, Line, Legend
} from 'recharts';
import { 
  Edit, User as UserIcon, Save, X, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  TrendingUp, Activity, Target, Zap, Filter, MousePointer2, AlertCircle, Timer, ClipboardCheck, Eye,
  Plus, Trash2, ArrowRightLeft, CheckCircle, Upload, HelpCircle, Users, Rocket, Shield, ShieldAlert,
  Info, LayoutDashboard
} from 'lucide-react';
import HeatmapField from '../components/HeatmapField';

const AthleteProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [evalSessions, setEvalSessions] = useState<EvaluationSession[]>([]);
  const [allTechEvals, setAllTechEvals] = useState<TechnicalEvaluation[]>([]);
  const [allPhysEvals, setAllPhysEvals] = useState<PhysicalEvaluation[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  const [activeTab, setActiveTab] = useState<'snapshots' | 'realtime'>('snapshots');
  
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterTimeBlock, setFilterTimeBlock] = useState<number | null>(null);
  const [mapToggle, setMapToggle] = useState<'all' | 'positiva' | 'negativa'>('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  const [modalType, setModalType] = useState<'none' | 'edit' | 'confirm_delete' | 'confirm_delete_eval' | 'confirm_delete_entry' | 'success' | 'error' | 'transfer_athlete'>('none');
  const [modalMessage, setModalMessage] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});
  const [uploading, setUploading] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

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

             const techPromises = allEvals.map(s => getTechnicalEvaluations(s.id));
             const physPromises = allEvals.map(s => getPhysicalEvaluations(s.id));
             const techResults = await Promise.all(techPromises);
             const physResults = await Promise.all(physPromises);
             setAllTechEvals(techResults.flat());
             setAllPhysEvals(physResults.flat());
         }
         setLoading(false);
     };
     load();
  }, [id, refreshKey]);

  const allEvents = useMemo(() => {
      let evts: any[] = [];
      entries.forEach(entry => {
          try {
              const notes = JSON.parse(entry.notes || '{}');
              if (notes.events) {
                  const session = sessions.find(s => s.id === entry.sessionId);
                  evts = [...evts, ...notes.events.map((e: any) => ({ ...e, sessionDate: session?.date, entryId: entry.id }))];
              }
          } catch (e) {}
      });
      return evts.sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());
  }, [entries, sessions]);

  const filteredEvents = useMemo(() => {
      let ds = allEvents;
      if (filterDate) ds = ds.filter(e => e.sessionDate === filterDate);
      if (filterPhase !== 'all') ds = ds.filter(e => e.phase === filterPhase);
      if (filterAction !== 'all') ds = ds.filter(e => e.action === filterAction);
      if (filterTimeBlock !== null) ds = ds.filter(e => e.seconds >= filterTimeBlock && e.seconds < filterTimeBlock + 300);
      return ds;
  }, [allEvents, filterDate, filterPhase, filterAction, filterTimeBlock]);

  const layer1Stats = useMemo(() => {
      if (allEvents.length === 0) return { avgGlobal: 0, radarData: [] };
      const baseEvents = filterDate ? allEvents.filter(e => e.sessionDate === filterDate) : allEvents;
      const calcPhase = (p: string) => {
          const fe = baseEvents.filter(e => e.phase === p);
          return fe.length === 0 ? 0 : fe.reduce((acc, curr) => acc + curr.eventScore, 0) / fe.length;
      };
      return {
          avgGlobal: baseEvents.reduce((acc, curr) => acc + curr.eventScore, 0) / baseEvents.length,
          radarData: [
              { phase: 'Org. Ofensiva', A: calcPhase('OFENSIVA') },
              { phase: 'Org. Defensiva', A: calcPhase('DEFENSIVA') },
              { phase: 'Trans. Ofensiva', A: calcPhase('TRANSICAO_OF') },
              { phase: 'Trans. Defensiva', A: calcPhase('TRANSICAO_DEF') },
          ]
      };
  }, [allEvents, filterDate]);

  const smcCalculated = useMemo(() => {
      const avgStructuredTech = evalSessions.length > 0 ? evalSessions.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / evalSessions.length : 0;
      const avgStructuredPhys = evalSessions.length > 0 ? evalSessions.reduce((acc, curr) => acc + curr.scoreFisico, 0) / evalSessions.length : 0;
      
      const mt_norm = (avgStructuredTech / 5.0) * 10;
      const cf_norm = avgStructuredPhys / 10;
      const p_tec = 0.55;
      const p_fis = 0.45;
      
      const isTechValid = evalSessions.length >= 2;
      const lastPhysEval = [...evalSessions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      let isPhysValid = false;
      if (lastPhysEval) {
          const diffDays = (new Date().getTime() - new Date(lastPhysEval.date).getTime()) / (1000 * 3600 * 24);
          isPhysValid = diffDays <= 30;
      }

      return {
          value: (mt_norm * p_tec) + (cf_norm * p_fis),
          isTechValid,
          isPhysValid,
          mt_norm,
          cf_norm,
          avgStructuredTech,
          avgStructuredPhys
      };
  }, [evalSessions]);

  const getSMCReading = (val: number) => {
      if (val <= 3.0) return "Capacidade insuficiente";
      if (val <= 5.0) return "Em desenvolvimento";
      if (val <= 6.5) return "Funcional para composição";
      if (val <= 8.0) return "Boa prontidão competitiva";
      return "Alta prontidão para jogos";
  };

  const radarAggregatedTech = useMemo(() => {
    const groups = ['Passe', 'Domínio e Controle', 'Condução', 'Finalização', '1x1 Ofensivo', '1x1 Defensivo'];
    return groups.map(g => {
        const items = allTechEvals.filter(t => t.fundamento === g);
        const score = items.length > 0 ? items.reduce((a, b) => a + b.nota, 0) / items.length : 0;
        return { subject: g, A: score, fullMark: 5 };
    });
  }, [allTechEvals]);

  const radarAggregatedPhys = useMemo(() => {
    const groups = ['Força', 'Potência', 'Velocidade', 'Resistência', 'Mobilidade / Estabilidade'];
    return groups.map(g => {
        const items = allPhysEvals.filter(p => p.capacidade.includes(g));
        const score = items.length > 0 ? items.reduce((a, b) => a + b.scoreNormalizado, 0) / items.length : 0;
        return { subject: g, A: score, fullMark: 100 };
    });
  }, [allPhysEvals]);

  const evolutionAggregatedData = useMemo(() => {
    return [...evalSessions].reverse().map(s => ({
        date: new Date(s.date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}),
        tech: s.scoreTecnico,
        phys: s.scoreFisico / 20 
    }));
  }, [evalSessions]);

  const realtimeHistory = useMemo(() => {
      const matchEntries = entries.filter(e => {
          try {
              const notes = JSON.parse(e.notes || '{}');
              return !!notes.events;
          } catch(e) { return false; }
      });
      return matchEntries.map(e => {
          const session = sessions.find(s => s.id === e.sessionId);
          const notes = JSON.parse(e.notes || '{}');
          return {
              id: e.id,
              date: session?.date || '--',
              eventsCount: notes.events?.length || 0,
              avgImpact: notes.avgScore || 0
          };
      }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, sessions]);

  const handleSubmitEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editFormData.name || !athlete) return;
      setLoading(true);
      try {
          await saveAthlete({ ...athlete, ...editFormData } as Athlete);
          setModalType('success'); setModalMessage('Perfil atualizado com sucesso!');
          setRefreshKey(prev => prev + 1);
      } catch (err) { setModalType('error'); setModalMessage('Erro ao salvar as alterações.'); }
      finally { setLoading(false); }
  };

  const handleDeleteEvaluation = async () => {
      if (!selectedEvalId) return;
      setLoading(true);
      try {
          await supabase.from('technical_evaluations').delete().eq('session_id', selectedEvalId);
          await supabase.from('physical_evaluations').delete().eq('session_id', selectedEvalId);
          await supabase.from('evaluations_sessions').delete().eq('id', selectedEvalId);
          setModalType('success'); setModalMessage('Avaliação excluída.');
          setRefreshKey(prev => prev + 1);
      } catch (err: any) { setModalType('error'); setModalMessage(err.message); } 
      finally { setLoading(false); setSelectedEvalId(null); }
  };

  const handleDeleteEntry = async () => {
    if (!selectedEntryId) return;
    setLoading(true);
    try {
        await deleteTrainingEntry(selectedEntryId);
        setModalType('success'); setModalMessage('Dados de Scout excluídos.');
        setRefreshKey(prev => prev + 1);
    } catch (err: any) { setModalType('error'); setModalMessage(err.message); }
    finally { setLoading(false); setSelectedEntryId(null); }
  };

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
              className={`h-9 w-9 flex flex-col items-center justify-center text-[10px] rounded-lg border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-darkInput text-gray-500 dark:text-gray-400 border-gray-100 dark:border-darkBorder hover:border-indigo-200'}`}>
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
                {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 dark:text-gray-600 uppercase">{d}</div>)}
                {days}
            </div>
        </div>
    );
  };

  if (loading && modalType === 'none') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in transition-colors duration-300">
      
      {/* HEADER COM SMC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-darkCard rounded-[32px] shadow-sm border border-gray-100 dark:border-darkBorder p-8 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex flex-col md:flex-row items-center gap-8 flex-1">
                  <div className="relative group shrink-0">
                    {athlete.photoUrl ? (
                        <img src={athlete.photoUrl} className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-darkBorder shadow-lg" alt="" />
                    ) : (
                        <div className="w-32 h-32 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-5xl font-black text-indigo-600 dark:text-indigo-400">{athlete.name.charAt(0)}</div>
                    )}
                    {canEditData(currentUser?.role || UserRole.TECNICO) && (
                        <button onClick={() => { setEditFormData({...athlete}); setModalType('edit'); }} className="absolute bottom-1 right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all"><Edit size={16}/></button>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center md:text-left">
                    <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tighter truncate uppercase">{athlete.name}</h1>
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                       <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest">{athlete.position}</span>
                       <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-[10px] px-2 py-1 rounded font-black uppercase tracking-widest">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                    </div>
                    <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                        <button onClick={() => navigate(`/athletes/${id}/realtime`)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><Timer size={16} /> Analisar Jogo</button>
                        <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><ClipboardCheck size={16} /> Iniciar Avaliação</button>
                    </div>
                  </div>
              </div>

              <div className="w-full md:w-64 bg-gray-50 dark:bg-darkInput/50 p-6 rounded-3xl border border-gray-100 dark:border-darkBorder flex flex-col items-center text-center shrink-0 shadow-inner">
                  <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Score SMC</span>
                      <div className="group relative cursor-help">
                          <Info size={12} className="text-gray-300 dark:text-gray-700" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-[8px] font-bold uppercase rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-gray-700">
                              SMC: (Média Téc Norm. * 0.55) + (Cond. Fís Norm. * 0.45). Baseado em treinos.
                          </div>
                      </div>
                  </div>
                  <span className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none">{smcCalculated.value.toFixed(1)}</span>
                  <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 mt-4 leading-tight uppercase tracking-widest">{getSMCReading(smcCalculated.value)}</p>
                  
                  {(!smcCalculated.isTechValid || !smcCalculated.isPhysValid) && (
                      <div className="mt-2 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded-full border border-amber-100 dark:border-amber-900/30">
                          <AlertCircle size={10} className="text-amber-600 dark:text-amber-400" />
                          <span className="text-[7px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                              {!smcCalculated.isTechValid ? 'Dados Téc. Insuficientes' : 'Aval. Fís. Desatualizada'}
                          </span>
                      </div>
                  )}

                  <div className="mt-4 pt-4 border-t dark:border-darkBorder w-full space-y-2">
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Impacto Tático</span>
                          <span className="text-[9px] font-mono font-black text-indigo-500">{(layer1Stats?.avgGlobal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Média Técnica</span>
                          <span className="text-[9px] font-mono font-black text-emerald-500">{smcCalculated.avgStructuredTech.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Condição Física</span>
                          <span className="text-[9px] font-mono font-black text-blue-500">{smcCalculated.avgStructuredPhys.toFixed(0)}%</span>
                      </div>
                  </div>
              </div>
          </div>
          <div className="lg:col-span-1">{renderCalendar()}</div>
      </div>

      {/* ABAS */}
      <div className="flex bg-white dark:bg-darkCard p-2 rounded-[24px] border border-gray-100 dark:border-darkBorder shadow-sm max-w-sm mx-auto">
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
      </div>

      {activeTab === 'realtime' && (
          <div className="space-y-8 animate-fade-in">
              {/* ANALÍTICA REALTIME */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col md:flex-row items-center gap-10">
                      <div className="w-full md:w-1/2 h-[280px]">
                        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={14}/> Dominância por Fase</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={layer1Stats?.radarData || []}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="phase" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                                <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                <Radar name="Atleta" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                            </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full md:w-1/2 space-y-8">
                          <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                              <p className="text-[9px] text-indigo-400 font-black uppercase mb-1 tracking-widest">Ações Analisadas</p>
                              <p className="text-2xl font-black text-indigo-900 dark:text-indigo-200">{filteredEvents.length} <span className="text-xs text-indigo-400 font-bold uppercase">cliques táticos</span></p>
                          </div>
                      </div>
                  </div>
                  <div className="bg-indigo-900 dark:bg-darkInput p-8 rounded-3xl shadow-xl border dark:border-darkBorder flex flex-col justify-center">
                      <h3 className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Filter size={14}/> Motor de Contexto</h3>
                      <div className="space-y-4">
                          <select value={filterPhase} onChange={e => {setFilterPhase(e.target.value); setFilterAction('all');}} className="w-full bg-indigo-800 dark:bg-darkCard border-none rounded-xl p-4 text-xs font-black uppercase text-white focus:ring-2 focus:ring-indigo-400 shadow-lg">
                              <option value="all">Todas as Fases</option>
                              <option value="OFENSIVA">Organização Ofensiva</option>
                              <option value="DEFENSIVA">Organização Defensiva</option>
                              <option value="TRANSICAO_OF">Transição Ofensiva</option>
                              <option value="TRANSICAO_DEF">Transição Defensiva</option>
                          </select>
                          <button onClick={() => {setFilterPhase('all'); setFilterAction('all'); setFilterTimeBlock(null);}} className="w-full py-3 text-[10px] font-black uppercase text-indigo-300 hover:text-white underline decoration-indigo-400 underline-offset-4">Limpar Filtros</button>
                      </div>
                  </div>
              </div>

              {/* HISTÓRICO REALTIME */}
              <div className="bg-white dark:bg-darkCard rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-100 dark:border-darkBorder flex justify-between items-center bg-gray-50/50 dark:bg-darkInput">
                      <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><Timer size={18} className="text-indigo-500"/> Histórico de Partidas (Scout RealTime)</h3>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                      {realtimeHistory.length > 0 ? realtimeHistory.map(entry => (
                          <div key={entry.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-indigo-900/10 transition-all border-l-4 border-transparent hover:border-indigo-600">
                              <div className="flex items-center gap-5">
                                  <div className="bg-indigo-100 dark:bg-indigo-900/30 p-4 rounded-2xl text-indigo-600 dark:text-indigo-400 shadow-sm"><Timer size={24}/></div>
                                  <div>
                                      <p className="text-base font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Partida Monitorada</p>
                                      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">
                                          <div className="flex items-center gap-1.5"><CalendarIcon size={12}/> {formatDateSafe(entry.date)}</div>
                                          <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400"><Target size={12}/> {entry.eventsCount} Ações</div>
                                          <div className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400"><Activity size={12}/> Impacto: {entry.avgImpact.toFixed(2)}</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2">
                                  <button onClick={() => { setSelectedEntryId(entry.id); setModalType('confirm_delete_entry'); setModalMessage('Deseja excluir permanentemente os dados desta atuação?'); }} className="p-2.5 bg-gray-50 dark:bg-darkInput text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm">
                                      <Trash2 size={16}/>
                                  </button>
                                  <button onClick={() => navigate(`/athletes/${id}/evaluation/${entry.id}`)} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-all shadow-sm"><Eye size={16}/> Detalhes</button>
                              </div>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 dark:text-gray-700 text-[10px] font-black uppercase tracking-widest italic text-xs">Nenhuma partida registrada no scout</div>}
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'snapshots' && (
          <div className="space-y-12 animate-fade-in">
              {/* ANALÍTICA SNAPSHOTS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm h-[480px] flex flex-col transition-colors">
                      <div className="flex items-center gap-3 mb-8">
                          <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg"><Target size={20}/></div>
                          <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Mapeamento Técnico (Média)</h3>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarAggregatedTech}>
                              <PolarGrid stroke="#334155" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                              <Radar name="Histórico" dataKey="A" stroke="#10b981" fill="#34d399" fillOpacity={0.6} />
                          </RadarChart>
                      </ResponsiveContainer>
                  </div>
                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm h-[480px] flex flex-col transition-colors">
                      <div className="flex items-center gap-3 mb-8">
                          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg"><Activity size={20}/></div>
                          <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Perfil de Capacidades Físicas (Média)</h3>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarAggregatedPhys}>
                              <PolarGrid stroke="#334155" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Histórico" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.6} />
                          </RadarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* HISTÓRICO SNAPSHOTS */}
              <div className="bg-white dark:bg-darkCard rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden transition-colors">
                  <div className="p-8 border-b border-gray-100 dark:border-darkBorder flex justify-between items-center bg-gray-50/50 dark:bg-darkInput">
                      <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><ClipboardCheck size={18} className="text-emerald-500"/> Histórico de Avaliações Registradas</h3>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                      {evalSessions.length > 0 ? evalSessions.map(ev => (
                          <div key={ev.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-indigo-900/10 transition-all border-l-4 border-transparent hover:border-emerald-600">
                              <div className="flex items-center gap-5">
                                  <div className="bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-sm"><Target size={24}/></div>
                                  <div>
                                      <p className="text-base font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">{ev.type}</p>
                                      <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">
                                          <CalendarIcon size={12}/> {formatDateSafe(ev.date)} • TÉC: {ev.scoreTecnico.toFixed(1)} • FÍS: {ev.scoreFisico.toFixed(0)}%
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-2">
                                  <button onClick={() => { setSelectedEvalId(ev.id); setModalType('confirm_delete_eval'); setModalMessage('Excluir permanentemente esta avaliação?'); }} className="p-2.5 bg-gray-50 dark:bg-darkInput text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm"><Trash2 size={16}/></button>
                                  <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-all shadow-sm"><Eye size={16}/> Relatório</button>
                              </div>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 dark:text-gray-700 text-[10px] font-black uppercase tracking-widest italic text-xs">Nenhuma avaliação encontrada</div>}
                  </div>
              </div>
          </div>
      )}

      {/* MODAIS */}
      {modalType === 'edit' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-4xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 dark:border-darkBorder pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 dark:text-gray-100">
                    <div className="p-2 rounded-xl text-white bg-indigo-600"><Edit size={24}/></div>
                    Editar Cadastro do Atleta
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
              </div>
              <form onSubmit={handleSubmitEdit} className="space-y-12">
                 <div className="flex flex-col items-center">
                    <div className="w-32 h-32 bg-gray-50 dark:bg-darkInput rounded-full flex items-center justify-center mb-4 overflow-hidden border-4 border-dashed border-gray-200 dark:border-darkBorder shadow-inner relative">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <Users size={48} className="text-gray-200 dark:text-gray-700" />)}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-5 py-2.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Processando...' : <><Upload size={14} /> Carregar Foto</>}
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
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-indigo-50 dark:border-darkBorder"><HelpCircle size={14} className="text-indigo-400"/><h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Identificação</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label><input required type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label><input type="date" required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} /></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG / Identificador</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.rg} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} required /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>{Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.categoryId || ''} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-emerald-50 dark:border-darkBorder"><Target size={14} className="text-emerald-400"/><h4 className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Responsáveis</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Responsável</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.responsibleName} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail para Contato</label><input type="email" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsibleEmail} onChange={e => setEditFormData({...editFormData, responsibleEmail: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone WhatsApp</label><input type="tel" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsiblePhone} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} /></div>
                    </div>
                 </div>
                 <div className="flex justify-end pt-6">
                    <button type="submit" disabled={uploading || loading} className="w-full md:w-auto bg-indigo-600 text-white font-black py-4 px-12 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 border-b-4 border-indigo-900">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} {loading ? 'Gravando...' : 'Salvar Alterações'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {modalType === 'confirm_delete_eval' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-darkCard border dark:border-darkBorder rounded-[40px] w-full max-w-sm p-10 shadow-2xl text-center">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 shadow-inner"><AlertCircle size={40} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Apagar Avaliação?</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-8 font-bold uppercase tracking-widest">{modalMessage}</p>
                  <div className="space-y-3">
                      <button onClick={handleDeleteEvaluation} disabled={loading} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-xl uppercase tracking-widest text-[11px] active:scale-95 border-b-4 border-red-900">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} Confirmar Exclusão
                      </button>
                      <button onClick={() => setModalType('none')} className="w-full bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl hover:bg-gray-100 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete_entry' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-darkCard border dark:border-darkBorder rounded-[40px] w-full max-w-sm p-10 shadow-2xl text-center">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 shadow-inner"><AlertCircle size={40} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Apagar Atuação?</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-8 font-bold uppercase tracking-widest">{modalMessage}</p>
                  <div className="space-y-3">
                      <button onClick={handleDeleteEntry} disabled={loading} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-xl uppercase tracking-widest text-[11px] active:scale-95 border-b-4 border-red-900">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} Confirmar Exclusão
                      </button>
                      <button onClick={() => setModalType('none')} className="w-full bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl hover:bg-gray-100 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'success' || modalType === 'error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
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
