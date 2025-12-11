import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Users, ClipboardList, TrendingUp, Trophy, Activity, Shirt, Calendar, Loader2 } from 'lucide-react';
import { 
  getAthletes, 
  getCategories, 
  getTrainingEntries, 
  getTrainingSessions 
} from '../services/storageService';
import { calculateTotalScore, Position, Athlete, Category, TrainingSession, TrainingEntry, getCalculatedCategory } from '../types';

interface DashboardProps {
  teamId: string;
}

const Dashboard: React.FC<DashboardProps> = ({ teamId }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  // Default set to 'all' as requested
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Custom Date Range State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data State
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        const [a, c, s, e] = await Promise.all([
            getAthletes(),
            getCategories(),
            getTrainingSessions(),
            getTrainingEntries()
        ]);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setSessions(s.filter(item => item.teamId === teamId));
        setEntries(e);
        setLoading(false);
    };
    loadData();
  }, [teamId]);

  // --- Filter Sessions by Period ---
  const filteredSessions = useMemo(() => {
    const now = new Date();
    // Reset time to midnight for accurate day comparison
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    return sessions.filter(s => {
      const sIso = s.date; // YYYY-MM-DD
      const todayIso = now.toISOString().split('T')[0];

      switch (selectedPeriod) {
        case 'today':
          return sIso === todayIso;
        case 'week':
           const sevenDaysAgo = new Date(now);
           sevenDaysAgo.setDate(now.getDate() - 7);
           return sIso >= sevenDaysAgo.toISOString().split('T')[0];
        case 'month':
           const thirtyDaysAgo = new Date(now);
           thirtyDaysAgo.setDate(now.getDate() - 30);
           return sIso >= thirtyDaysAgo.toISOString().split('T')[0];
        case 'year':
           const startYear = `${now.getFullYear()}-01-01`;
           return sIso >= startYear;
        case 'custom':
           if (!startDate || !endDate) return true; // Return all if dates invalid
           return sIso >= startDate && sIso <= endDate;
        case 'all':
        default:
          return true;
      }
    });
  }, [sessions, selectedPeriod, startDate, endDate]);

  // --- Filter Entries based on Filtered Sessions ---
  const filteredEntries = useMemo(() => {
      const sessionIds = filteredSessions.map(s => s.id);
      let es = entries.filter(e => sessionIds.includes(e.sessionId));
      
      if (selectedCategory !== 'all') {
          const categoryAthleteIds = athletes.filter(a => a.categoryId === selectedCategory).map(a => a.id);
          es = es.filter(e => categoryAthleteIds.includes(e.athleteId));
      }

      if (selectedPosition !== 'all') {
          const positionAthleteIds = athletes.filter(a => a.position === selectedPosition).map(a => a.id);
          es = es.filter(e => positionAthleteIds.includes(e.athleteId));
      }

      return es;
  }, [entries, filteredSessions, selectedCategory, selectedPosition, athletes]);


  // --- Calculate Scores for ALL Athletes first (using filtered entries) ---
  const athletesWithScores = useMemo(() => {
    return athletes.map(athlete => {
        const athleteEntries = filteredEntries.filter(e => e.athleteId === athlete.id);
        
        if (athleteEntries.length === 0) return { ...athlete, averageScore: 0, sessionsCount: 0 };

        const sumScore = athleteEntries.reduce((acc, entry) => {
            return acc + calculateTotalScore(entry.technical, entry.physical, entry.tactical);
        }, 0);

        return {
            ...athlete,
            averageScore: Number((sumScore / athleteEntries.length).toFixed(1)),
            sessionsCount: athleteEntries.length
        };
    }).sort((a, b) => b.averageScore - a.averageScore);
  }, [athletes, filteredEntries]);

  // --- Top 3 Ranking (Filtered) ---
  const rankedAthletes = useMemo(() => {
    let filtered = athletesWithScores;
    if (selectedCategory !== 'all') filtered = filtered.filter(a => a.categoryId === selectedCategory);
    if (selectedPosition !== 'all') filtered = filtered.filter(a => a.position === selectedPosition);
    return filtered.slice(0, 3);
  }, [athletesWithScores, selectedCategory, selectedPosition]);

  // --- Best XI Logic (Field Distribution) ---
  const bestXI = useMemo(() => {
    // Helper to get top N players by position list
    const getTopPlayers = (positions: Position[], count: number, excludeIds: string[]) => {
       const pool = athletesWithScores.filter(a => 
         positions.includes(a.position) && 
         !excludeIds.includes(a.id) && 
         (selectedCategory === 'all' || a.categoryId === selectedCategory) // Filter by category
       );
       return pool.slice(0, count);
    };

    const selectedIds: string[] = [];
    
    // Formation 4-3-3 Logic
    const goleiro = getTopPlayers([Position.GOLEIRO], 1, selectedIds);
    selectedIds.push(...goleiro.map(a => a.id));

    const zagueiros = getTopPlayers([Position.ZAGUEIRO], 2, selectedIds);
    selectedIds.push(...zagueiros.map(a => a.id));

    const laterais = getTopPlayers([Position.LATERAL], 2, selectedIds);
    selectedIds.push(...laterais.map(a => a.id));

    const meioCampo = getTopPlayers([Position.VOLANTE, Position.MEIO_CAMPO], 3, selectedIds);
    selectedIds.push(...meioCampo.map(a => a.id));

    const ataque = getTopPlayers([Position.ATACANTE, Position.CENTROAVANTE], 3, selectedIds);
    selectedIds.push(...ataque.map(a => a.id));

    return [
        { role: 'GK', player: goleiro[0], style: { bottom: '10%', left: '50%' } }, // Goleiro (up from 5%)
        { role: 'LE', player: laterais[0], style: { bottom: '25%', left: '20%' } }, // Lateral Esq (in from 15%)
        { role: 'ZC', player: zagueiros[0], style: { bottom: '25%', left: '38%' } }, // Zagueiro 1
        { role: 'ZC', player: zagueiros[1], style: { bottom: '25%', left: '62%' } }, // Zagueiro 2
        { role: 'LD', player: laterais[1], style: { bottom: '25%', left: '80%' } }, // Lateral Dir (in from 85%)
        { role: 'MC', player: meioCampo[0], style: { bottom: '50%', left: '25%' } }, // Meio 1 (in from 20%)
        { role: 'MC', player: meioCampo[1], style: { bottom: '50%', left: '50%' } }, // Meio 2
        { role: 'MC', player: meioCampo[2], style: { bottom: '50%', left: '75%' } }, // Meio 3 (in from 80%)
        { role: 'AT', player: ataque[0], style: { bottom: '75%', left: '25%' } }, // Atacante 1 (in from 20%, down from 80%)
        { role: 'AT', player: ataque[1], style: { bottom: '80%', left: '50%' } }, // Centroavante (down from 85%)
        { role: 'AT', player: ataque[2], style: { bottom: '75%', left: '75%' } }, // Atacante 2 (in from 80%, down from 80%)
    ];
  }, [athletesWithScores, selectedCategory]);


  // --- Logic for Evolution Chart (Average of team/category over time) ---
  const evolutionData = useMemo(() => {
      let relevantSessions = filteredSessions;
      if (selectedCategory !== 'all') {
          relevantSessions = relevantSessions.filter(s => s.categoryId === selectedCategory);
      }

      const sortedSessions = [...relevantSessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return sortedSessions.map(session => {
          const sessionEntries = filteredEntries.filter(e => e.sessionId === session.id);
          if (sessionEntries.length === 0) return null;

          const totalScore = sessionEntries.reduce((acc, curr) => acc + calculateTotalScore(curr.technical, curr.physical, curr.tactical), 0);
          const avg = totalScore / sessionEntries.length;

          return {
              date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              score: Number(avg.toFixed(1))
          };
      }).filter(Boolean);
  }, [filteredSessions, filteredEntries, selectedCategory]);

  // --- Logic for Aggregate Stats (Averages of filtered entries) ---
  const teamStats = useMemo(() => {
    if (filteredEntries.length === 0) return null;

    const dataToAverage = filteredEntries;
    const avg = (key: string, type: 'technical' | 'physical' | 'tactical') => {
      let count = 0;
      const sum = dataToAverage.reduce((acc, curr) => {
          const group = curr[type] as any;
          if (group && group[key] !== undefined) {
              count++;
              return acc + Number(group[key]);
          }
          return acc;
      }, 0);
      return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    };

    return {
      technical: [
        { subject: 'Controle', A: avg('controle_bola', 'technical'), fullMark: 10 },
        { subject: 'Condução', A: avg('conducao', 'technical'), fullMark: 10 },
        { subject: 'Passe', A: avg('passe', 'technical'), fullMark: 10 },
        { subject: 'Recepção', A: avg('recepcao', 'technical'), fullMark: 10 },
        { subject: 'Drible', A: avg('drible', 'technical'), fullMark: 10 },
        { subject: 'Finalização', A: avg('finalizacao', 'technical'), fullMark: 10 },
        { subject: 'Cruzamento', A: avg('cruzamento', 'technical'), fullMark: 10 },
        { subject: 'Desarme', A: avg('desarme', 'technical'), fullMark: 10 },
        { subject: 'Intercept.', A: avg('interceptacao', 'technical'), fullMark: 10 },
      ],
      physical: [
        { subject: 'Velocidade', A: avg('velocidade', 'physical'), fullMark: 10 },
        { subject: 'Agilidade', A: avg('agilidade', 'physical'), fullMark: 10 },
        { subject: 'Resistência', A: avg('resistencia', 'physical'), fullMark: 10 },
        { subject: 'Força', A: avg('forca', 'physical'), fullMark: 10 },
        { subject: 'Coordenação', A: avg('coordenacao', 'physical'), fullMark: 10 },
        { subject: 'Mobilidade', A: avg('mobilidade', 'physical'), fullMark: 10 },
        { subject: 'Estabilidade', A: avg('estabilidade', 'physical'), fullMark: 10 },
      ],
      tactical_def: [
        { subject: 'Posicionamento', A: avg('def_posicionamento', 'tactical'), fullMark: 10 },
        { subject: 'Pressão', A: avg('def_pressao', 'tactical'), fullMark: 10 },
        { subject: 'Cobertura', A: avg('def_cobertura', 'tactical'), fullMark: 10 },
        { subject: 'Fechamento', A: avg('def_fechamento', 'tactical'), fullMark: 10 },
        { subject: 'Temporização', A: avg('def_temporizacao', 'tactical'), fullMark: 10 },
        { subject: 'Desarme Tát.', A: avg('def_desarme_tatico', 'tactical'), fullMark: 10 },
        { subject: 'Reação', A: avg('def_reacao', 'tactical'), fullMark: 10 },
      ],
      tactical_const: [
        { subject: 'Qual. Passe', A: avg('const_qualidade_passe', 'tactical'), fullMark: 10 },
        { subject: 'Visão', A: avg('const_visao', 'tactical'), fullMark: 10 },
        { subject: 'Apoios', A: avg('const_apoios', 'tactical'), fullMark: 10 },
        { subject: 'Mobilidade', A: avg('const_mobilidade', 'tactical'), fullMark: 10 },
        { subject: 'Circulação', A: avg('const_circulacao', 'tactical'), fullMark: 10 },
        { subject: 'Q. Linhas', A: avg('const_quebra_linhas', 'tactical'), fullMark: 10 },
        { subject: 'Decisão', A: avg('const_tomada_decisao', 'tactical'), fullMark: 10 },
      ],
      tactical_ult: [
        { subject: 'Movimentação', A: avg('ult_movimentacao', 'tactical'), fullMark: 10 },
        { subject: 'Atq Espaço', A: avg('ult_ataque_espaco', 'tactical'), fullMark: 10 },
        { subject: '1v1', A: avg('ult_1v1', 'tactical'), fullMark: 10 },
        { subject: 'Último Passe', A: avg('ult_ultimo_passe', 'tactical'), fullMark: 10 },
        { subject: 'Finalização', A: avg('ult_finalizacao_eficiente', 'tactical'), fullMark: 10 },
        { subject: 'Ritmo', A: avg('ult_ritmo', 'tactical'), fullMark: 10 },
        { subject: 'Bolas Paradas', A: avg('ult_bolas_paradas', 'tactical'), fullMark: 10 },
      ]
    };
  }, [filteredEntries]);

  // Dynamic Color Helper
  const getTacticalColor = (data: any[]) => {
      if (!data || data.length === 0) return { stroke: '#8884d8', fill: '#8884d8' };
      const avg = data.reduce((sum, item) => sum + item.A, 0) / data.length;
      if (avg < 4) return { stroke: '#ef4444', fill: '#ef4444' }; // Red
      if (avg < 8) return { stroke: '#f97316', fill: '#f97316' }; // Orange
      return { stroke: '#22c55e', fill: '#22c55e' }; // Green
  };

  const defColor = teamStats ? getTacticalColor(teamStats.tactical_def) : { stroke: '#6b21a8', fill: '#a855f7' };
  const constColor = teamStats ? getTacticalColor(teamStats.tactical_const) : { stroke: '#7e22ce', fill: '#a855f7' };
  const ultColor = teamStats ? getTacticalColor(teamStats.tactical_ult) : { stroke: '#9333ea', fill: '#d8b4fe' };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8 pb-10">
      
      {/* Top Controls & Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto flex-wrap">
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-gray-500 mb-1">CATEGORIA</label>
             <select 
               className="bg-gray-100 border border-gray-300 text-gray-900 rounded-lg p-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[150px]"
               value={selectedCategory}
               onChange={(e) => setSelectedCategory(e.target.value)}
             >
               <option value="all">Todas</option>
               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-gray-500 mb-1">POSIÇÃO</label>
             <select 
               className="bg-gray-100 border border-gray-300 text-gray-900 rounded-lg p-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[150px]"
               value={selectedPosition}
               onChange={(e) => setSelectedPosition(e.target.value)}
             >
               <option value="all">Todas</option>
               {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Calendar size={12}/> PERÍODO</label>
             <select 
               className="bg-gray-100 border border-gray-300 text-gray-900 rounded-lg p-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[150px]"
               value={selectedPeriod}
               onChange={(e) => setSelectedPeriod(e.target.value)}
             >
               <option value="all">Todo o Período</option>
               <option value="today">Hoje</option>
               <option value="week">Últimos 7 dias</option>
               <option value="month">Últimos 30 dias</option>
               <option value="year">Este Ano</option>
               <option value="custom">Personalizado</option>
             </select>
          </div>
          
          {selectedPeriod === 'custom' && (
              <div className="flex gap-2">
                  <div className="flex flex-col">
                      <label className="text-xs font-semibold text-gray-500 mb-1">Início</label>
                      <input 
                        type="date" 
                        className="bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                  </div>
                  <div className="flex flex-col">
                      <label className="text-xs font-semibold text-gray-500 mb-1">Fim</label>
                      <input 
                        type="date" 
                        className="bg-gray-100 border border-gray-300 rounded-lg p-2 text-sm"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                  </div>
              </div>
          )}

        </div>

        <div className="flex gap-2 w-full md:w-auto">
           <Link to="/athletes" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Users size={16} />
              Atletas
           </Link>
           <Link to="/training" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <ClipboardList size={16} />
              Nova Atuação
           </Link>
        </div>
      </div>

      {/* Top 3 Ranking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {rankedAthletes.map((athlete, index) => (
             <div key={athlete.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Trophy size={60} />
                 </div>
                 <div className="flex items-center gap-4 relative z-10">
                     <div className="relative">
                        {athlete.photoUrl ? (
                            <img src={athlete.photoUrl} alt={athlete.name} className="w-16 h-16 rounded-full object-cover border-2 border-blue-100" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl font-bold">
                                {athlete.name.charAt(0)}
                            </div>
                        )}
                        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#4ade80] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                            #{index + 1}
                        </div>
                     </div>
                     <div>
                         <h3 className="font-bold text-gray-800 truncate max-w-[120px]">{athlete.name}</h3>
                         <p className="text-xs text-gray-500">{getCalculatedCategory(athlete.birthDate)} - <span className="text-purple-600 font-semibold">{athlete.position}</span></p>
                         <p className="text-xs text-gray-500">{athlete.sessionsCount} atuações</p>
                     </div>
                 </div>
                 <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                     <div>
                         <span className="text-xs text-gray-400 font-uppercase">SCORE MÉDIO</span>
                         <div className="text-2xl font-bold text-blue-900">{athlete.averageScore}</div>
                     </div>
                     <Link to={`/athletes/${athlete.id}`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                         Ver Detalhes &rarr;
                     </Link>
                 </div>
             </div>
         ))}
         {rankedAthletes.length === 0 && (
             <div className="col-span-3 p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                 {filteredEntries.length === 0 
                    ? "Nenhum dado encontrado para o período selecionado." 
                    : "Nenhum atleta suficiente para gerar o ranking com os filtros atuais."}
             </div>
         )}
      </div>

      {/* Football Field Visualization - Best XI */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
         <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Shirt size={20} className="text-green-600"/>
            Seleção do Momento (Top 11) {selectedCategory !== 'all' && `- ${categories.find(c => c.id === selectedCategory)?.name}`}
         </h3>
         
         {/* Field Container */}
         <div className="relative w-full aspect-[3/4] md:aspect-[16/9] lg:aspect-[2/1] bg-green-600 rounded-lg overflow-hidden border-4 border-green-700 shadow-inner">
             {/* Field Markings */}
             <div className="absolute inset-4 border-2 border-white/40 rounded-sm"></div>
             <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2"></div>
             <div className="absolute top-1/2 left-1/2 w-24 h-24 md:w-32 md:h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
             <div className="absolute bottom-4 left-1/2 w-48 h-24 border-2 border-white/40 border-b-0 transform -translate-x-1/2 bg-transparent"></div>
             <div className="absolute top-4 left-1/2 w-48 h-24 border-2 border-white/40 border-t-0 transform -translate-x-1/2 bg-transparent"></div>

             {/* Players */}
             {bestXI.map((pos, idx) => (
                <div 
                  key={idx}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-all hover:scale-110 z-10"
                  style={pos.style as React.CSSProperties}
                >
                   {pos.player && pos.player.averageScore > 0 ? (
                      <Link to={`/athletes/${pos.player.id}`} className="flex flex-col items-center">
                          <div className="relative">
                             {pos.player.photoUrl ? (
                                 <img src={pos.player.photoUrl} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white shadow-md object-cover bg-white" alt={pos.player.name} />
                             ) : (
                                 <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white shadow-md bg-white flex items-center justify-center text-xs font-bold text-gray-700">
                                     {pos.player.name.charAt(0)}
                                 </div>
                             )}
                             <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow border border-white">
                                 {pos.player.averageScore}
                             </div>
                          </div>
                          <div className="mt-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-white text-[10px] md:text-xs font-medium text-center truncate max-w-[80px]">
                              {pos.player.name.split(' ')[0]}
                          </div>
                          <div className="text-[9px] text-white/90 bg-black/30 px-1 rounded mt-0.5">
                              {pos.player.position}
                          </div>
                      </Link>
                   ) : (
                       <div className="opacity-50 flex flex-col items-center">
                           <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/50 bg-transparent flex items-center justify-center text-white/50 text-xs">
                               {pos.role}
                           </div>
                       </div>
                   )}
                </div>
             ))}
         </div>
      </div>

      <div className="border-t border-gray-200 my-8"></div>
      
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
         <Activity className="text-blue-600"/> 
         Média Geral {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : ''}
      </h2>

      {/* TACTICAL CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Defendendo (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_def ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_def}>
                        <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Defendendo" dataKey="A" stroke={defColor.stroke} fill={defColor.fill} fillOpacity={0.4} /><RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Construindo (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_const ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_const}>
                        <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Construindo" dataKey="A" stroke={constColor.stroke} fill={constColor.fill} fillOpacity={0.4} /><RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Último Terço (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_ult ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_ult}>
                        <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Último Terço" dataKey="A" stroke={ultColor.stroke} fill={ultColor.fill} fillOpacity={0.4} /><RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
      </div>

      {/* TECH/PHYS Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-blue-700 mb-4">Fundamentos (Média)</h3>
              <div className="h-[300px]">
                 {teamStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamStats.technical}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} />
                        <Radar name="Fundamentos" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                        <RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-orange-700 mb-4">Condição Físico (Média)</h3>
               <div className="h-[300px]">
                 {teamStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamStats.physical}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} />
                        <Radar name="Físico" dataKey="A" stroke="#ea580c" fill="#f97316" fillOpacity={0.4} />
                        <RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
      </div>

      {/* Evolution Line Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-600"/>
            Evolução Score Médio {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : ''}
         </h3>
         <div className="h-[300px]">
             {evolutionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolutionData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" fontSize={12} stroke="#9ca3af" />
                        <YAxis domain={[0, 10]} fontSize={12} stroke="#9ca3af" />
                        <RechartsTooltip />
                        <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
             ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados históricos para o período selecionado</div>}
         </div>
      </div>

    </div>
  );
};

export default Dashboard;