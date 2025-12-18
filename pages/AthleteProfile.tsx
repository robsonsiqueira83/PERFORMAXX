
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
// Added 'Users' to imports to fix "Cannot find name 'Users'" error
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
    
    const techKeys: Record<string, string> = {
        controle_bola: 'Controle', conducao: 'Condução', padding_1: '', padding_2: '', padding_3: '', passe: 'Passe', recepcao: 'Recepção', 
        drible: 'Drible', finalizacao: 'Finaliz.', cruzamento: 'Cruzam.', desarme: 'Desarme', interceptacao: 'Intercep.'
    };

    const techGroup = Object.keys(techKeys).filter(k => techKeys[k] !== '').map(key => {
        const sum = entries.reduce((acc, curr) => acc + (Number((curr.technical as any)[key]) || 0), 0);
        const avg = sum / entries.length;
        const displayVal = avg > 5 ? avg / 2 : avg; 
        return { subject: techKeys[key], A: displayVal };
    });

    const physKeys: Record<string, string> = {
        velocidade: 'Velocidade', agilidade: 'Agilidade', resistencia: 'Resist.',
        forca: 'Força', coordenacao: 'Coord.', mobilidade: 'Mobil.', estabilidade: 'Estab.'
    };

    const physGroup = Object.keys(physKeys).map(key => {
        const sum = entries.reduce((acc, curr) => acc + (Number((curr.physical as any)[key]) || 0), 0);
        const avg = sum / entries.length;
        const displayVal = avg > 5 ? avg / 2 : avg; 
        return { subject: physKeys[key], A: displayVal };
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

  const aggregateHeatmapPoints = useMemo(() => {
    return filteredTacticalEvents.map(e => e.location);
  }, [filteredTacticalEvents]);

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

  const confirmDeleteEvaluation = async () => {
      if (!selectedEvalId) return;
      setLoading(true);
      try {
          await supabase.from('technical_evaluations').delete().eq('session_id', selectedEvalId);
          await supabase.from('physical_evaluations').delete().eq('session_id', selectedEvalId);
          await supabase.from('evaluations_sessions').delete().eq('id', selectedEvalId);
          
          setModalType('success');
          setModalMessage('Avaliação excluída com sucesso.');
          setRefreshKey(prev => prev + 1);
      } catch (err) {
          setModalType('error');
          setModalMessage('Erro ao excluir avaliação.');
      } finally {
          setLoading(false);
          setSelectedEvalId(null);
      }
  };

  if (loading && modalType === 'none') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="space-y-6 pb-20 relative animate-fade-in">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                {athlete.photoUrl ? (
                    <img src={athlete.photoUrl} className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg" alt="" />
                ) : (
                    <div className="w-32 h-32 rounded-full bg-indigo-100 flex items-center justify-center text-5xl font-black text-indigo-600">{athlete.name.charAt(0)}</div>
                )}
                {canEditData(currentUser?.role || UserRole.TECNICO) && (
                    <button onClick={() => { setEditFormData({...athlete}); setShowTransferField(false); setModalType('edit'); }} className="absolute bottom-1 right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 transition-all"><Edit size={16}/></button>
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

      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm max-w-md mx-auto">
          <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <Activity size={16}/> Scout RealTime
          </button>
          <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
              <ClipboardCheck size={16}/> Avaliações
          </button>
      </div>

      {activeTab === 'realtime' && (
          <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Desempenho Tático por Fase</h3>
                      {globalStats ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={globalStats.radarData}>
                                  <PolarGrid stroke="#e5e7eb" />
                                  <PolarAngleAxis dataKey="phase" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 800 }} />
                                  <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                  <Radar name="Score" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                              </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] font-bold uppercase italic">Sem dados táticos</div>}
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={16}/> Médias Fundamentos (1-5)</h3>
                      {radarAveragesData?.tech ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.tech}>
                                <PolarGrid stroke="#f3f4f6" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 700 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] font-bold uppercase italic">Sem dados técnicos</div>}
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-[320px]">
                      <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={16}/> Médias Condição Física (1-5)</h3>
                      {radarAveragesData?.phys ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.phys}>
                                <PolarGrid stroke="#f3f4f6" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 700 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#10b981" fill="#34d399" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-gray-300 text-[10px] font-bold uppercase italic">Sem dados físicos</div>}
                  </div>
              </div>

              <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-xl">
                  <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest flex items-center gap-2 mb-4"><Filter size={14}/> Filtros de Visualização (Mapa e Impacto)</h3>
                  <div className="space-y-4">
                      <div>
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Fase do Jogo</p>
                          <div className="flex flex-wrap gap-2">
                              {[
                                { id: 'all', label: 'Todas as Fases' },
                                { id: 'OFENSIVA', label: 'Org. Ofensiva' },
                                { id: 'DEFENSIVA', label: 'Org. Defensiva' },
                                { id: 'TRANSICAO_OF', label: 'Trans. Ofensiva' },
                                { id: 'TRANSICAO_DEF', label: 'Trans. Defensiva' }
                              ].map(p => (
                                <button 
                                  key={p.id} 
                                  onClick={() => setFilterPhase(p.id)}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${filterPhase === p.id ? 'bg-indigo-500 text-white border-indigo-400 shadow-md' : 'bg-indigo-800 text-indigo-300 border-indigo-700 hover:bg-indigo-700'}`}
                                >
                                  {p.label}
                                </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Resultado da Ação (Mapa)</p>
                          <div className="flex flex-wrap gap-2">
                              {[
                                { id: 'all', label: 'Todos' },
                                { id: 'POSITIVA', label: 'Sucesso' },
                                { id: 'NEUTRA', label: 'Neutro' },
                                { id: 'NEGATIVA', label: 'Erro' }
                              ].map(r => (
                                <button 
                                  key={r.id} 
                                  onClick={() => setFilterResult(r.id)}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${filterResult === r.id ? 'bg-indigo-500 text-white border-indigo-400 shadow-md' : 'bg-indigo-800 text-indigo-300 border-indigo-700 hover:bg-indigo-700'}`}
                                >
                                  {r.label}
                                </button>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center">
                    <div className="w-full max-w-sm">
                         <HeatmapField perspective points={aggregateHeatmapPoints} readOnly label="Mapa de Calor (Posicionamento)" />
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo de Impacto</h3><TrendingUp size={14} className="text-indigo-400"/></div>
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
                                    <span className="text-[9px] font-black text-red-500 uppercase mb-2 block tracking-wider">Atenção</span>
                                    {impactRanking.worst.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-red-50 border border-red-100 mb-1.5">
                                            <span className="text-[9px] font-black text-red-800 truncate pr-2 uppercase">{a.name}</span>
                                            <span className="text-[9px] font-mono font-black text-red-600">{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div className="h-full flex items-center justify-center text-[9px] text-gray-300 font-bold uppercase text-center italic">Sem dados...</div>}
                    </div>
                </div>
              </div>
          </div>
      )}

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
                              <div className="flex items-center gap-2">
                                  <button onClick={() => navigate(`/athletes/${id}/tech-phys-eval`)} className="p-2.5 bg-gray-50 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all shadow-sm" title="Editar Avaliação">
                                      <Edit size={16}/>
                                  </button>
                                  <button onClick={() => { setSelectedEvalId(ev.id); setModalType('confirm_delete_eval'); setModalMessage('Deseja excluir permanentemente esta avaliação?'); }} className="p-2.5 bg-gray-50 text-red-600 rounded-xl hover:bg-red-50 transition-all shadow-sm" title="Excluir Avaliação">
                                      <Trash2 size={16}/>
                                  </button>
                                  <button onClick={() => navigate(`/athletes/${id}/eval-view/${ev.id}`)} className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all shadow-sm"><Eye size={16}/> Relatório</button>
                              </div>
                          </div>
                      )) : <div className="p-24 text-center text-gray-300 text-xs font-bold uppercase tracking-widest italic">Nenhuma avaliação encontrada</div>}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL EDITAR ATLETA (PADRÃO PREMIUM) */}
      {modalType === 'edit' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-[40px] w-full max-w-4xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up border border-indigo-50">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl text-white shadow-lg bg-indigo-600">
                        <Edit size={24}/>
                    </div>
                    Editar Cadastro do Atleta
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
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
                    <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-4 overflow-hidden border-4 border-dashed border-gray-200 shadow-inner relative">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <Users size={48} className="text-gray-200" />)}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-5 py-2.5 rounded-full hover:bg-indigo-100 transition-all shadow-sm ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Processando Imagem...' : <><Upload size={14} /> Alterar Foto</>}
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

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* COLUNA ESQUERDA: IDENTIFICAÇÃO */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-indigo-50">
                            <HelpCircle size={14} className="text-indigo-400"/>
                            <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">Identificação</h4>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label>
                           <input required type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label>
                                <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.birthDate} onChange={e => setEditFormData({...editFormData, birthDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG / Identificador</label>
                                <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.rg} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label>
                                <select required className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                                    {Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label>
                                <select required className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none" value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* COLUNA DIREITA: RESPONSÁVEIS E TRANSFERÊNCIA */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-emerald-50">
                            <Target size={14} className="text-emerald-400"/>
                            <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Responsáveis</h4>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Pai/Mãe</label>
                           <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={editFormData.responsibleName} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail para Contato</label>
                           <input type="email" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsibleEmail} onChange={e => setEditFormData({...editFormData, responsibleEmail: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone WhatsApp</label>
                           <input type="tel" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={editFormData.responsiblePhone} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} />
                        </div>

                        {/* SEÇÃO DE TRANSFERÊNCIA */}
                        <div className="mt-8 pt-6 border-t border-gray-100">
                           <div className="flex justify-between items-center mb-4">
                               <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2"><ArrowRightLeft size={14}/> Transferência de Clube</h4>
                               <button type="button" onClick={() => setShowTransferField(!showTransferField)} className="text-[9px] font-black text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded hover:bg-amber-100 transition-all">
                                   {showTransferField ? 'Cancelar' : 'Transferir Atleta'}
                               </button>
                           </div>
                           {showTransferField && (
                               <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 animate-fade-in">
                                   <label className="block text-[9px] font-black text-amber-800 uppercase mb-2 ml-1">ID da Equipe de Destino (UUID)</label>
                                   <input type="text" placeholder="Ex: f47ac10b-..." className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-none" value={editFormData.pendingTransferTeamId || ''} onChange={e => setEditFormData({...editFormData, pendingTransferTeamId: e.target.value})} />
                                   <p className="text-[8px] text-amber-600 font-bold uppercase mt-2">O atleta será movido para aprovação do novo clube ao salvar.</p>
                               </div>
                           )}
                        </div>
                    </div>
                 </div>

                 <div className="flex gap-4 pt-6">
                    <button type="button" onClick={() => setModalType('confirm_delete')} className="flex-1 bg-red-50 text-red-600 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all flex items-center justify-center gap-2 border-b-4 border-red-200"><Trash2 size={16}/> Excluir Perfil</button>
                    <button type="submit" disabled={uploading || loading} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 border-b-4 border-indigo-900">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                        {loading ? 'Processando...' : 'Salvar Alterações'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-[40px] w-full max-w-sm p-10 shadow-2xl animate-slide-up text-center border border-red-50">
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 shadow-inner"><AlertCircle size={40}/></div>
                  <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tighter mb-4">Atenção Crítica!</h3>
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-10 leading-relaxed">Deseja realmente excluir o perfil de {athlete.name}? Esta ação é irreversível e removerá todo o histórico.</p>
                  <div className="flex gap-3">
                      <button onClick={() => setModalType('edit')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                      <button onClick={confirmDeleteAthlete} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all active:scale-95">Sim, Excluir</button>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete_eval' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-[40px] w-full max-w-sm p-10 shadow-2xl animate-slide-up text-center border border-red-50">
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 shadow-inner"><AlertCircle size={40}/></div>
                  <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tighter mb-4">Excluir Avaliação?</h3>
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-10 leading-relaxed">{modalMessage}</p>
                  <div className="flex gap-3">
                      <button onClick={() => { setModalType('none'); setSelectedEvalId(null); }} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                      <button onClick={confirmDeleteEvaluation} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all active:scale-95">Excluir</button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'success' || modalType === 'error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-[40px] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full text-center border border-indigo-50">
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner ${modalType === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {modalType === 'success' ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tighter">{modalType === 'success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mb-8">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className={`text-white font-black py-4 px-12 rounded-2xl transition-all w-full shadow-lg uppercase tracking-widest text-[11px] active:scale-95 ${modalType === 'success' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}>Entendido</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AthleteProfile;
