
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Users, ClipboardList, TrendingUp, Trophy, Activity, Shirt, Calendar, Loader2, Filter, ChevronDown, ChevronUp, Zap, Target } from 'lucide-react';
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

  const filteredEvalSessions = useMemo(() => {
      const now = new Date();
      return evalSessions.filter(s => {
          const athlete = athletes.find(ath => ath.id === s.athleteId);
          if (!athlete) return false;
          const sIso = s.date;
          switch (selectedPeriod) {
              case 'week': return sIso >= new Date(now.setDate(now.getDate()-7)).toISOString();
              case 'month': return sIso >= new Date(now.setDate(now.getDate()-30)).toISOString();
              case 'year': return sIso >= `${now.getFullYear()}-01-01`;
              default: return true;
          }
      });
  }, [evalSessions, athletes, selectedPeriod]);

  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const myEvals = filteredEvalSessions.filter(ev => ev.athleteId === athlete.id);
        const avgTech = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreTecnico, 0) / myEvals.length : 0;
        
        const myEntries = entries.filter(e => e.athleteId === athlete.id);
        let impactScore = 0;
        let scoutCount = 0;
        myEntries.forEach(entry => {
            try {
                const notes = JSON.parse(entry.notes || '{}');
                if (notes.avgScore !== undefined) {
                    impactScore += notes.avgScore;
                    scoutCount++;
                }
            } catch(e) {}
        });
        const avgImpact = scoutCount > 0 ? impactScore / scoutCount : 0;

        return { ...athlete, avgTech, avgImpact };
    }).sort((a, b) => b.avgTech - a.avgTech);
  }, [athletes, filteredEvalSessions, entries]);

  const rankedByTech = useMemo(() => {
      let list = athletesWithMeta;
      if (selectedCategory !== 'all') list = list.filter(a => a.categoryId === selectedCategory);
      return list.slice(0, 3);
  }, [athletesWithMeta, selectedCategory]);

  const teamAverages = useMemo(() => {
      const list = selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a=>a.categoryId===selectedCategory);
      if (list.length === 0) return { tech: 0, impact: 0 };
      const sumTech = list.reduce((a,b)=>a+b.avgTech, 0);
      const sumImpact = list.reduce((a,b)=>a+b.avgImpact, 0);
      return { tech: sumTech / list.length, impact: sumImpact / list.length };
  }, [athletesWithMeta, selectedCategory]);

  const bestXI = useMemo(() => {
    const getTopByPos = (posList: Position[]) => {
        return [...athletesWithMeta]
            .filter(a => posList.includes(a.position) && (selectedCategory === 'all' || a.categoryId === selectedCategory))
            .sort((a, b) => b.avgTech - a.avgTech)[0];
    };

    return [
        { role: 'GK', player: getTopByPos([Position.GOLEIRO]), style: { bottom: '5%', left: '50%' } }, 
        { role: 'LE', player: getTopByPos([Position.LATERAL]), style: { bottom: '22%', left: '15%' } }, 
        { role: 'ZC', player: getTopByPos([Position.ZAGUEIRO]), style: { bottom: '16%', left: '38%' } }, 
        { role: 'LD', player: getTopByPos([Position.LATERAL]), style: { bottom: '22%', left: '85%' } }, 
        { role: 'VOL', player: getTopByPos([Position.VOLANTE]), style: { bottom: '35%', left: '50%' } }, 
        { role: 'MC', player: getTopByPos([Position.MEIO_CAMPO]), style: { bottom: '50%', left: '30%' } }, 
        { role: 'AT', player: getTopByPos([Position.ATACANTE]), style: { bottom: '65%', left: '20%' } }, 
        { role: 'CA', player: getTopByPos([Position.CENTROAVANTE]), style: { bottom: '75%', left: '50%' } }, 
    ];
  }, [athletesWithMeta, selectedCategory]);

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-wrap items-end gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Filtro de Grupo</label><select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)}><option value="all">Todas Categorias</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Período de Análise</label><select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)}><option value="all">Todo o Histórico</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option><option value="year">Este Ano</option></select></div>
          <div className="flex-1"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Activity size={100} className="text-indigo-600"/></div>
              <div><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Zap size={14} className="text-yellow-500"/> Impacto em Jogo (Média)</span><p className="text-5xl font-black text-indigo-600 tracking-tighter">{teamAverages.impact.toFixed(2)}</p></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={100} className="text-emerald-600"/></div>
              <div><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1"><ClipboardList size={14} className="text-emerald-500"/> Média Técnica do Time</span><p className="text-5xl font-black text-emerald-600 tracking-tighter">{teamAverages.tech.toFixed(1)}</p></div>
          </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
         <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2"><Shirt size={18} className="text-green-600"/> Seleção Técnica (Top 1 em Nota Técnica por Posição)</h3>
         <div className="relative w-full aspect-[16/8] bg-green-600 rounded-2xl overflow-hidden border-4 border-green-800 shadow-inner">
             <div className="absolute inset-4 border-2 border-white/40 rounded-sm pointer-events-none"></div>
             <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2 pointer-events-none"></div>
             <div className="absolute top-1/2 left-1/2 w-32 h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
             {bestXI.map((pos, idx) => (
                <div key={idx} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={pos.style as React.CSSProperties}>
                   {pos.player ? (
                      <Link to={`/athletes/${pos.player.id}`} className="flex flex-col items-center group">
                          <div className="relative">{pos.player.photoUrl ? <img src={pos.player.photoUrl} className="w-12 h-12 rounded-full border-2 border-white shadow-lg object-cover bg-white" /> : <div className="w-12 h-12 rounded-full border-2 border-white shadow-lg bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500">{pos.player.name.charAt(0)}</div>}<div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">{pos.player.avgTech.toFixed(1)}</div></div>
                          <div className="mt-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-tighter">{pos.player.name.split(' ')[0]}</div>
                      </Link>
                   ) : <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/40 text-[10px] font-black">{pos.role}</div>}
                </div>
             ))}
         </div>
      </div>
      
      {/* GRID DE TODOS OS ATLETAS COM MÉDIA TÉCNICA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {athletesWithMeta.map(athlete => (
          <Link to={`/athletes/${athlete.id}`} key={athlete.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group flex flex-col items-center text-center">
              <div className="relative mb-4">
                  {athlete.photoUrl ? <img src={athlete.photoUrl} className="w-20 h-20 rounded-full object-cover border-2 border-gray-50" /> : <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center font-black text-indigo-600 text-xl">{athlete.name.charAt(0)}</div>}
                  <div className="absolute -top-2 -right-2 bg-emerald-600 text-white font-black text-[10px] px-2 py-0.5 rounded-lg shadow-md border border-white">{athlete.avgTech.toFixed(1)}</div>
              </div>
              <h4 className="font-black text-gray-800 uppercase tracking-tighter truncate w-full">{athlete.name}</h4>
              <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">{athlete.position} • {categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
