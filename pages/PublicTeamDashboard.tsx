
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeams, getAthletes, getCategories, getTrainingSessions, getTrainingEntries, getEvaluationSessions } from '../services/storageService';
import { Team, Athlete, Category, TrainingSession, TrainingEntry, Position, getCalculatedCategory, EvaluationSession } from '../types';
import PublicHeader from '../components/PublicHeader';
import { Loader2, Filter, Shirt, Trophy, Users, Target, Activity, Zap, TrendingUp, ChevronDown, BarChart3, Scale, Layers, Info, Timer, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from 'recharts';

const PublicTeamDashboard: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const [loading, setLoading] = useState(true);
  
  const [team, setTeam] = useState<Team | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [bestXICriteria, setBestXICriteria] = useState<'smc' | 'tech' | 'tactical'>('smc');

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
        const avgPhys = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreFisico, 0) / myEvals.length : 0;
        
        // Cálculo Impacto Tático Individual (Scout)
        const myEntries = entries.filter(e => e.athleteId === athlete.id);
        let totalTactical = 0;
        let tacticalCount = 0;
        myEntries.forEach(entry => {
            try {
                const notes = JSON.parse(entry.notes || '{}');
                if (notes.avgScore !== undefined) {
                    totalTactical += notes.avgScore;
                    tacticalCount++;
                }
            } catch(e) {}
        });
        const avgTactical = tacticalCount > 0 ? totalTactical / tacticalCount : 0;

        // CÁLCULO SMC (SCORE MÉDIO DE CAPACIDADE)
        const mt_norm = (avgTech / 5.0) * 10;
        const cf_norm = avgPhys / 10;
        const smc = (mt_norm * 0.55) + (cf_norm * 0.45);

        return { 
            ...athlete, 
            avgTech, 
            avgPhys, // 0-100
            avgTactical, // Raw tactical score
            techNorm: mt_norm, // 0-10
            physNorm: cf_norm, // 0-10
            globalScore: smc,
            eventCount: myEvals.length 
        };
    }).sort((a, b) => b.globalScore - a.globalScore);
  }, [athletes, evaluations, entries]);

  // --- ESTATÍSTICAS GERAIS (Espelhando Dashboard Interno) ---
  const teamOverviewStats = useMemo(() => {
      let list = selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a => a.categoryId === selectedCategory);
      const validAthletes = list.filter(a => a.eventCount > 0);

      const avgSMC = validAthletes.length > 0 
          ? validAthletes.reduce((acc, curr) => acc + curr.globalScore, 0) / validAthletes.length 
          : 0;

      const distribution = [
          { name: 'Em desenv.', range: '< 5.00', count: validAthletes.filter(a => a.globalScore < 5).length, color: '#94a3b8' },
          { name: 'Funcional', range: '5.00 - 6.50', count: validAthletes.filter(a => a.globalScore >= 5 && a.globalScore < 6.5).length, color: '#64748b' },
          { name: 'Boa', range: '6.50 - 8.00', count: validAthletes.filter(a => a.globalScore >= 6.5 && a.globalScore < 8).length, color: '#475569' },
          { name: 'Alta', range: '> 8.00', count: validAthletes.filter(a => a.globalScore >= 8).length, color: '#1e293b' }
      ];

      const avgTechNorm = validAthletes.length > 0 ? validAthletes.reduce((a,b) => a + b.techNorm, 0) / validAthletes.length : 0;
      const avgPhysNorm = validAthletes.length > 0 ? validAthletes.reduce((a,b) => a + b.physNorm, 0) / validAthletes.length : 0;
      const balanceData = [
          { name: 'Técnica', value: avgTechNorm, full: 10, fill: '#3b82f6' },
          { name: 'Física', value: avgPhysNorm, full: 10, fill: '#10b981' }
      ];

      const sectors = {
          'Defesa': [Position.GOLEIRO, Position.ZAGUEIRO, Position.LATERAL],
          'Meio': [Position.VOLANTE, Position.MEIO_CAMPO],
          'Ataque': [Position.ATACANTE, Position.CENTROAVANTE]
      };
      const sectorData = Object.entries(sectors).map(([name, positions]) => {
          const sectorAthletes = validAthletes.filter(a => positions.includes(a.position));
          const score = sectorAthletes.length > 0 
              ? sectorAthletes.reduce((a,b) => a + b.globalScore, 0) / sectorAthletes.length 
              : 0;
          return { name, score, count: sectorAthletes.length };
      });

      const scores = validAthletes.map(a => a.globalScore);
      const consistency = {
          min: scores.length > 0 ? Math.min(...scores) : 0,
          avg: avgSMC,
          max: scores.length > 0 ? Math.max(...scores) : 0
      };

      return { avgSMC, distribution, balanceData, sectorData, consistency, validCount: validAthletes.length };
  }, [athletesWithMeta, selectedCategory]);

  const getSMCReading = (val: number) => {
      if (val <= 3.0) return "Capacidade insuficiente";
      if (val <= 5.0) return "Em desenvolvimento";
      if (val <= 6.5) return "Funcional para composição";
      if (val <= 8.0) return "Boa prontidão competitiva";
      return "Alta prontidão para jogos";
  };

  const teamAverages = useMemo(() => {
      const list = selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a=>a.categoryId===selectedCategory);
      if (list.length === 0) return { tech: 0, score: 0, tactical: 0 };
      
      const sumTech = list.reduce((a,b)=>a+b.avgTech, 0);
      const sumScore = list.reduce((a,b)=>a+b.globalScore, 0);
      const sumTactical = list.reduce((a,b)=>a+b.avgTactical, 0);

      return { 
          tech: sumTech / list.length, 
          score: sumScore / list.length,
          tactical: sumTactical / list.length
      };
  }, [athletesWithMeta, selectedCategory]);

  const bestXI = useMemo(() => {
    const selectedIds = new Set<string>();
    const getTopForSlot = (positions: Position[]) => {
        const pool = athletesWithMeta
            .filter(a => positions.includes(a.position) && !selectedIds.has(a.id) && (selectedCategory === 'all' || a.categoryId === selectedCategory))
            .sort((a, b) => {
                if (bestXICriteria === 'tech') return b.avgTech - a.avgTech;
                if (bestXICriteria === 'tactical') return b.avgTactical - a.avgTactical;
                return b.globalScore - a.globalScore;
            });
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
  }, [athletesWithMeta, selectedCategory, bestXICriteria]);

  const getCriterionLabel = (c: string) => {
      if (c === 'tech') return 'Média Técnica';
      if (c === 'tactical') return 'Impacto Tático';
      return 'Score SMC';
  };

  const getPlayerScoreForDisplay = (p: any) => {
      if (bestXICriteria === 'tech') return p.avgTech.toFixed(2);
      if (bestXICriteria === 'tactical') return p.avgTactical.toFixed(2);
      return p.globalScore.toFixed(2);
  };

  const filteredAthletesList = useMemo(() => {
      return selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a => a.categoryId === selectedCategory);
  }, [athletesWithMeta, selectedCategory]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-darkBase text-blue-600"><Loader2 className="animate-spin" size={40} /></div>;
  if (!team) return <div className="p-10 text-center text-gray-500 font-black uppercase tracking-widest dark:bg-darkBase">Equipe não localizada</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-darkBase pb-20 animate-fade-in transition-colors duration-300">
      <PublicHeader team={team} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 space-y-8">
        
        {/* Filtros */}
        <div className="bg-white dark:bg-darkCard p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-darkBorder flex items-center gap-4">
            <Filter size={16} className="text-gray-400"/>
            <div className="relative flex-1 max-w-xs">
                <select className="w-full bg-gray-50 dark:bg-darkInput border-none rounded-xl py-2 px-4 text-xs font-black uppercase text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                    <option value="all">Todas as Categorias</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14}/>
            </div>
        </div>

        {/* BLOCO VISÃO GERAL (Igual ao Dashboard Interno) */}
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
                <BarChart3 className="text-gray-400 dark:text-gray-500" size={18} />
                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Visão Geral da Equipe</h3>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Resumo de Performance Pública</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card 1: Prontidão Média */}
                <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                    <div className="flex justify-between items-start">
                        <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Prontidão Média</span>
                        <Activity size={14} className="text-indigo-500" />
                    </div>
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-5xl font-black text-gray-800 dark:text-gray-100 tracking-tighter">{teamOverviewStats.avgSMC.toFixed(2)}</span>
                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">{getSMCReading(teamOverviewStats.avgSMC)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-darkInput rounded-full mt-2 relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 left-0 bg-indigo-600 transition-all duration-1000" style={{ width: `${teamOverviewStats.avgSMC * 10}%` }}></div>
                    </div>
                </div>

                {/* Card 2: Distribuição */}
                <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Distribuição do Elenco</span>
                        <Users size={14} className="text-gray-400" />
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={teamOverviewStats.distribution} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                            <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 800 }} axisLine={false} tickLine={false} interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '10px' }} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={25}>
                                {teamOverviewStats.distribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Card 3: Consistência */}
                <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                    <div className="flex justify-between items-start">
                        <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Consistência do Elenco</span>
                        <Target size={14} className="text-gray-400" />
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-6">
                        <div className="relative h-4 bg-gray-100 dark:bg-darkInput rounded-full w-full">
                            <div className="absolute top-0 bottom-0 bg-indigo-200 dark:bg-indigo-900/40 rounded-full" style={{ left: `${teamOverviewStats.consistency.min * 10}%`, width: `${(teamOverviewStats.consistency.max - teamOverviewStats.consistency.min) * 10}%` }}></div>
                            <div className="absolute top-1/2 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white dark:border-darkCard transform -translate-y-1/2 -translate-x-1/2 shadow-sm z-10" style={{ left: `${teamOverviewStats.consistency.avg * 10}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 dark:text-gray-400">
                            <div className="text-center"><span className="block text-[8px] text-gray-300 dark:text-gray-600">Mín</span>{teamOverviewStats.consistency.min.toFixed(2)}</div>
                            <div className="text-center"><span className="block text-[8px] text-gray-300 dark:text-gray-600">Média</span><span className="text-indigo-600 dark:text-indigo-400">{teamOverviewStats.consistency.avg.toFixed(2)}</span></div>
                            <div className="text-center"><span className="block text-[8px] text-gray-300 dark:text-gray-600">Máx</span>{teamOverviewStats.consistency.max.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* AREA PRINCIPAL: CAMPO + LISTA DE ATLETAS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CAMPO - SELEÇÃO IDEAL */}
            <div className="lg:col-span-2 bg-white dark:bg-darkCard p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder overflow-hidden h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest flex items-center gap-2"><Shirt size={18} className="text-green-600 dark:text-green-400"/> Seleção Ideal (4-3-3)</h3>
                    <div className="relative">
                        <select 
                            value={bestXICriteria} 
                            onChange={e => setBestXICriteria(e.target.value as any)} 
                            className="pl-3 pr-8 py-1.5 bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder rounded-xl text-[10px] font-black uppercase text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                        >
                            <option value="smc">Por SMC (Geral)</option>
                            <option value="tech">Por Média Técnica</option>
                            <option value="tactical">Por Impacto Tático</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>
                </div>
                <div className="relative w-full aspect-[16/11] bg-green-600 rounded-2xl overflow-hidden border-4 border-green-800 shadow-inner">
                    <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.2) 50%)', backgroundSize: '10% 100%'}}></div>
                    <div className="absolute inset-4 border-2 border-white/40 rounded-sm pointer-events-none"></div>
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2 pointer-events-none"></div>
                    <div className="absolute top-1/2 left-1/2 w-32 h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                    
                    {/* Áreas Superior (Ataque) */}
                    <div className="absolute top-4 left-1/2 w-1/2 h-1/6 border-2 border-white/40 border-t-0 transform -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute top-4 left-1/2 w-1/4 h-1/12 border-2 border-white/40 border-t-0 transform -translate-x-1/2 pointer-events-none"></div>

                    {/* Áreas Inferior (Defesa) */}
                    <div className="absolute bottom-4 left-1/2 w-1/2 h-1/6 border-2 border-white/40 border-b-0 transform -translate-x-1/2 pointer-events-none"></div>
                    <div className="absolute bottom-4 left-1/2 w-1/4 h-1/12 border-2 border-white/40 border-b-0 transform -translate-x-1/2 pointer-events-none"></div>

                    {bestXI.map((pos, idx) => (
                        <div key={idx} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={pos.style as React.CSSProperties}>
                            {pos.player ? (
                                <Link to={`/p/athlete/${pos.player.id}`} className="flex flex-col items-center group">
                                    <div className="relative">
                                        {pos.player.photoUrl ? <img src={pos.player.photoUrl} className="w-12 h-12 rounded-full border-2 border-white shadow-lg object-cover bg-white group-hover:scale-110 transition-transform" /> : <div className="w-12 h-12 rounded-full border-2 border-white shadow-lg bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500">{pos.player.name.charAt(0)}</div>}
                                        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">
                                            {getPlayerScoreForDisplay(pos.player)}
                                        </div>
                                    </div>
                                    <div className="mt-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-tighter">{pos.player.name.split(' ')[0]}</div>
                                </Link>
                            ) : (
                                <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/40 text-[10px] font-black">{pos.role}</div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex justify-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Info size={12}/> Critério Ativo: <span className="text-indigo-600 dark:text-indigo-400 ml-1">{getCriterionLabel(bestXICriteria)}</span>
                    </span>
                </div>
            </div>

            {/* LISTA DE ATLETAS (NOVO BLOCO) */}
            <div className="bg-white dark:bg-darkCard p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder flex flex-col h-[600px]">
                <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Users size={18} className="text-indigo-500"/> Elenco
                </h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {filteredAthletesList.length > 0 ? filteredAthletesList.map(athlete => (
                        <Link to={`/p/athlete/${athlete.id}`} key={athlete.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-darkInput/50 transition-all border border-transparent hover:border-gray-100 dark:hover:border-darkBorder group">
                            {athlete.photoUrl ? (
                                <img src={athlete.photoUrl} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-darkBorder shadow-sm" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-darkInput flex items-center justify-center text-xs font-black text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-darkBorder">{athlete.name.charAt(0)}</div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h4 className="text-[11px] font-black text-gray-800 dark:text-gray-200 uppercase truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{athlete.name}</h4>
                                <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{athlete.position}</p>
                            </div>
                            <div className="text-right">
                                <span className="block text-xs font-black text-indigo-600 dark:text-indigo-400">{athlete.globalScore.toFixed(2)}</span>
                                <span className="text-[8px] font-bold text-gray-300 dark:text-gray-600 uppercase">SMC</span>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                    )) : (
                        <div className="flex items-center justify-center h-full text-[10px] text-gray-400 dark:text-gray-600 font-bold uppercase tracking-widest text-center italic">
                            Nenhum atleta nesta categoria
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* KPIs FINAIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
                <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Zap size={100} className="text-indigo-600 dark:text-indigo-400"/></div>
                <div>
                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-indigo-500"/> SMC Médio do Time</span>
                    <p className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{teamAverages.score.toFixed(2)}</p>
                    <div className="flex flex-col mt-1">
                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Score Médio</span>
                        <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: 0.00 a 10.00</span>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
                <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={100} className="text-emerald-600 dark:text-emerald-400"/></div>
                <div>
                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Target size={14} className="text-emerald-500"/> Média Técnica do Time</span>
                    <p className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{teamAverages.tech.toFixed(2)}</p>
                    <div className="flex flex-col mt-1">
                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Fundamentos</span>
                        <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: 1.00 a 5.00</span>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
                <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Timer size={100} className="text-blue-600 dark:text-blue-400"/></div>
                <div>
                    <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-blue-500"/> Impacto Tático Médio</span>
                    <p className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">{teamAverages.tactical.toFixed(2)}</p>
                    <div className="flex flex-col mt-1">
                        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Eficiência</span>
                        <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Ref: Índice de Impacto</span>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default PublicTeamDashboard;
