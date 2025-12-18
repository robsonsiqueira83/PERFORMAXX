
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
  Plus, Trash2, ArrowRightLeft, Mail, Phone, UserCircle, CheckCircle
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  const [activeTab, setActiveTab] = useState<'realtime' | 'snapshots'>('realtime');
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  const [modalType, setModalType] = useState<'none' | 'edit' | 'confirm_delete' | 'success' | 'error'>('none');
  const [modalMessage, setModalMessage] = useState('');
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
    const avg = (type: 'technical' | 'physical') => {
        let count = 0;
        const sum = entries.reduce((acc, curr) => {
            const group = curr[type] as any;
            if (!group) return acc;
            const vals = Object.values(group).map(v => Number(v) || 0);
            count++;
            return acc + (vals.reduce((a,b)=>a+b, 0) / vals.length);
        }, 0);
        return count > 0 ? sum / count : 0;
    };
    
    // Decompõe fundamentos técnicos específicos
    const techGroup = entries[0]?.technical ? Object.keys(entries[0].technical).map(key => {
        const val = entries.reduce((acc, curr) => acc + (Number((curr.technical as any)[key]) || 0), 0) / entries.length;
        return { subject: key.replace('_', ' '), A: val };
    }) : [];

    const physGroup = entries[0]?.physical ? Object.keys(entries[0].physical).map(key => {
        const val = entries.reduce((acc, curr) => acc + (Number((curr.physical as any)[key]) || 0), 0) / entries.length;
        return { subject: key.charAt(0).toUpperCase() + key.slice(1), A: val };
    }) : [];

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

  const aggregateHeatmapPoints = useMemo(() => {
    let allPoints: HeatmapPoint[] = [];
    const relevantEntries = !filterDate ? entries : entries.filter(e => {
        const s = sessions.find(sess => sess.id === e.sessionId);
        return s?.date === filterDate;
    });
    relevantEntries.forEach(e => {
        if (e.heatmapPoints) allPoints = [...allPoints, ...e.heatmapPoints];
    });
    return allPoints;
  }, [entries, sessions, filterDate]);

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

  const confirmDeleteAthlete = async () => {
      if (!athlete) return;
      setLoading(true);
      try {
          await deleteAthlete(athlete.id);
          setModalType('success');
          setModalMessage('Perfil do atleta removido com sucesso.');
          setTimeout(() => navigate('/athletes'), 1500);
      } catch (err) {
          setModalType('error');
          setModalMessage('Erro ao excluir atleta.');
      } finally {
          setLoading(false);
      }
  };

  if (loading && modalType === 'none') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in">
      
      {/* RADARES DE MÉDIAS (NOVO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[320px]">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Médias Fundamentos Técnicos</h3>
              {radarAveragesData?.tech.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.tech}>
                        <PolarGrid stroke="#f3f4f6" /><PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 700 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                        <Radar name="Nota" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] uppercase font-bold italic">Sem dados técnicos</div>}
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[320px]">
              <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={16}/> Médias Capacidade Física</h3>
              {radarAveragesData?.phys.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.phys}>
                        <PolarGrid stroke="#f3f4f6" /><PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 700 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                        <Radar name="Nota" dataKey="A" stroke="#ea580c" fill="#f97316" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] uppercase font-bold italic">Sem dados físicos</div>}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                {athlete.photoUrl ? (
                    <img src={athlete.photoUrl} className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg" alt="" />
                ) : (
                    <div className="w-32 h-32 rounded-full bg-indigo-100 flex items-center justify-center text-5xl font-black text-indigo-600">{athlete.name.charAt(0)}</div>
                )}
                {canEditData(currentUser?.role || UserRole.TECNICO) && (
                    <button onClick={() => { setEditFormData({...athlete}); setModalType('edit'); }} className="absolute bottom-1 right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all"><Edit size={16}/></button>
                )}
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <h1 className="text-3xl font-black text-gray-900 tracking-tighter truncate">{athlete.name}</h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                   <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-1 rounded font-black uppercase">{athlete.position}</span>
                   <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-1 rounded font-black uppercase">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                   <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-tighter">RG: {athlete.rg}</span>
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
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Timer size={12} className="text-indigo-500"/> Impacto em Jogo</span>
                  <p className={`text-3xl font-black ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(2)}</p>
                  <span className={`text-[8px] font-black uppercase ${impact.text}`}>{impact.label}</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`w-full transition-all duration-1000 ${impact.color}`} style={{ height: `${Math.min(100, Math.max(0, ((globalStats?.avgGlobal || 0) + 1.5) / 3 * 100))}%` }}></div>
              </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><ClipboardCheck size={12} className="text-emerald-500"/> Média Técnica</span>
                  <p className="text-3xl font-black text-emerald-600">{avgStructuredTech.toFixed(1)}</p>
                  <span className={`text-[8px] font-black uppercase text-emerald-400`}>Escala controlada 1-5</span>
              </div>
              <div className="h-12 w-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(avgStructuredTech / 5) * 100}%` }}></div>
              </div>
          </div>
      </div>

      {/* MAPA DE CALOR E TÁTICO RESTAURADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
              <HeatmapField perspective points={aggregateHeatmapPoints} readOnly label="Mapa de Calor (Posicionamento Acumulado)" />
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[380px]">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Desempenho Tático por Fase</h3>
              {globalStats ? (
                  <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={globalStats.radarData}>
                          <PolarGrid stroke="#e5e7eb" />
                          <PolarAngleAxis dataKey="phase" tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 800 }} />
                          <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                          <Radar name="Score" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                      </RadarChart>
                  </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] uppercase font-bold bg-gray-50 rounded-xl italic">Sem registros táticos</div>}
          </div>
      </div>

      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm max-w-md mx-auto">
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
      </div>

      {activeTab === 'snapshots' && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><ClipboardCheck size={18} className="text-emerald-500"/> Histórico de Avaliações</h3>
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
                                          <div className="flex items-center gap-1 text-emerald-600"><TrendingUp size={12}/> TÉC: {ev.scoreTecnico.toFixed(1)}</div>
                                          <div className="flex items-center gap-1 text-blue-500"><Activity size={12}/> FÍS: {ev.scoreFisico.toFixed(0)}%</div>
                                      </div>
                                  </div>
                              </div>
                              <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all shadow-sm"><Eye size={16}/> Relatório</button>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 text-xs font-bold uppercase tracking-widest italic">Nenhuma avaliação encontrada</div>}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL EDIÇÃO E EXCLUSÃO PADRONIZADOS */}
      {modalType === 'edit' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><Edit className="text-indigo-600" size={24}/> Editar Perfil do Atleta</h3>
                <button onClick={() => setModalType('none')} className="bg-gray-100 p-2 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"><X size={20} /></button>
              </div>
              <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editFormData.name || !athlete) return;
                  setLoading(true);
                  try {
                      await saveAthlete({ ...athlete, ...editFormData } as Athlete);
                      setModalType('success');
                      setModalMessage('Dados atualizados!');
                      setRefreshKey(prev => prev + 1);
                  } catch (err) { setModalType('error'); setModalMessage('Erro ao salvar.'); } finally { setLoading(false); }
              }} className="space-y-6">
                 <div className="flex flex-col items-center">
                    <div className="w-28 h-28 bg-gray-50 rounded-full flex items-center justify-center mb-3 overflow-hidden border-2 border-dashed border-gray-200 shadow-inner relative">
                        {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={32} className="text-gray-200" />)}
                    </div>
                    <label className={`cursor-pointer text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:text-blue-800 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                       {uploading ? 'Enviando...' : <><Plus size={14} /> Alterar Foto</>}
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

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest border-b pb-1">Dados Pessoais</h4>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Nome Completo</label>
                           <input required type="text" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Nascimento</label>
                                <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500" value={editFormData.birthDate || ''} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">RG / ID</label>
                                <input required type="text" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500" value={editFormData.rg || ''} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Posição</label>
                            <select required className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                                {Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest border-b pb-1">Responsáveis</h4>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Nome</label><input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none" value={editFormData.responsibleName || ''} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">E-mail</label><input type="email" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none" value={editFormData.responsibleEmail || ''} onChange={e => setEditFormData({...editFormData, responsibleEmail: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Telefone</label><input type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 font-bold text-gray-800 outline-none" value={editFormData.responsiblePhone || ''} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} /></div>
                    </div>
                 </div>

                 <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setModalType('confirm_delete')} className="flex-1 bg-red-50 text-red-600 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all flex items-center justify-center gap-2"><Trash2 size={16}/> Excluir Atleta</button>
                    <button type="submit" disabled={uploading} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                        {uploading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                        {uploading ? 'Aguarde...' : 'Salvar Alterações'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-slide-up text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><AlertCircle size={32}/></div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-4">Atenção!</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">Deseja realmente excluir o perfil de {athlete.name}? Esta ação é irreversível.</p>
                  <div className="flex gap-3">
                      <button onClick={() => setModalType('edit')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                      <button onClick={confirmDeleteAthlete} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all">Excluir</button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'success' || modalType === 'error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {modalType === 'success' ? <CheckCircle className="text-emerald-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tighter">{modalType === 'success' ? 'Sucesso!' : 'Erro'}</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className="text-white font-black py-3 px-8 rounded-2xl transition-all w-full mt-6 shadow-lg uppercase tracking-widest text-[10px] bg-indigo-600 hover:bg-indigo-700">OK</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AthleteProfile;
