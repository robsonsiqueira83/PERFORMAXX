
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeams, getAthletes, getCategories, getTrainingSessions, getTrainingEntries, getEvaluationSessions } from '../services/storageService';
import { Team, Athlete, Category, TrainingSession, TrainingEntry, Position, getCalculatedCategory, EvaluationSession } from '../types';
import PublicHeader from '../components/PublicHeader';
import { Loader2, Filter, Shirt, Trophy, Users, Target, Activity, Zap, TrendingUp, ChevronDown } from 'lucide-react';

const PublicTeamDashboard: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const [loading, setLoading] = useState(true);
  
  const [team, setTeam] = useState<Team | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');

  useEffect(() => {
    const loadData = async () => {
        if (!teamId) return;
        setLoading(true);
        const [t, a, c, e, ev] = await Promise.all([
            getTeams(),
            getAthletes(),
            getCategories(),
            getTrainingEntries(),
            getEvaluationSessions()
        ]);

        const currentTeam = t.find(item => item.id === teamId);
        setTeam(currentTeam || null);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setEntries(e);
        setEvaluations(ev);
        setLoading(false);
    };
    loadData();
  }, [teamId]);

  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const myEvals = evaluations.filter(ev => ev.athleteId === athlete.id);
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
  }, [athletes, evaluations, entries]);

  const displayAthletes = useMemo(() => {
      let list = athletesWithMeta;
      if (selectedCategory !== 'all') list = list.filter(a => a.categoryId === selectedCategory);
      if (selectedPosition !== 'all') list = list.filter(a => a.position === selectedPosition);
      return list;
  }, [athletesWithMeta, selectedCategory, selectedPosition]);

  const bestXI = useMemo(() => {
    const selectedIds = new Set<string>();
    const getTopForSlot = (positions: Position[]) => {
        const pool = athletesWithMeta
            .filter(a => positions.includes(a.position) && !selectedIds.has(a.id) && (selectedCategory === 'all' || a.categoryId === selectedCategory))
            .sort((a, b) => b.avgTech - a.avgTech);
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-darkBase text-blue-600"><Loader2 className="animate-spin" size={40} /></div>;
  if (!team) return <div className="p-10 text-center text-gray-500 font-black uppercase tracking-widest dark:bg-darkBase">Equipe não localizada</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-darkBase pb-20 animate-fade-in transition-colors duration-300">
      <PublicHeader team={team} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 space-y-8">
        
        {/* Filtros Premium */}
        <div className="bg-white dark:bg-darkCard p-6 rounded-[32px] shadow-sm border border-gray-100 dark:border-darkBorder flex flex-wrap items-end gap-6">
            <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 ml-1">Categoria de Visualização</label>
                <div className="relative">
                    <select className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 rounded-2xl p-3.5 text-xs font-black uppercase focus:ring-2 focus:ring-indigo-500 outline-none appearance-none" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                        <option value="all">Todas as Categorias</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16}/>
                </div>
            </div>
            <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 ml-1">Posição Tática</label>
                <div className="relative">
                    <select className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 rounded-2xl p-3.5 text-xs font-black uppercase focus:ring-2 focus:ring-indigo-500 outline-none appearance-none" value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)}>
                        <option value="all">Todas as Posições</option>
                        {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16}/>
                </div>
            </div>
            <div className="hidden lg:flex flex-col items-end flex-1">
                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase mb-2">Total de Atletas</span>
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{displayAthletes.length}</span>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Lista de Ranking */}
            <div className="bg-white dark:bg-darkCard rounded-[40px] shadow-sm border border-gray-100 dark:border-darkBorder overflow-hidden flex flex-col">
                <div className="p-8 border-b border-gray-50 dark:border-darkBorder flex items-center justify-between bg-gray-50/30 dark:bg-darkInput/20">
                    <h3 className="font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter text-xl flex items-center gap-3">
                        <Users className="text-indigo-600 dark:text-indigo-400"/> Ranking de Performance
                    </h3>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-darkBorder max-h-[800px] overflow-y-auto custom-scrollbar">
                    {displayAthletes.map((athlete, index) => (
                        <Link to={`/p/athlete/${athlete.id}`} key={athlete.id} className="flex items-center p-6 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all group">
                            <div className="flex-shrink-0 relative mr-6">
                                {athlete.photoUrl ? (
                                    <img src={athlete.photoUrl} className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-darkBorder shadow-md group-hover:scale-105 transition-transform" />
                                ) : (
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-darkInput rounded-full flex items-center justify-center font-black text-gray-300 dark:text-gray-700 text-xl border-2 border-white dark:border-darkBorder shadow-sm">
                                        {athlete.name.charAt(0)}
                                    </div>
                                )}
                                <div className="absolute -top-1 -left-1 w-7 h-7 bg-indigo-600 shadow-lg rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-white">
                                    #{index + 1}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter text-base truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{athlete.name}</h4>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded uppercase tracking-widest">{athlete.position}</span>
                                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{getCalculatedCategory(athlete.birthDate)}</span>
                                </div>
                            </div>
                            <div className="text-right pl-6 border-l border-gray-50 dark:border-darkBorder ml-4">
                                <span className="block text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest mb-1">Média Téc.</span>
                                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">
                                    {athlete.avgTech > 0 ? athlete.avgTech.toFixed(1) : '--'}
                                </span>
                            </div>
                        </Link>
                    ))}
                    {displayAthletes.length === 0 && (
                        <div className="p-20 text-center text-gray-300 dark:text-gray-700 font-bold uppercase tracking-widest italic text-xs">
                            Nenhum atleta localizado nestes filtros.
                        </div>
                    )}
                </div>
            </div>

            {/* Seleção do Momento */}
            <div className="bg-white dark:bg-darkCard rounded-[40px] shadow-sm border border-gray-100 dark:border-darkBorder p-8 flex flex-col">
                <h3 className="font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter text-xl flex items-center gap-3 mb-8">
                    <Shirt className="text-emerald-600 dark:text-emerald-400"/> Seleção Técnica (4-3-3)
                </h3>

                <div className="relative w-full aspect-[16/9] bg-green-600 rounded-[32px] overflow-hidden border-4 border-green-800 shadow-inner">
                    <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.2) 50%)', backgroundSize: '10% 100%'}}></div>
                    <div className="absolute inset-4 border-2 border-white/40 rounded-sm pointer-events-none"></div>
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 w-32 h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    
                    {bestXI.map((pos, idx) => (
                        <div key={idx} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={pos.style as React.CSSProperties}>
                        {pos.player ? (
                            <Link to={`/p/athlete/${pos.player.id}`} className="flex flex-col items-center group">
                                <div className="relative">
                                    {pos.player.photoUrl ? (
                                        <img src={pos.player.photoUrl} className="w-12 h-12 rounded-full border-2 border-white shadow-lg object-cover bg-white group-hover:scale-110 transition-transform" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full border-2 border-white shadow-lg bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500">
                                            {pos.player.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">
                                        {pos.player.avgTech.toFixed(1)}
                                    </div>
                                </div>
                                <div className="mt-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-tighter">{pos.player.name.split(' ')[0]}</div>
                            </Link>
                        ) : (
                            <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/40 text-[10px] font-black">
                                {pos.role}
                            </div>
                        )}
                        </div>
                    ))}
                </div>
                <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-800 flex items-center gap-3">
                    <Trophy size={20} className="text-emerald-600 dark:text-emerald-400" />
                    <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-black uppercase tracking-widest leading-relaxed">Os atletas acima foram escalados automaticamente com base na maior média técnica recente registrada pela comissão.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PublicTeamDashboard;
