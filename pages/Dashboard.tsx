
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine, Cell, ComposedChart
} from 'recharts';
import { Users, ClipboardList, TrendingUp, Trophy, Activity, Shirt, Calendar, Loader2, Filter, ChevronDown, ChevronUp, Zap, Target, Info, Timer, BarChart3, Layers, Scale } from 'lucide-react';
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
  const [bestXICriteria, setBestXICriteria] = useState<'smc' | 'tech' | 'tactical'>('smc'); // Novo estado para filtro do campo
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
  }, [athletes, evalSessions, entries]);

  // --- NOVOS DADOS PARA O BLOCO "VISÃO GERAL DA EQUIPE" ---
  const teamOverviewStats = useMemo(() => {
      // Filtrar apenas atletas válidos para o contexto selecionado e com dados
      let list = selectedCategory === 'all' ? athletesWithMeta : athletesWithMeta.filter(a => a.categoryId === selectedCategory);
      const validAthletes = list.filter(a => a.eventCount > 0);

      // Card 1: Prontidão Média
      const avgSMC = validAthletes.length > 0 
          ? validAthletes.reduce((acc, curr) => acc + curr.globalScore, 0) / validAthletes.length 
          : 0;

      // Card 2: Distribuição
      const distribution = [
          { name: 'Em desenv.', range: '< 5.0', count: validAthletes.filter(a => a.globalScore < 5).length, color: '#94a3b8' },
          { name: 'Funcional', range: '5.0 - 6.5', count: validAthletes.filter(a => a.globalScore >= 5 && a.globalScore < 6.5).length, color: '#64748b' },
          { name: 'Boa', range: '6.5 - 8.0', count: validAthletes.filter(a => a.globalScore >= 6.5 && a.globalScore < 8).length, color: '#475569' },
          { name: 'Alta', range: '> 8.0', count: validAthletes.filter(a => a.globalScore >= 8).length, color: '#1e293b' }
      ];

      // Card 3: Equilíbrio Técnico vs Físico (Médias Normalizadas 0-10)
      const avgTechNorm = validAthletes.length > 0 ? validAthletes.reduce((a,b) => a + b.techNorm, 0) / validAthletes.length : 0;
      const avgPhysNorm = validAthletes.length > 0 ? validAthletes.reduce((a,b) => a + b.physNorm, 0) / validAthletes.length : 0;
      const balanceData = [
          { name: 'Técnica', value: avgTechNorm, full: 10, fill: '#3b82f6' }, // Blue-500
          { name: 'Física', value: avgPhysNorm, full: 10, fill: '#10b981' }   // Emerald-500
      ];

      // Card 4: Prontidão por Setor
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

      // Card 5: Consistência (Min/Avg/Max)
      const scores = validAthletes.map(a => a.globalScore);
      const consistency = {
          min: scores.length > 0 ? Math.min(...scores) : 0,
          avg: avgSMC,
          max: scores.length > 0 ? Math.max(...scores) : 0
      };

      // Card 6: Evolução Coletiva
      // Agrupar avaliações por data (para o grupo filtrado)
      const sessionsMap = new Map<string, { t: number, p: number, c: number }>();
      
      // Filtrar sessions relevantes
      const relevantAthleteIds = list.map(a => a.id);
      const relevantSessions = evalSessions.filter(s => relevantAthleteIds.includes(s.athleteId));

      relevantSessions.forEach(s => {
          const d = s.date.split('T')[0];
          if (!sessionsMap.has(d)) sessionsMap.set(d, { t:0, p:0, c:0 });
          const curr = sessionsMap.get(d)!;
          curr.t += (s.scoreTecnico / 5.0) * 10;
          curr.p += s.scoreFisico / 10;
          curr.c += 1;
      });

      const evolutionData = Array.from(sessionsMap.entries())
          .map(([date, data]) => {
              const mt = data.t / data.c;
              const pf = data.p / data.c;
              const smc = (mt * 0.55) + (pf * 0.45);
              return { date, smc };
          })
          .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-8); // Últimas 8 datas

      return { avgSMC, distribution, balanceData, sectorData, consistency, evolutionData, validCount: validAthletes.length };
  }, [athletesWithMeta, selectedCategory, evalSessions]);

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
                return b.globalScore - a.globalScore; // Default SMC
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
      if (bestXICriteria === 'tech') return p.avgTech.toFixed(1);
      if (bestXICriteria === 'tactical') return p.avgTactical.toFixed(2);
      return p.globalScore.toFixed(1);
  };

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8 pb-10 transition-colors duration-300">
      <div className="flex flex-wrap items-end gap-4 bg-white dark:bg-darkCard p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-darkBorder">
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Filtro de Grupo</label><select className="bg-gray-50 dark:bg-darkInput dark:text-gray-300 dark:border-darkBorder border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)}><option value="all">Todas Categorias</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Período de Análise</label><select className="bg-gray-50 dark:bg-darkInput dark:text-gray-300 dark:border-darkBorder border border-gray-200 text-gray-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none min-w-[160px]" value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)}><option value="all">Todo o Histórico</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option><option value="year">Este Ano</option></select></div>
          <div className="flex-1"></div>
          {currentUser && canEditData(currentUser.role) && <Link to="/training" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2"><ClipboardList size={16}/> Nova Avaliação</Link>}
      </div>

      {/* BLOCO VISÃO GERAL DA EQUIPE */}
      <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
              <BarChart3 className="text-gray-400 dark:text-gray-500" size={18} />
              <div>
                  <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Visão Geral da Equipe</h3>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Resumo coletivo de prontidão técnica e física</p>
              </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card 1: Prontidão Média */}
              <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                  <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Prontidão Média da Equipe</span>
                      <Activity size={14} className="text-indigo-500" />
                  </div>
                  <div className="flex flex-col items-center justify-center flex-1">
                      <span className="text-5xl font-black text-gray-800 dark:text-gray-100 tracking-tighter">{teamOverviewStats.avgSMC.toFixed(1)}</span>
                      <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">{getSMCReading(teamOverviewStats.avgSMC)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-darkInput rounded-full mt-2 relative overflow-hidden">
                      <div className="absolute top-0 bottom-0 left-0 bg-indigo-600 transition-all duration-1000" style={{ width: `${teamOverviewStats.avgSMC * 10}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[8px] font-black text-gray-300 dark:text-gray-600 mt-1 uppercase">
                      <span>0</span><span>10</span>
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

              {/* Card 3: Equilíbrio Técnico-Físico */}
              <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                  <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Equilíbrio Téc-Físico</span>
                      <Scale size={14} className="text-blue-500" />
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamOverviewStats.balanceData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }} barSize={15}>
                          <XAxis type="number" domain={[0, 10]} hide />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 800 }} axisLine={false} tickLine={false} width={50} />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '10px' }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {teamOverviewStats.balanceData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                          </Bar>
                          <ReferenceLine x={5} stroke="#cbd5e1" strokeDasharray="3 3" />
                      </BarChart>
                  </ResponsiveContainer>
                  <div className="text-[8px] text-center text-gray-400 dark:text-gray-600 font-bold uppercase tracking-widest mt-2">Médias Normalizadas (0-10)</div>
              </div>

              {/* Card 4: Prontidão por Setor */}
              <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                  <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">SMC por Setor</span>
                      <Layers size={14} className="text-gray-400" />
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamOverviewStats.sectorData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 800 }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '10px' }} />
                          <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                          <ReferenceLine y={6} stroke="#cbd5e1" strokeDasharray="3 3" />
                      </BarChart>
                  </ResponsiveContainer>
              </div>

              {/* Card 5: Consistência (Range) */}
              <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                  <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Consistência do Elenco</span>
                      <Target size={14} className="text-gray-400" />
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-6">
                      <div className="relative h-4 bg-gray-100 dark:bg-darkInput rounded-full w-full">
                          <div 
                              className="absolute top-0 bottom-0 bg-indigo-200 dark:bg-indigo-900/40 rounded-full" 
                              style={{ 
                                  left: `${teamOverviewStats.consistency.min * 10}%`, 
                                  width: `${(teamOverviewStats.consistency.max - teamOverviewStats.consistency.min) * 10}%` 
                              }}
                          ></div>
                          <div 
                              className="absolute top-1/2 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white dark:border-darkCard transform -translate-y-1/2 -translate-x-1/2 shadow-sm z-10" 
                              style={{ left: `${teamOverviewStats.consistency.avg * 10}%` }}
                              title="Média"
                          ></div>
                          <div 
                              className="absolute top-1/2 w-2 h-2 bg-gray-400 rounded-full transform -translate-y-1/2 -translate-x-1/2 opacity-50" 
                              style={{ left: `${teamOverviewStats.consistency.min * 10}%` }}
                          ></div>
                          <div 
                              className="absolute top-1/2 w-2 h-2 bg-gray-400 rounded-full transform -translate-y-1/2 -translate-x-1/2 opacity-50" 
                              style={{ left: `${teamOverviewStats.consistency.max * 10}%` }}
                          ></div>
                      </div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 dark:text-gray-400">
                          <div className="text-center">
                              <span className="block text-[8px] text-gray-300 dark:text-gray-600">Mín</span>
                              {teamOverviewStats.consistency.min.toFixed(1)}
                          </div>
                          <div className="text-center">
                              <span className="block text-[8px] text-gray-300 dark:text-gray-600">Média</span>
                              <span className="text-indigo-600 dark:text-indigo-400">{teamOverviewStats.consistency.avg.toFixed(1)}</span>
                          </div>
                          <div className="text-center">
                              <span className="block text-[8px] text-gray-300 dark:text-gray-600">Máx</span>
                              {teamOverviewStats.consistency.max.toFixed(1)}
                          </div>
                      </div>
                  </div>
              </div>

              {/* Card 6: Evolução Coletiva */}
              <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-between h-[200px]">
                  <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Evolução Coletiva</span>
                      <TrendingUp size={14} className="text-emerald-500" />
                  </div>
                  {teamOverviewStats.evolutionData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={teamOverviewStats.evolutionData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                              <XAxis dataKey="date" hide />
                              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <Tooltip 
                                  cursor={{stroke: '#94a3b8', strokeWidth: 1}}
                                  contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: '10px' }}
                                  formatter={(value: number) => [value.toFixed(2), 'SMC Coletivo']}
                                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                              />
                              <Line type="monotone" dataKey="smc" stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: '#10b981' }} activeDot={{ r: 4 }} />
                          </LineChart>
                      </ResponsiveContainer>
                  ) : (
                      <div className="flex-1 flex items-center justify-center text-[9px] font-black text-gray-300 dark:text-gray-700 uppercase tracking-widest italic">
                          Dados insuficientes para tendência
                      </div>
                  )}
              </div>
          </div>
      </div>

      <div className="bg-white dark:bg-darkCard p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder overflow-hidden">
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
                            <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white">
                                {getPlayerScoreForDisplay(pos.player)}
                            </div>
                          </div>
                          <div className="mt-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] font-black uppercase tracking-tighter">{pos.player.name.split(' ')[0]}</div>
                      </Link>
                   ) : <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/40 text-[10px] font-black">{pos.role}</div>}
                </div>
             ))}
         </div>
         <div className="mt-4 flex justify-center">
             <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 flex items-center gap-1">
                 <Info size={12}/> Critério Ativo: <span className="text-indigo-600 dark:text-indigo-400 ml-1">{getCriterionLabel(bestXICriteria)}</span>
             </span>
         </div>
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
    </div>
  );
};

export default Dashboard;
