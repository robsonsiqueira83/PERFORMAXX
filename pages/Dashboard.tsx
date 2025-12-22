
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, ComposedChart, ErrorBar, Scatter, ReferenceLine
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

  // --- LOGICA DO BLOCO VISÃO GERAL DA EQUIPE ---
  const teamOverviewStats = useMemo(() => {
      // Filtrar atletas válidos para análise estatística (que possuem dados)
      const validAthletes = athletesWithMeta.filter(a => a.eventCount > 0 && (selectedCategory === 'all' || a.categoryId === selectedCategory));
      
      if (validAthletes.length === 0) return null;

      // 1. Média Geral SMC
      const avgSMC = validAthletes.reduce((acc, curr) => acc + curr.globalScore, 0) / validAthletes.length;
      
      let smcLabel = "Em Análise";
      if (avgSMC >= 8.0) smcLabel = "Alta Prontidão Competitiva";
      else if (avgSMC >= 6.5) smcLabel = "Boa Prontidão";
      else if (avgSMC >= 5.0) smcLabel = "Funcional para Composição";
      else smcLabel = "Em Desenvolvimento";

      // 2. Distribuição
      const distribution = [
          { name: 'Desenv.', count: 0, fill: '#94a3b8' }, // < 5
          { name: 'Funcional', count: 0, fill: '#64748b' }, // 5 - 6.5
          { name: 'Pronto', count: 0, fill: '#475569' }, // 6.5 - 8
          { name: 'Alta', count: 0, fill: '#1e293b' } // > 8
      ];
      validAthletes.forEach(a => {
          if (a.globalScore < 5) distribution[0].count++;
          else if (a.globalScore < 6.5) distribution[1].count++;
          else if (a.globalScore < 8) distribution[2].count++;
          else distribution[3].count++;
      });

      // 3. Equilíbrio Téc/Fís
      const avgTechNorm = (validAthletes.reduce((a, b) => a + b.avgTech, 0) / validAthletes.length / 5) * 10;
      const avgPhysNorm = (validAthletes.reduce((a, b) => a + b.avgPhys, 0) / validAthletes.length / 100) * 10;
      const balanceData = [
          { name: 'Técnica', value: avgTechNorm, fill: '#3b82f6' },
          { name: 'Física', value: avgPhysNorm, fill: '#10b981' }
      ];

      // 4. Setores
      const sectors = {
          'Defesa': { sum: 0, count: 0 },
          'Meio': { sum: 0, count: 0 },
          'Ataque': { sum: 0, count: 0 }
      };
      validAthletes.forEach(a => {
          if ([Position.GOLEIRO, Position.ZAGUEIRO, Position.LATERAL].includes(a.position)) { sectors['Defesa'].sum += a.globalScore; sectors['Defesa'].count++; }
          else if ([Position.VOLANTE, Position.MEIO_CAMPO].includes(a.position)) { sectors['Meio'].sum += a.globalScore; sectors['Meio'].count++; }
          else { sectors['Ataque'].sum += a.globalScore; sectors['Ataque'].count++; }
      });
      const sectorData = Object.keys(sectors).map(k => ({
          name: k,
          score: (sectors as any)[k].count > 0 ? (sectors as any)[k].sum / (sectors as any)[k].count : 0
      }));

      // 5. Consistência
      const scores = validAthletes.map(a => a.globalScore).sort((a, b) => a - b);
      const min = scores[0];
      const max = scores[scores.length - 1];
      const consistencyData = [
          { name: 'Elenco', min, max, avg: avgSMC }
      ];

      // 6. Evolução (Histórico Agrupado)
      // Agrupar todas as avaliações por data e calcular média SMC do dia
      const groupedHistory: Record<string, {sum: number, count: number}> = {};
      evalSessions.forEach(ev => {
          // Filtrar se o atleta pertence à categoria selecionada
          const ath = athletesWithMeta.find(a => a.id === ev.athleteId);
          if (!ath || (selectedCategory !== 'all' && ath.categoryId !== selectedCategory)) return;

          const date = ev.date.split('T')[0];
          if (!groupedHistory[date]) groupedHistory[date] = { sum: 0, count: 0 };
          
          // Calcular SMC individual desta avaliação
          const mt = (ev.scoreTecnico / 5) * 10;
          const cf = ev.scoreFisico / 10;
          const smc = (mt * 0.55) + (cf * 0.45);
          
          groupedHistory[date].sum += smc;
          groupedHistory[date].count++;
      });

      const historyData = Object.keys(groupedHistory).sort().slice(-8).map(date => ({
          date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          smc: groupedHistory[date].sum / groupedHistory[date].count
      }));

      return {
          avgSMC,
          smcLabel,
          distribution,
          balanceData,
          sectorData,
          consistencyData,
          historyData,
          totalAthletes: validAthletes.length
      };
  }, [athletesWithMeta, selectedCategory, evalSessions]);

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

      {/* --- BLOCO VISÃO GERAL DA EQUIPE (NOVO) --- */}
      <div className="space-y-6">
          <div className="flex items-center gap-3 border-b dark:border-darkBorder pb-2">
              <div className="bg-gray-100 dark:bg-darkInput p-2 rounded-xl"><Layers size={20} className="text-gray-600 dark:text-gray-400"/></div>
              <div>
                  <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Visão Geral da Equipe</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Resumo coletivo de prontidão técnica e física</p>
              </div>
          </div>

          {teamOverviewStats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  
                  {/* CARD 1: Prontidão Média (Gauge) */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col items-center justify-center min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 w-full text-left">Prontidão Média (SMC)</h4>
                      <div className="relative h-[150px] w-full flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                              <RadialBarChart 
                                  cx="50%" cy="80%" 
                                  innerRadius="70%" outerRadius="100%" 
                                  startAngle={180} endAngle={0}
                                  barSize={20} 
                                  data={[{ name: 'SMC', value: teamOverviewStats.avgSMC, fill: '#4f46e5' }]}
                              >
                                  <PolarAngleAxis type="number" domain={[0, 10]} angleAxisId={0} tick={false} />
                                  <RadialBar background dataKey="value" cornerRadius={10} />
                              </RadialBarChart>
                          </ResponsiveContainer>
                          <div className="absolute top-[65%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                              <span className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{teamOverviewStats.avgSMC.toFixed(1)}</span>
                          </div>
                      </div>
                      <p className="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-tight mt-4 text-center bg-gray-50 dark:bg-darkInput px-4 py-1 rounded-full">{teamOverviewStats.smcLabel}</p>
                  </div>

                  {/* CARD 2: Distribuição do Elenco */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Distribuição do Elenco</h4>
                      <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={teamOverviewStats.distribution} margin={{top: 10, right: 0, left: -25, bottom: 0}}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                  <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                  <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} allowDecimals={false} />
                                  <Tooltip cursor={{fill: '#f1f5f9', opacity: 0.1}} contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff'}} />
                                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                                      {teamOverviewStats.distribution.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.fill} />
                                      ))}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* CARD 3: Equilíbrio Téc/Fís */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Scale size={14}/> Equilíbrio da Equipe</h4>
                      <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={teamOverviewStats.balanceData} layout="vertical" margin={{top: 0, right: 30, left: 0, bottom: 0}}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                                  <XAxis type="number" domain={[0, 10]} hide />
                                  <YAxis dataKey="name" type="category" tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={60} />
                                  <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff'}} />
                                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={30}>
                                       {teamOverviewStats.balanceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* CARD 4: Prontidão por Setor */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">SMC Médio por Setor</h4>
                      <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={teamOverviewStats.sectorData} margin={{top: 10, right: 0, left: -25, bottom: 0}}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                  <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                  <YAxis domain={[0, 10]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                  <Tooltip cursor={{fill: '#f1f5f9', opacity: 0.1}} contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff'}} />
                                  <Bar dataKey="score" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* CARD 5: Consistência do Elenco */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart3 size={14}/> Consistência (Min - Méd - Máx)</h4>
                      <div className="h-[200px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={teamOverviewStats.consistencyData} layout="vertical" margin={{top: 20, right: 20, bottom: 20, left: 20}}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                                  <XAxis type="number" domain={[0, 10]} tick={{fontSize: 10, fill: '#94a3b8'}} />
                                  <YAxis type="category" dataKey="name" hide />
                                  <Tooltip contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff'}} />
                                  
                                  {/* Range Bar (Min to Max) using a thick bar for the range and transparent ends */}
                                  <Bar dataKey="max" fill="#e2e8f0" barSize={20} radius={[4,4,4,4]} stackId="a" />
                                  
                                  {/* Average Point */}
                                  <Scatter dataKey="avg" fill="#4f46e5" shape="circle" />
                                  <ReferenceLine x={teamOverviewStats.consistencyData[0].min} stroke="#94a3b8" strokeDasharray="3 3" label={{ position: 'top', value: 'Min', fontSize: 9, fill: '#94a3b8' }} />
                                  <ReferenceLine x={teamOverviewStats.consistencyData[0].max} stroke="#94a3b8" strokeDasharray="3 3" label={{ position: 'top', value: 'Max', fontSize: 9, fill: '#94a3b8' }} />
                                  <ReferenceLine x={teamOverviewStats.avgSMC} stroke="#4f46e5" label={{ position: 'bottom', value: 'Média', fontSize: 9, fill: '#4f46e5', fontWeight: 800 }} />
                              </ComposedChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* CARD 6: Evolução da Prontidão */}
                  <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm min-h-[280px]">
                      <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><TrendingUp size={14}/> Evolução Coletiva (SMC)</h4>
                      {teamOverviewStats.historyData.length > 1 ? (
                          <div className="h-[200px]">
                              <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={teamOverviewStats.historyData} margin={{top: 10, right: 10, left: -25, bottom: 0}}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                      <XAxis dataKey="date" tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                      <YAxis domain={[0, 10]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: '#1e293b', color: '#fff'}} />
                                      <Line type="monotone" dataKey="smc" stroke="#6366f1" strokeWidth={3} dot={{r: 4, strokeWidth: 0, fill: '#6366f1'}} activeDot={{r: 6}} />
                                  </LineChart>
                              </ResponsiveContainer>
                          </div>
                      ) : (
                          <div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
                              <Info size={24} className="mb-2 opacity-50"/>
                              <p className="text-xs font-bold uppercase tracking-widest opacity-50">Dados históricos insuficientes</p>
                          </div>
                      )}
                  </div>

              </div>
          ) : (
              <div className="p-12 text-center bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm">
                  <Info className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={32} />
                  <p className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest">Sem dados suficientes para análise de elenco nesta categoria.</p>
              </div>
          )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Zap size={100} className="text-indigo-600 dark:text-indigo-400"/></div>
              <div><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-indigo-500"/> SMC Médio do Time (0-10)</span><p className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{teamAverages.score.toFixed(1)}</p><span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Score Médio de Capacidade</span></div>
          </div>
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={100} className="text-emerald-600 dark:text-emerald-400"/></div>
              <div><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><ClipboardList size={14} className="text-emerald-500"/> Média Técnica do Time</span><p className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{teamAverages.tech.toFixed(1)}</p><span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Domínio de Fundamentos</span></div>
          </div>
          <div className="bg-white dark:bg-darkCard p-6 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between overflow-hidden relative group">
              <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Timer size={100} className="text-blue-600 dark:text-blue-400"/></div>
              <div><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-1"><Activity size={14} className="text-blue-500"/> Impacto Tático Médio</span><p className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">{teamAverages.tactical.toFixed(2)}</p><span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Eficiência em Partidas</span></div>
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
