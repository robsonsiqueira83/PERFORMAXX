
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAthletes, getTrainingEntries, getTrainingSessions, getTeams, getEvaluationSessions } from '../services/storageService';
import { calculateTotalScore, TrainingEntry, Athlete, TrainingSession, getCalculatedCategory, EvaluationSession, HeatmapPoint, formatDateSafe } from '../types';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { ArrowLeft, Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Activity, Target, Zap, Filter, MousePointer2, ClipboardCheck, Info, Timer } from 'lucide-react';
import HeatmapField from '../components/HeatmapField';
import PublicHeader from '../components/PublicHeader';

const IMPACT_LEVELS = [
    { min: 0.61, label: 'Impacto Muito Alto', color: 'bg-indigo-600', text: 'text-indigo-600', border: 'border-indigo-600' },
    { min: 0.30, label: 'Impacto Positivo', color: 'bg-indigo-400', text: 'text-indigo-400', border: 'border-indigo-400' },
    { min: -0.29, label: 'Impacto Neutro', color: 'bg-gray-400', text: 'text-gray-400', border: 'border-gray-400' },
    { min: -0.60, label: 'Impacto Negativo', color: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
    { min: -Infinity, label: 'Risco Tático', color: 'bg-red-600', text: 'text-red-600', border: 'border-red-600' }
];

const getImpact = (score: number) => IMPACT_LEVELS.find(l => score >= l.min) || IMPACT_LEVELS[4];

const PublicAthleteProfile: React.FC = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [loading, setLoading] = useState(true);

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [team, setTeam] = useState<any | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [evalSessions, setEvalSessions] = useState<EvaluationSession[]>([]);

  const [activeTab, setActiveTab] = useState<'realtime' | 'snapshots'>('realtime');
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');

  useEffect(() => {
     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allEvals, allTeams] = await Promise.all([
             getAthletes(), getTrainingEntries(), getTrainingSessions(), getEvaluationSessions(athleteId), getTeams()
         ]);
         
         const foundAthlete = allAthletes.find(a => a.id === athleteId);
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setTeam(allTeams.find(t => t.id === foundAthlete.teamId) || null);
             setEntries(allEntries.filter(e => e.athleteId === athleteId));
             setSessions(allSessions);
             setEvalSessions(allEvals);
         }
         setLoading(false);
     };
     load();
  }, [athleteId]);

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
              className={`h-9 w-9 flex flex-col items-center justify-center text-[10px] rounded-lg border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-gray-500 border-gray-100 hover:border-indigo-200'}`}>
                <span className="font-black">{d}</span>
                {type && !isSelected && <div className="flex gap-0.5 mt-0.5"><div className={`w-1 h-1 rounded-full ${type === 'realtime' || type === 'both' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div></div>}
            </button>
        );
    }
    return (
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm w-full">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-2"><CalendarIcon size={12}/> Timeline Atividades</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCalendarMonth(new Date(year, month - 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400"><ChevronLeft size={16}/></button>
                    <span className="text-[10px] font-black uppercase text-gray-800">{calendarMonth.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                    <button onClick={() => setCalendarMonth(new Date(year, month + 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[8px] font-black text-gray-300 uppercase">{d}</div>)}
                {days}
            </div>
        </div>
    );
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-blue-600 bg-gray-50"><Loader2 className="animate-spin" size={40} /></div>;
  if (!athlete) return <div className="p-8 text-center font-black uppercase tracking-widest">Perfil não encontrado</div>;

  const impact = getImpact(globalStats?.avgGlobal || 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 animate-fade-in">
      <PublicHeader team={team} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 space-y-8">
        
        <Link to={`/p/team/${athlete.teamId}`} className="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
            <ArrowLeft size={16} /> Voltar para o time
        </Link>

        {/* Perfil Header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-[40px] shadow-sm border border-gray-100 p-8 flex flex-col md:flex-row items-center gap-10">
              <div className="relative">
                {athlete.photoUrl ? (
                    <img src={athlete.photoUrl} className="w-32 h-32 md:w-48 md:h-48 rounded-full object-cover border-4 border-white shadow-xl" />
                ) : (
                    <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-indigo-100 flex items-center justify-center text-6xl font-black text-indigo-600">{athlete.name.charAt(0)}</div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-center md:text-left">
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase mb-2">{athlete.name}</h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                   <span className="bg-indigo-100 text-indigo-800 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">{athlete.position}</span>
                   <span className="bg-emerald-100 text-emerald-800 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">{getCalculatedCategory(athlete.birthDate)}</span>
                   <span className="bg-gray-100 text-gray-600 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">RG: {athlete.rg.substring(0,8)}</span>
                </div>
                <div className="mt-8 grid grid-cols-2 md:grid-cols-2 gap-4 max-w-sm mx-auto md:mx-0">
                    <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Média Técnica</span>
                        <span className="text-2xl font-black text-emerald-600">{avgStructuredTech.toFixed(1)}</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                        <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Impacto Jogo</span>
                        <span className={`text-2xl font-black ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(2)}</span>
                    </div>
                </div>
              </div>
          </div>
          <div className="lg:col-span-1">{renderCalendar()}</div>
        </div>

        {/* Impact e Indicadores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-2"><Timer size={14} className="text-indigo-500"/> Impacto Semântico em Jogo</span>
                    <p className={`text-5xl font-black tracking-tighter ${impact.text}`}>{(globalStats?.avgGlobal || 0).toFixed(2)}</p>
                    <span className={`text-[10px] font-black uppercase tracking-widest mt-2 block ${impact.text}`}>{impact.label}</span>
                </div>
                <div className="h-20 w-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`w-full transition-all duration-1000 ${impact.color}`} style={{ height: `${Math.min(100, Math.max(0, ((globalStats?.avgGlobal || 0) + 1.5) / 3 * 100))}%` }}></div>
                </div>
            </div>
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-2"><ClipboardCheck size={14} className="text-emerald-500"/> Média Técnica Ponderada</span>
                    <p className="text-5xl font-black text-emerald-600 tracking-tighter">{avgStructuredTech.toFixed(1)}</p>
                    <span className={`text-[10px] font-black uppercase text-emerald-400 tracking-widest mt-2 block`}>Snapshot Estruturado</span>
                </div>
                <div className="h-20 w-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(avgStructuredTech / 5) * 100}%` }}></div>
                </div>
            </div>
        </div>

        {/* Tabs e Radares */}
        <div className="flex bg-white p-2 rounded-[24px] border border-gray-100 shadow-sm max-w-sm mx-auto">
            <button onClick={() => setActiveTab('realtime')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'realtime' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>Scout RealTime</button>
            <button onClick={() => setActiveTab('snapshots')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>Avaliações</button>
        </div>

        {activeTab === 'realtime' && (
          <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-[380px] flex flex-col">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-8 flex items-center gap-2"><Target size={16}/> Eficiência Tática</h3>
                      {globalStats ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={globalStats.radarData}>
                                  <PolarGrid stroke="#f3f4f6" />
                                  <PolarAngleAxis dataKey="phase" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 900 }} />
                                  <PolarRadiusAxis angle={30} domain={[-1.5, 1.5]} tick={false} axisLine={false} />
                                  <Radar name="Score" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.5} />
                              </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="flex-1 flex items-center justify-center text-gray-300 text-[10px] font-black uppercase italic">Sem dados táticos</div>}
                  </div>
                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-[380px] flex flex-col">
                      <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-8 flex items-center gap-2"><TrendingUp size={16}/> Dominância Técnica</h3>
                      {radarAveragesData?.tech ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.tech}>
                                <PolarGrid stroke="#f3f4f6" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 900 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="flex-1 flex items-center justify-center text-gray-300 text-[10px] font-black uppercase italic">Sem dados técnicos</div>}
                  </div>
                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-[380px] flex flex-col">
                      <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-8 flex items-center gap-2"><Activity size={16}/> Capacidade Física</h3>
                      {radarAveragesData?.phys ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarAveragesData.phys}>
                                <PolarGrid stroke="#f3f4f6" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 900 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                <Radar name="Nota" dataKey="A" stroke="#10b981" fill="#34d399" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                      ) : <div className="flex-1 flex items-center justify-center text-gray-300 text-[10px] font-black uppercase italic">Sem dados físicos</div>}
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm flex flex-col items-center">
                    <HeatmapField perspective points={aggregateHeatmapPoints} readOnly label="Mapeamento de Posicionamento e Ação" />
                </div>
                <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo de Decisões</h3><Zap size={14} className="text-indigo-400"/></div>
                    <div className="flex-1 p-6 space-y-6">
                        {impactRanking.best.length > 0 ? (
                            <>
                                <div>
                                    <span className="text-[9px] font-black text-indigo-600 uppercase mb-3 block tracking-widest">PONTOS FORTES</span>
                                    {impactRanking.best.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 rounded-2xl bg-indigo-50 border border-indigo-100 mb-2">
                                            <span className="text-[10px] font-black text-indigo-800 uppercase truncate pr-2">{a.name}</span>
                                            <span className="text-[10px] font-mono font-black text-indigo-600">+{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-dashed border-gray-100 pt-6">
                                    <span className="text-[9px] font-black text-red-500 uppercase mb-3 block tracking-widest">A MELHORAR</span>
                                    {impactRanking.worst.map((a, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 rounded-2xl bg-red-50 border border-red-100 mb-2">
                                            <span className="text-[10px] font-black text-red-800 uppercase truncate pr-2">{a.name}</span>
                                            <span className="text-[10px] font-mono font-black text-red-600">{a.avg.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : <div className="h-full flex items-center justify-center text-[10px] text-gray-300 font-black uppercase italic">Sem amostra de scout</div>}
                    </div>
                </div>
              </div>
          </div>
        )}

        {activeTab === 'snapshots' && (
          <div className="space-y-8 animate-fade-in">
              <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-3"><ClipboardCheck size={20} className="text-emerald-500"/> Histórico de Avaliações Técnicas</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                      {evalSessions.length > 0 ? evalSessions.map(ev => (
                          <div key={ev.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50 transition-all border-l-8 border-transparent hover:border-emerald-600 gap-6">
                              <div className="flex items-center gap-6">
                                  <div className="bg-emerald-100 p-5 rounded-3xl text-emerald-600 shadow-inner"><Target size={28}/></div>
                                  <div>
                                      <p className="text-xl font-black text-gray-800 uppercase tracking-tighter leading-tight">{ev.type}</p>
                                      <div className="flex flex-wrap items-center gap-4 mt-2 text-[9px] text-gray-400 font-black uppercase tracking-widest">
                                          <div className="flex items-center gap-1.5"><CalendarIcon size={14}/> {formatDateSafe(ev.date)}</div>
                                          <div className="flex items-center gap-1.5 text-indigo-600"><TrendingUp size={14}/> TÉC: {ev.scoreTecnico.toFixed(1)}</div>
                                          <div className="flex items-center gap-1.5 text-emerald-600"><Activity size={14}/> FÍS: {ev.scoreFisico.toFixed(0)}%</div>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 self-end md:self-center">
                                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1.5 rounded-full">Avaliador: {ev.evaluatorId.substring(0,8)}</span>
                              </div>
                          </div>
                      )) : <div className="p-32 text-center text-gray-300 text-[10px] font-black uppercase tracking-widest italic">Nenhuma avaliação registrada</div>}
                  </div>
              </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PublicAthleteProfile;
