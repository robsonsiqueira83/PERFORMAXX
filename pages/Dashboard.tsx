
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Users, ClipboardList, TrendingUp, Trophy, Activity, Shirt, Calendar, Loader2, Filter, ChevronDown, ChevronUp, Zap, Target, Info, Timer } from 'lucide-react';
import { 
  getAthletes, getCategories, getTrainingEntries, getTrainingSessions, getEvaluationSessions
} from '../services/storageService';
import { Position, Athlete, Category, TrainingSession, TrainingEntry, getCalculatedCategory, User, canEditData, EvaluationSession, formatDateSafe } from '../types';

interface DashboardProps {
  teamId: string;
}

const Dashboard: React.FC<DashboardProps> = ({ teamId }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [evalSessions, setEvalSessions] = useState<EvaluationSession[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));

    const loadData = async () => {
        setLoading(true);
        const [a, c, s, e, ev] = await Promise.all([
            getAthletes(), getCategories(), getTrainingSessions(), getTrainingEntries(), getEvaluationSessions()
        ]);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setSessions(s.filter(item => item.teamId === teamId));
        setEntries(e);
        setEvalSessions(ev);
        setLoading(false);
    };
    loadData();
  }, [teamId]);

  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const myEvals = evalSessions.filter(ev => ev.athleteId === athlete.id);
        const avgTech = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreTecnico, 0) / myEvals.length : 0;
        const avgPhys = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreFisico, 0) / myEvals.length : 0;
        
        // CÁLCULO SMC (SCORE MÉDIO DE CAPACIDADE)
        const mt_norm = (avgTech / 5.0) * 10;
        const cf_norm = avgPhys / 10;
        const smc = (mt_norm * 0.55) + (cf_norm * 0.45);

        return { 
            ...athlete, 
            avgTech, 
            avgPhys,
            globalScore: smc,
            eventCount: myEvals.length 
        };
    }).sort((a, b) => b.globalScore - a.globalScore);
  }, [athletes, evalSessions]);

  const getSMCReading = (val: number) => {
      if (val <= 3.0) return "Capacidade insuficiente";
      if (val <= 5.0) return "Em desenvolvimento";
      if (val <= 6.5) return "Funcional para composição";
      if (val <= 8.0) return "Boa prontidão competitiva";
      return "Alta prontidão para jogos";
  };

  const rankedByScore = useMemo(() => {
      let list = athletesWithMeta;
      if (selectedCategory !== 'all') list = list.filter(a => a.categoryId === selectedCategory);
      return list.slice(0, 3);
  }, [athletesWithMeta, selectedCategory]);

  const teamAverages = useMemo(() => {
      const list = selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a=>a.categoryId===selectedCategory);
      if (list.length === 0) return { tech: 0, score: 0, tactical: 0 };
      
      const sumTech = list.reduce((a,b)=>a+b.avgTech, 0);
      const sumScore = list.reduce((a,b)=>a+b.globalScore, 0);
      
      // Cálculo do Impacto Tático Médio (Scout RealTime)
      let totalTactical = 0;
      let tacticalCount = 0;
      list.forEach(ath => {
          const athEntries = entries.filter(e => e.athleteId === ath.id);
          athEntries.forEach(entry => {
              try {
                  const notes = JSON.parse(entry.notes || '{}');
                  if (notes.avgScore !== undefined) {
                      totalTactical += notes.avgScore;
                      tacticalCount++;
                  }
              } catch(e) {}
          });
      });
      const avgTactical = tacticalCount > 0 ? totalTactical / tacticalCount : 0;

      return { 
          tech: sumTech / list.length, 
          score: sumScore / list.length,
          tactical: avgTactical
      };
  }, [athletesWithMeta, selectedCategory, entries]);

  const bestXI = useMemo(() => {
    const selectedIds = new Set<string>();
    const getTopForSlot = (positions: Position[]) => {
        const pool = athletesWithMeta
            .filter(a => positions.includes(a.position) && !selectedIds.has(a.id) && (selectedCategory === 'all' || a.categoryId === selectedCategory))
            .sort((a, b) => b.globalScore - a.globalScore);
        if (pool.length > 0) {
            selectedIds.add(pool[0].id);
            return pool[0];
        }
        return null;
    };

    return [
        { role: 'GK', player: getTopForSlot([Position.GOLEIRO]), style: { bottom: '5%', left: '50%' } }, 
        { role: 'LE', player: getTopForSlot([Position.LATERAL]), style: { bottom: '22%', left: '15%' } }, 
        { role: 'ZC', player: getTopForSlot([Position.ZAGUEIRO]), style: { bottom: '18%', left: '38%' } }, 
        { role: 'ZC', player: getTopForSlot([Position.ZAGUEIRO]), style: { bottom: '18%', left: '62%' } }, 
        { role: 'LD', player: getTopForSlot([Position.LATERAL]), style: { bottom: '22%', left: '85%' } }, 
        { role: 'MC', player: getTopForSlot([Position.MEIO_CAMPO, Position.VOLANTE]), style: { bottom: '45%', left: '30%' } }, 
        { role: 'VOL', player: getTopForSlot([Position.VOLANTE, Position.MEIO_CAMPO]), style: { bottom: '38%', left: '50%' } }, 
        { role: 'MC', player: getTopForSlot([Position.MEIO_CAMPO, Position.VOLANTE]), style: { bottom: '45%', left: '70%' } }, 
        { role: 'AT', player: getTopForSlot([Position.ATACANTE]), style: { bottom: '70%', left: '20%' } }, 
        { role: 'CA', player: getTopForSlot([Position.CENTROAVANTE, Position.ATACANTE]), style: { bottom: '78%', left: '50%' } }, 
        { role: 'AT', player: getTopForSlot([Position.ATACANTE]), style: { bottom: '70%', left: '80%' } }, 
    ];
  }, [athletesWithMeta, selectedCategory]);

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8 pb-10 transition-colors duration-300">
      <div className="flex flex-wrap items-end gap-4 bg-white dark:bg-darkCard p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-darkBorder">
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Filtro de Grupo</label><select className="bg-gray-50 dark:bg-darkInput dark:text-gray-300 dark:border-darkBorder border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)}><option value="all">Todas Categorias</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Período de Análise</label><select className="bg-gray-50 dark:bg-darkInput dark:text-gray-300 dark:border-darkBorder border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)}><option value="all">Todo o Histórico</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option><option value="year">Este Ano</option></select></div>
          <div className="flex-1"></div>
          {currentUser && canEditData(currentUser.role) && <Link to="/training" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2"><ClipboardList size={16}/> Nova Avaliação</Link>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Zap size={100} className="text-indigo-600 dark:text-indigo-400"/></div>
              <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-indigo-500"/> SMC Médio do Time</span>
                  <p className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{teamAverages.score.toFixed(1)}</p>
                  <div className="flex flex-col mt-1">
                      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Score Médio de Capacidade</span>
                      <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: 0 a 10 (Ponderado Téc/Fís)</span>
                  </div>
              </div>
          </div>
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={100} className="text-emerald-600 dark:text-emerald-400"/></div>
              <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><ClipboardList size={14} className="text-emerald-500"/> Média Técnica do Time</span>
                  <p className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{teamAverages.tech.toFixed(1)}</p>
                  <div className="flex flex-col mt-1">
                      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Domínio de Fundamentos</span>
                      <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: 1 a 5 (Avaliações Controladas)</span>
                  </div>
              </div>
          </div>
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Timer size={100} className="text-blue-600 dark:text-blue-400"/></div>
              <div>
                  <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-blue-500"/> Impacto Tático Médio</span>
                  <p className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">{teamAverages.tactical.toFixed(2)}</p>
                  <div className="flex flex-col mt-1">
                      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Eficiência em Partidas</span>
                      <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: Índice de Impacto (Scout RealTime)</span>
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {rankedByScore.map((athlete, index) => (
             <div key={athlete.id} className="bg-white dark:bg-darkCard rounded-[32px] shadow-sm p-6 border border-gray-100 dark:border-darkBorder flex flex-col relative overflow-hidden group transition-all hover:shadow-md">
                 <div className="flex items-center gap-4 mb-6">
                     <div className="relative">
                        {athlete.photoUrl ? <img src={athlete.photoUrl} className="w-16 h-16 rounded-full object-cover border-2 border-white dark:border-darkBorder shadow-md" /> : <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-darkInput flex items-center justify-center font-black text-gray-300 dark:text-gray-600 text-xl border border-gray-100 dark:border-darkBorder">{athlete.name.charAt(0)}</div>}
                        <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] border ${index===0?'bg-yellow-400 border-yellow-500 text-yellow-900':'bg-gray-100 dark:bg-darkInput border-gray-200 dark:border-darkBorder text-gray-600 dark:text-gray-400'}`}>#{index+1}</div>
                     </div>
                     <div className="min-w-0"><h3 className="font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter truncate text-sm leading-tight">{athlete.name}</h3><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{athlete.position}</p></div>
                 </div>
                 
                 <div className="bg-gray-50 dark:bg-darkInput/50 rounded-2xl p-4 text-center border border-gray-100 dark:border-darkBorder">
                     <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-1 block">Score SMC</span>
                     <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{athlete.globalScore.toFixed(1)}</span>
                     <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 mt-2 leading-tight uppercase tracking-widest">{getSMCReading(athlete.globalScore)}</p>
                 </div>

                 <div className="mt-6 flex justify-end">
                     <Link to={`/athletes/${athlete.id}`} className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1.5"><Activity size={12}/> Perfil</Link>
                 </div>
             </div>
         ))}
      </div>

      <div className="bg-white dark:bg-darkCard p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder overflow-hidden">
         <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest mb-6 flex items-center gap-2"><Shirt size={18} className="text-green-600 dark:text-green-400"/> Seleção Prontidão SMC (4-3-3)</h3>
         <div className="relative w-full aspect-[16/9] bg-green-600 rounded-2xl overflow-hidden border-4 border-green-800 shadow-inner">
             <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.2) 50%)', backgroundSize: '10% 100%'}}></div>
             <div className="absolute inset-4 border-2 border-white/40 rounded-sm pointer-events-none"></div>
             <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2 pointer-events-none"></div>
             <div className="absolute top-1/2 left-1/2 w-32 h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
             {bestXI.map((pos, idx) => (
                <div key={idx} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={pos.style as React.CSSProperties}>
                   {pos.player ? (
                      <Link to={`/athletes/${pos.player.id}`} className="flex flex-col items-center group">
                          <div className="relative">
                            {pos.player.photoUrl ? <img src={pos.player.photoUrl} className="w-12 h-12 rounded-full border-2 border-white shadow-lg object-cover bg-white" /> : <div className="w-12 h-12 rounded-full border-2 border-white shadow-lg bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500">{pos.player.name.charAt(0)}</div>}
                            <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">{pos.player.globalScore.toFixed(1)}</div>
                          </div>
                          <div className="mt-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-tighter">{pos.player.name.split(' ')[0]}</div>
                      </Link>
                   ) : <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/40 text-[10px] font-black">{pos.role}</div>}
                </div>
             ))}
         </div>
      </div>
    </div>
  );
};

export default Dashboard;
