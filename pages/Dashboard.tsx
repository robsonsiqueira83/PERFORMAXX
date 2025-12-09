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
  const [selectedPeriod, setSelectedPeriod] = useState<string>('today');
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
      return entries.filter(e => sessionIds.includes(e.sessionId));
  }, [entries, filteredSessions]);


  // --- Calculate Scores for ALL Athletes first (using filtered entries) ---
  const athletesWithScores = useMemo(() => {
    return athletes.map(athlete => {
        const athleteEntries = filteredEntries.filter(e => e.athleteId === athlete.id);
        
        if (athleteEntries.length === 0) return { ...athlete, averageScore: 0, sessionsCount: 0 };

        const sumScore = athleteEntries.reduce((acc, entry) => {
            return acc + calculateTotalScore(entry.technical, entry.physical);
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
    // Filter by Category/Position
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
      // Filter sessions by category if selected
      let finalSessions = filteredSessions;
      if (selectedCategory !== 'all') {
          finalSessions = finalSessions.filter(s => s.categoryId === selectedCategory);
      }

      const sortedSessions = [...finalSessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return sortedSessions.map(session => {
          const sessionEntries = filteredEntries.filter(e => e.sessionId === session.id);
          if (sessionEntries.length === 0) return null;

          const totalScore = sessionEntries.reduce((acc, curr) => acc + calculateTotalScore(curr.technical, curr.physical), 0);
          const avg = totalScore / sessionEntries.length;

          return {
              date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              score: Number(avg.toFixed(1))
          };
      }).filter(Boolean);
  }, [filteredSessions, filteredEntries, selectedCategory]);

  // --- Logic for Team Radar Chart (General Average) ---
  const teamAverageStats = useMemo(() => {
    let finalAthletes = athletes;
    if (selectedCategory !== 'all') {
        finalAthletes = athletes.filter(a => a.categoryId === selectedCategory);
    }
    
    const teamAthleteIds = finalAthletes.map(a => a.id);
    const teamEntries = filteredEntries.filter(e => teamAthleteIds.includes(e.athleteId));

    if (teamEntries.length === 0) return [];

    const sums = {
      controle: 0, passe: 0, finalizacao: 0, drible: 0, cabeceio: 0, posicao: 0,
      velocidade: 0, agilidade: 0, forca: 0, resistencia: 0, coordenacao: 0, equilibrio: 0
    };

    teamEntries.forEach(e => {
       sums.controle += e.technical.controle;
       sums.passe += e.technical.passe;
       sums.finalizacao += e.technical.finalizacao;
       sums.drible += e.technical.drible;
       sums.cabeceio += e.technical.cabeceio;
       sums.posicao += e.technical.posicao;
       
       sums.velocidade += e.physical.velocidade;
       sums.agilidade += e.physical.agilidade;
       sums.forca += e.physical.forca;
       sums.resistencia += e.physical.resistencia;
       sums.coordenacao += e.physical.coordenacao;
       sums.equilibrio += e.physical.equilibrio;
    });

    const count = teamEntries.length;
    const avg = (val: number) => Number((val / count).toFixed(1));

    return [
      { subject: 'Controle', A: avg(sums.controle), fullMark: 10 },
      { subject: 'Passe', A: avg(sums.passe), fullMark: 10 },
      { subject: 'Final.', A: avg(sums.finalizacao), fullMark: 10 },
      { subject: 'Drible', A: avg(sums.drible), fullMark: 10 },
      { subject: 'Cabeceio', A: avg(sums.cabeceio), fullMark: 10 },
      { subject: 'Posição', A: avg(sums.posicao), fullMark: 10 },
      { subject: 'Velocid.', A: avg(sums.velocidade), fullMark: 10 },
      { subject: 'Agilidade', A: avg(sums.agilidade), fullMark: 10 },
      { subject: 'Força', A: avg(sums.forca), fullMark: 10 },
      { subject: 'Resist.', A: avg(sums.resistencia), fullMark: 10 },
      { subject: 'Coord.', A: avg(sums.coordenacao), fullMark: 10 },
      { subject: 'Equilíb.', A: avg(sums.equilibrio), fullMark: 10 },
    ];
  }, [athletes, filteredEntries, selectedCategory]);

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-8">
      
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
               <option value="today">Hoje</option>
               <option value="week">Últimos 7 dias</option>
               <option value="month">Últimos 30 dias</option>
               <option value="year">Este Ano</option>
               <option value="all">Todo o Período</option>
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
              Novo Treino
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
                         {/* Swapped Category and Position display as requested */}
                         <p className="text-xs text-gray-500">{getCalculatedCategory(athlete.birthDate)} - <span className="text-purple-600 font-semibold">{athlete.position}</span></p>
                         <p className="text-xs text-gray-500">{athlete.sessionsCount} treinos</p>
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
             {/* Center Line */}
             <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/40 transform -translate-y-1/2"></div>
             {/* Center Circle */}
             <div className="absolute top-1/2 left-1/2 w-24 h-24 md:w-32 md:h-32 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
             {/* Penalty Areas (Simplified) */}
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
                              {/* Swapped from Category to Position */}
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

             <div className="absolute bottom-2 right-2 text-white/30 text-xs font-bold uppercase tracking-widest">
                Campo de Defesa
             </div>
             <div className="absolute top-2 right-2 text-white/30 text-xs font-bold uppercase tracking-widest">
                Campo de Ataque
             </div>
         </div>
      </div>

      {/* Grid for Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Evolution Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-600"/>
                Evolução {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : '(Geral)'}
            </h3>
            <div className="h-[300px] w-full">
              {evolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evolutionData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 10]} stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                          <RechartsTooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                          />
                          <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff'}} />
                      </LineChart>
                  </ResponsiveContainer>
              ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                      Sem dados de treino para exibir gráfico.
                  </div>
              )}
            </div>
        </div>

        {/* Team Radar Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Activity size={20} className="text-purple-600"/>
                Média por Fundamento {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : '(Geral)'}
            </h3>
             <div className="h-[300px] w-full">
               {teamAverageStats.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamAverageStats}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} />
                      <Radar name="Média" dataKey="A" stroke="#8b5cf6" fill="#a78bfa" fillOpacity={0.5} />
                      <RechartsTooltip />
                    </RadarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex items-center justify-center text-gray-400">
                    Sem dados suficientes.
                 </div>
               )}
            </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;