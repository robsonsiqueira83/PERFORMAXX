
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  getAthletes, getTrainingEntries, getTrainingSessions, saveAthlete, getCategories, getEvaluationSessions, deleteAthlete, getTeams,
  getTechnicalEvaluations, getPhysicalEvaluations
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

  // Aba inicial: Avaliações
  const [activeTab, setActiveTab] = useState<'snapshots' | 'realtime'>('snapshots');
  
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterTimeBlock, setFilterTimeBlock] = useState<number | null>(null);
  const [mapToggle, setMapToggle] = useState<'all' | 'positiva' | 'negativa'>('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  const [modalType, setModalType] = useState<'none' | 'edit' | 'confirm_delete' | 'confirm_delete_eval' | 'success' | 'error' | 'transfer_athlete'>('none');
  const [modalMessage, setModalMessage] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  
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

             // Busca detalhes de todas as avaliações para as médias da aba snapshots
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

  // --- LOGICA DE SCOUT REALTIME ---
  const allEvents = useMemo(() => {
      let evts: any[] = [];
      entries.forEach(entry => {
          try {
              const notes = JSON.parse(entry.notes || '{}');
              if (notes.events) {
                  const session = sessions.find(s => s.id === entry.sessionId);
                  evts = [...evts, ...notes.events.map((e: any) => ({ ...e, sessionDate: session?.date }))];
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

  // --- LOGICA DE AVALIAÇÕES AGREGADAS (Snapshot Tab) ---
  const avgStructuredTech = useMemo(() => {
    if (evalSessions.length === 0) return 0;
    return evalSessions.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / evalSessions.length;
  }, [evalSessions]);

  const avgStructuredPhys = useMemo(() => {
    if (evalSessions.length === 0) return 0;
    return evalSessions.reduce((acc, curr) => acc + curr.scoreFisico, 0) / evalSessions.length;
  }, [evalSessions]);

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

  // Score Global 0-10 para o bloco EXECUTIVE
  const globalScore = useMemo(() => {
      const raw = layer1Stats?.avgGlobal || 0;
      return Math.max(0, Math.min(10, 5 + (raw * 3.33)));
  }, [layer1Stats]);

  const getSemanticReading = (score: number, eventCount: number) => {
      if (eventCount < 5) return "Leitura inicial — mais dados aumentam a precisão";
      if (score >= 8.0) return "Alto impacto e boa consistência nas decisões";
      if (score >= 6.5) return "Bom nível de impacto nas ações de jogo";
      if (score >= 5.0) return "Desempenho funcional dentro da proposta";
      if (score >= 3.0) return "Abaixo do nível desejado para o contexto atual";
      return "Participação ainda em construção";
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

  const dominantChartData = useMemo(() => {
      if (filteredEvents.length === 0) return [];
      if (filterAction !== 'all') {
          const results = ['POSITIVA', 'NEUTRA', 'NEGATIVA'];
          return results.map(r => ({
              name: r,
              score: filteredEvents.filter(e => e.result === r).length
          }));
      }
      if (filterPhase !== 'all') {
          const actions = Array.from(new Set(filteredEvents.map(e => e.action)));
          return actions.map(a => {
              const ae = filteredEvents.filter(e => e.action === a);
              return { name: a, score: ae.reduce((acc, c) => acc + c.eventScore, 0) / ae.length };
          });
      }
      return layer1Stats?.radarData.map(d => ({ name: d.phase, score: d.A })) || [];
  }, [filteredEvents, filterPhase, filterAction, layer1Stats]);

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

  const timelineData = useMemo(() => {
      const baseEvents = filterDate ? allEvents.filter(e => e.sessionDate === filterDate) : allEvents;
      if (baseEvents.length === 0) return [];
      const blocks: any[] = [];
      const maxSec = Math.max(...baseEvents.map(e => e.seconds));
      for (let i = 0; i <= maxSec; i += 60) {
          const minEvents = baseEvents.filter(e => e.seconds >= i && e.seconds < i + 60);
          const score = minEvents.length > 0 ? minEvents.reduce((acc, c) => acc + c.eventScore, 0) / minEvents.length : 0;
          blocks.push({ time: `${Math.floor(i/60)}'`, score, raw: i });
      }
      return blocks;
  }, [allEvents, filterDate]);

  const heatmapPoints = useMemo(() => {
      let pts = filteredEvents;
      if (mapToggle === 'positiva') pts = pts.filter(e => e.result === 'POSITIVA');
      if (mapToggle === 'negativa') pts = pts.filter(e => e.result === 'NEGATIVA');
      return pts.map(e => e.location);
  }, [filteredEvents, mapToggle]);

  const handleDeleteAthlete = async () => {
      if (!athlete) return;
      setLoading(true);
      try {
          await deleteAthlete(athlete.id);
          setModalType('success'); setModalMessage('Atleta excluído.');
          setTimeout(() => navigate('/athletes'), 2000);
      } catch (err: any) { setModalType('error'); setModalMessage(err.message); } 
      finally { setLoading(false); }
  };

  const handleDeleteEvaluation = async () => {
    if (!selectedEvalId) return;
    setLoading(true);
    try {
        // Exclusão recursiva de todos os dados da seção de avaliação
        await supabase.from('technical_evaluations').delete().eq('session_id', selectedEvalId);
        await supabase.from('physical_evaluations').delete().eq('session_id', selectedEvalId);
        const { error } = await supabase.from('evaluations_sessions').delete().eq('id', selectedEvalId);
        if (error) throw error;

        setModalType('success');
        setModalMessage('Sessão de avaliação excluída com sucesso.');
        setRefreshKey(prev => prev + 1);
    } catch (err: any) {
        setModalType('error');
        setModalMessage('Erro ao excluir avaliação: ' + err.message);
    } finally {
        setLoading(false);
        setSelectedEvalId(null);
    }
  };

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
                {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 dark:text-gray-600">{d}</div>)}
                {days}
            </div>
        </div>
    );
  };

  if (loading && modalType === 'none') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in transition-colors duration-300">
      
      {/* HEADER INTEGRADO COM SCORE EXECUTIVE */}
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
                        <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase tracking-widest"><Target size={16} /> Iniciar Avaliação</button>
                    </div>
                  </div>
              </div>

              {/* Bloco Score EXECUTIVE */}
              <div className="w-full md:w-64 bg-gray-50 dark:bg-darkInput/50 p-6 rounded-3xl border border-gray-100 dark:border-darkBorder flex flex-col items-center text-center shrink-0 shadow-inner">
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-1">Score do Atleta</span>
                  <span className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none">{globalScore.toFixed(1)}</span>
                  <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 mt-4 leading-tight uppercase tracking-widest">{getSemanticReading(globalScore, allEvents.length)}</p>
                  
                  <div className="mt-4 pt-4 border-t dark:border-darkBorder w-full space-y-2">
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Impacto Tático</span>
                          <span className="text-[9px] font-mono font-black text-indigo-500">{(layer1Stats?.avgGlobal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Média Técnica</span>
                          <span className="text-[9px] font-mono font-black text-emerald-500">{avgStructuredTech.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Condição Física</span>
                          <span className="text-[9px] font-mono font-black text-blue-500">{avgStructuredPhys.toFixed(0)}%</span>
                      </div>
                  </div>

                  <div className="mt-4 flex items-center justify-center text-gray-300 dark:text-gray-700" title="Este score resume o impacto das ações do atleta no jogo.">
                      <HelpCircle size={14} />
                  </div>
              </div>
          </div>
          <div className="lg:col-span-1">{renderCalendar()}</div>
      </div>

      {/* SELETOR DE ABAS */}
      <div className="flex bg-white dark:bg-darkCard p-1.5 rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm max-w-md mx-auto">
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-darkInput'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
      </div>

      {activeTab === 'realtime' && (
          <div className="space-y-8 animate-fade-in">
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

                  <div className="bg-indigo-900 dark:bg-darkInput p-8 rounded-3xl shadow-xl flex flex-col justify-between border dark:border-darkBorder">
                      <h3 className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Filter size={14}/> Motor de Contexto</h3>
                      <div className="space-y-4">
                          <select value={filterPhase} onChange={e => {setFilterPhase(e.target.value); setFilterAction('all');}} className="w-full bg-indigo-800 dark:bg-darkCard border-none rounded-xl p-4 text-xs font-black uppercase text-white focus:ring-2 focus:ring-indigo-400 shadow-lg">
                              <option value="all">Todas as Fases</option>
                              <option value="OFENSIVA">Organização Ofensiva</option>
                              <option value="DEFENSIVA">Organização Defensiva</option>
                              <option value="TRANSICAO_OF">Transição Ofensiva</option>
                              <option value="TRANSICAO_DEF">Transição Defensiva</option>
                          </select>
                          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="w-full bg-indigo-800 dark:bg-darkCard border-none rounded-xl p-4 text-xs font-black uppercase text-white focus:ring-2 focus:ring-indigo-400 shadow-lg" disabled={filterPhase === 'all'}>
                              <option value="all">Todas as Ações</option>
                              {filterPhase !== 'all' && Array.from(new Set(allEvents.filter(e => e.phase === filterPhase).map(e => e.action))).map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                          <button onClick={() => {setFilterPhase('all'); setFilterAction('all'); setFilterTimeBlock(null);}} className="w-full py-3 text-[10px] font-black uppercase text-indigo-300 hover:text-white transition-all underline decoration-indigo-400 underline-offset-4">Limpar Filtros</button>
                      </div>
                      <div className="mt-6 pt-6 border-t border-indigo-800 dark:border-darkBorder flex items-center gap-3">
                          <Info size={16} className="text-indigo-400" />
                          <span className="text-[9px] text-indigo-400 font-bold uppercase leading-tight tracking-tighter">Datasets refinados guiam a correção tática individual.</span>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-3 bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm relative min-h-[400px]">
                      <h3 className="text-base font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter mb-8 flex items-center gap-3">
                         {filterAction !== 'all' ? <CheckCircle size={20} className="text-indigo-500"/> : filterPhase !== 'all' ? <Zap size={20} className="text-yellow-500"/> : <Activity size={20} className="text-indigo-500"/>}
                         {filterAction !== 'all' ? `Eficácia: ${filterAction}` : filterPhase !== 'all' ? `Impacto: ${filterPhase.replace('_', ' ')}` : 'Perfil de Impacto por Fase'}
                      </h3>

                      {filteredEvents.length >= 1 ? (
                          <div className="h-[280px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={dominantChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                                      <Tooltip cursor={{fill: '#1c2d3c'}} contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                                      <Bar dataKey="score" radius={[8, 8, 0, 0]} barSize={45}>
                                          {dominantChartData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={filterAction !== 'all' ? (entry.name === 'POSITIVA' ? '#10b981' : entry.name === 'NEGATIVA' ? '#ef4444' : '#9ca3af') : (entry.score >= 0.3 ? '#4f46e5' : entry.score <= -0.3 ? '#ef4444' : '#64748b')} />
                                          ))}
                                      </Bar>
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                      ) : (
                          <div className="h-[280px] flex flex-col items-center justify-center text-gray-400 gap-3">
                              <AlertCircle size={48} className="opacity-10" />
                              <p className="text-sm font-black uppercase tracking-widest opacity-30 italic">Sem eventos para este contexto</p>
                          </div>
                      )}
                  </div>

                  <div className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden flex flex-col">
                      <div className="p-5 border-b border-gray-50 dark:border-darkBorder bg-gray-50/50 dark:bg-darkInput/30">
                          <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={14}/> Top Impacto</h3>
                      </div>
                      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
                          <div>
                              <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-3 block tracking-widest">PONTOS FORTES</span>
                              <div className="space-y-2">
                                  {impactRanking.best.map((a, i) => (
                                      <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                                          <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-200 uppercase truncate pr-2">{a.name}</span>
                                          <span className="text-[10px] font-mono font-black text-emerald-600 dark:text-emerald-400">+{a.avg.toFixed(1)}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                          <div className="border-t border-dashed border-gray-100 dark:border-darkBorder pt-6">
                              <span className="text-[9px] font-black text-red-500 dark:text-red-400 uppercase mb-3 block tracking-widest">A MELHORAR</span>
                              <div className="space-y-2">
                                  {impactRanking.worst.map((a, i) => (
                                      <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                                          <span className="text-[10px] font-black text-red-800 dark:text-red-200 uppercase truncate pr-2">{a.name}</span>
                                          <span className="text-[10px] font-mono font-black text-red-600 dark:text-red-400">{a.avg.toFixed(1)}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><MousePointer2 size={16}/> Mapeamento Espacial</h3>
                          <div className="flex bg-gray-100 dark:bg-darkInput p-1.5 rounded-xl border dark:border-darkBorder">
                              {(['all', 'positiva', 'negativa'] as const).map(m => (
                                  <button key={m} onClick={() => setMapToggle(m)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${mapToggle === m ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-600 hover:text-gray-600'}`}>
                                      {m === 'all' ? 'Todas' : m === 'positiva' ? 'Sucesso' : 'Erro'}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div className="flex-1 flex items-center justify-center p-4">
                          <HeatmapField perspective points={heatmapPoints} readOnly className="max-w-md w-full" label="Mapa de Ocupação e Ação" />
                      </div>
                  </div>

                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col h-full">
                      <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={16}/> Timeline de Intensidade</h3>
                      <div className="flex-1 min-h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={timelineData} onClick={d => d?.activePayload && setFilterTimeBlock(d.activePayload[0].payload.raw)}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                                  <YAxis domain={[-1.5, 1.5]} hide />
                                  <Tooltip cursor={{stroke: '#4f46e5', strokeWidth: 2}} content={({ active, payload }) => {
                                      if (active && payload?.length) return (
                                          <div className="bg-indigo-900 text-white p-3 rounded-2xl text-[10px] font-black uppercase shadow-2xl border border-indigo-700">
                                              <p>{payload[0].payload.time}: Impacto {payload[0].value?.toFixed(2)}</p>
                                              <p className="text-indigo-400 mt-1">Toque para isolar este período</p>
                                          </div>
                                      );
                                      return null;
                                  }} />
                                  <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={5} dot={{ r: 6, fill: '#4f46e5', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                              </LineChart>
                          </ResponsiveContainer>
                      </div>
                      {filterTimeBlock !== null && (
                          <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl flex justify-between items-center animate-fade-in shadow-sm">
                              <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Bloco: {Math.floor(filterTimeBlock/60)}' a {Math.floor(filterTimeBlock/60) + 5}'</span>
                              <button onClick={() => setFilterTimeBlock(null)} className="text-[10px] font-black text-indigo-500 uppercase hover:text-indigo-800 transition-colors">Remover Filtro</button>
                          </div>
                      )}
                      <p className="text-[9px] text-gray-400 dark:text-gray-600 font-bold uppercase mt-6 text-center tracking-widest italic">A linha temporal permite correlacionar queda técnica com fadiga física.</p>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'snapshots' && (
          <div className="space-y-12 animate-fade-in">
              {/* SEÇÃO ANALÍTICA AGREGADA (ESTILO EVAL-VIEW) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Radar Técnico Média */}
                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm h-[480px] flex flex-col">
                      <div className="flex items-center gap-3 mb-8">
                          <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg"><Target size={20}/></div>
                          <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Mapeamento Técnico de Fundamentos (Média)</h3>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarAggregatedTech}>
                              <PolarGrid stroke="#334155" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                              <Radar name="Médias" dataKey="A" stroke="#10b981" fill="#34d399" fillOpacity={0.6} />
                              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                          </RadarChart>
                      </ResponsiveContainer>
                  </div>

                  {/* Radar Físico Média */}
                  <div className="bg-white dark:bg-darkCard p-8 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm h-[480px] flex flex-col">
                      <div className="flex items-center gap-3 mb-8">
                          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg"><Activity size={20}/></div>
                          <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Perfil de Capacidades Físicas (Média)</h3>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarAggregatedPhys}>
                              <PolarGrid stroke="#334155" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Médias" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.6} />
                              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                          </RadarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* Tendência de Evolução Temporal */}
              <div className="bg-white dark:bg-darkCard p-10 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm">
                  <div className="flex items-center gap-3 mb-10">
                      <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><TrendingUp size={20}/></div>
                      <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Histórico e Tendências de Evolução</h3>
                  </div>
                  <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={evolutionAggregatedData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                              <YAxis domain={[0, 5]} hide />
                              <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                              <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '30px' }} />
                              <Line name="Técnica" type="monotone" dataKey="tech" stroke="#10b981" strokeWidth={5} dot={{ r: 8, strokeWidth: 3, fill: '#fff', stroke: '#10b981' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                              <Line name="Física (Normalizado 1-5)" type="monotone" dataKey="phys" stroke="#2563eb" strokeWidth={5} dot={{ r: 8, strokeWidth: 3, fill: '#fff', stroke: '#2563eb' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                          </LineChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* HISTÓRICO DE AVALIAÇÕES (Lista) */}
              <div className="bg-white dark:bg-darkCard rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden">
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
                                  <button onClick={() => { setSelectedEvalId(ev.id); setModalType('confirm_delete_eval'); setModalMessage('Deseja excluir permanentemente esta avaliação e todos os dados vinculados?'); }} className="p-2.5 bg-gray-50 dark:bg-darkInput text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm">
                                      <Trash2 size={16}/>
                                  </button>
                                  <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-all shadow-sm"><Eye size={16}/> Relatório</button>
                              </div>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 dark:text-gray-700 text-[10px] font-black uppercase tracking-widest italic text-xs">Nenhuma avaliação encontrada</div>}
                  </div>
              </div>
          </div>
      )}

      {/* MODAIS (MANTIDOS E ATUALIZADOS) */}
      {modalType === 'edit' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-4xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 dark:border-darkBorder pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 dark:text-gray-100">
                    <div className={`p-2 rounded-xl text-white ${editFormData.id ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                        {editFormData.id ? <Edit size={24}/> : <Plus size={24}/>}
                    </div>
                    {editFormData.id ? 'Editar Cadastro do Atleta' : 'Novo Atleta'}
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
              </div>
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editFormData.name || !athlete) return;
                  setLoading(true);
                  try {
                      await saveAthlete({ ...athlete, ...editFormData } as Athlete);
                      setModalType('success'); setModalMessage('Perfil atualizado!'); setRefreshKey(prev => prev + 1);
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
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-indigo-50 dark:border-darkBorder"><HelpCircle size={14} className="text-indigo-400"/><h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Identificação</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label><input required type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label><input type="date" required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} /></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG / Identificador</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.rg} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} required /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>{Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-emerald-50 dark:border-darkBorder"><Target size={14} className="text-emerald-400"/><h4 className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Responsáveis</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Responsável</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.responsibleName} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail para Contato</label><input type="email" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsibleEmail} onChange={e => setEditFormData({...editFormData, responsibleEmail: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone WhatsApp</label><input type="tel" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsiblePhone} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} /></div>
                    </div>
                 </div>
                 <div className="flex flex-wrap gap-4 pt-6">
                    <button type="button" onClick={() => setModalType('confirm_delete')} className="flex-1 min-w-[150px] bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all flex items-center justify-center gap-2 border-b-4 border-red-200 dark:border-red-900/30"><Trash2 size={16}/> Excluir Atleta</button>
                    <button type="button" onClick={() => setModalType('transfer_athlete')} className="flex-1 min-w-[150px] bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border-b-4 border-indigo-200 dark:border-indigo-900/30"><ArrowRightLeft size={16}/> Transferir</button>
                    <button type="submit" disabled={uploading || loading} className="flex-[2] min-w-[250px] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 border-b-4 border-indigo-900">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} {loading ? 'Gravando...' : 'Salvar Alterações'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-sm p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 shadow-inner"><AlertCircle size={40} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Excluir?</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-8 font-bold uppercase tracking-widest leading-relaxed">Esta ação é irreversível.</p>
                  <div className="space-y-3">
                      <button onClick={handleDeleteAthlete} disabled={loading} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-xl uppercase tracking-widest text-[11px] active:scale-95 border-b-4 border-red-900">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} Confirmar
                      </button>
                      <button onClick={() => setModalType('edit')} className="w-full bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl hover:bg-gray-100 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete_eval' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-sm p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 shadow-inner"><AlertCircle size={40} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Apagar Dados?</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-8 font-bold uppercase tracking-widest">{modalMessage}</p>
                  <div className="space-y-3">
                      <button onClick={handleDeleteEvaluation} disabled={loading} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 flex items-center justify-center gap-2 shadow-xl uppercase tracking-widest text-[11px] active:scale-95 border-b-4 border-red-900">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>} Confirmar Exclusão
                      </button>
                      <button onClick={() => { setModalType('none'); setSelectedEvalId(null); }} className="w-full bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl hover:bg-gray-100 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'transfer_athlete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400 shadow-inner"><ArrowRightLeft size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Transferir</h2>
                  <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!transferTargetId || !athlete) return;
                      setTransferLoading(true);
                      try {
                          const targetTeam = allTeams.find(t => t.id === transferTargetId.trim());
                          if (!targetTeam) { setModalType('error'); setModalMessage('ID do Clube receptor não localizado.'); return; }
                          await saveAthlete({ ...athlete, pendingTransferTeamId: targetTeam.id });
                          setModalType('success'); setModalMessage(`Solicitação enviada para ${targetTeam.name}!`);
                          setTransferTargetId(''); setRefreshKey(prev => prev + 1);
                      } catch (err) { setModalType('error'); setModalMessage('Erro ao processar.'); } 
                      finally { setTransferLoading(false); }
                  }} className="space-y-4">
                      <input autoFocus type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-5 text-center font-mono font-black text-xl uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="ID DO CLUBE" value={transferTargetId} onChange={e => setTransferTargetId(e.target.value)} required />
                      <button type="submit" disabled={transferLoading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95">
                         {transferLoading ? <Loader2 className="animate-spin" size={18}/> : 'Solicitar Envio'}
                      </button>
                  </form>
                  <button onClick={() => setModalType('edit')} className="mt-8 text-[10px] font-black text-gray-400 dark:text-gray-500 hover:text-gray-600 uppercase tracking-widest">Voltar</button>
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
