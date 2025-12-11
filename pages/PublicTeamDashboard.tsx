import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeams, getAthletes, getCategories, getTrainingSessions, getTrainingEntries } from '../services/storageService';
import { Team, Athlete, Category, TrainingSession, TrainingEntry, Position, calculateTotalScore, getCalculatedCategory } from '../types';
import PublicHeader from '../components/PublicHeader';
import { Loader2, Filter, Shirt, Trophy, Users } from 'lucide-react';

const PublicTeamDashboard: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const [loading, setLoading] = useState(true);
  
  // Data
  const [team, setTeam] = useState<Team | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');

  useEffect(() => {
    const loadData = async () => {
        if (!teamId) return;
        setLoading(true);
        const [t, a, c, s, e] = await Promise.all([
            getTeams(),
            getAthletes(),
            getCategories(),
            getTrainingSessions(),
            getTrainingEntries()
        ]);

        const currentTeam = t.find(item => item.id === teamId);
        setTeam(currentTeam || null);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setSessions(s.filter(item => item.teamId === teamId));
        setEntries(e); // Entry filtering happens in memory for simplicity
        setLoading(false);
    };
    loadData();
  }, [teamId]);

  // --- Filter Logic ---
  const filteredSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter(s => {
      const sIso = s.date;
      const todayIso = now.toISOString().split('T')[0];

      switch (selectedPeriod) {
        case 'today': return sIso === todayIso;
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
        case 'all':
        default:
          return true;
      }
    });
  }, [sessions, selectedPeriod]);

  const filteredEntries = useMemo(() => {
      const sessionIds = filteredSessions.map(s => s.id);
      return entries.filter(e => sessionIds.includes(e.sessionId));
  }, [entries, filteredSessions]);

  // --- Calculate Scores ---
  const athletesWithScores = useMemo(() => {
    return athletes.map(athlete => {
        let athleteEntries = filteredEntries.filter(e => e.athleteId === athlete.id);
        
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

  // --- Filtered List for Display ---
  const displayAthletes = useMemo(() => {
      let list = athletesWithScores;
      if (selectedCategory !== 'all') list = list.filter(a => a.categoryId === selectedCategory);
      if (selectedPosition !== 'all') list = list.filter(a => a.position === selectedPosition);
      return list;
  }, [athletesWithScores, selectedCategory, selectedPosition]);


  // --- Best XI Logic (Matched with Dashboard.tsx) ---
  const bestXI = useMemo(() => {
    const getTopPlayers = (positions: Position[], count: number, excludeIds: string[]) => {
       const pool = athletesWithScores.filter(a => 
         positions.includes(a.position) && 
         !excludeIds.includes(a.id) && 
         (selectedCategory === 'all' || a.categoryId === selectedCategory)
       );
       return pool.slice(0, count);
    };

    const selectedIds: string[] = [];
    
    // 1. Goleiro (1)
    const goleiro = getTopPlayers([Position.GOLEIRO], 1, selectedIds);
    selectedIds.push(...goleiro.map(a => a.id));

    // 2. Laterais (2)
    const laterais = getTopPlayers([Position.LATERAL], 2, selectedIds);
    selectedIds.push(...laterais.map(a => a.id));

    // 3. Zagueiros (2)
    const zagueiros = getTopPlayers([Position.ZAGUEIRO], 2, selectedIds);
    selectedIds.push(...zagueiros.map(a => a.id));

    // 4. Volante (1)
    const volante = getTopPlayers([Position.VOLANTE], 1, selectedIds);
    selectedIds.push(...volante.map(a => a.id));

    // 5. Meio Campo (2)
    const meios = getTopPlayers([Position.MEIO_CAMPO], 2, selectedIds);
    selectedIds.push(...meios.map(a => a.id));

    // 6. Atacantes (2)
    const atacantes = getTopPlayers([Position.ATACANTE], 2, selectedIds);
    selectedIds.push(...atacantes.map(a => a.id));

    // 7. Centro Avante (1)
    const centroavante = getTopPlayers([Position.CENTROAVANTE], 1, selectedIds);
    selectedIds.push(...centroavante.map(a => a.id));

    return [
        // GK (Bottom 5% - Close to goal line)
        { role: 'GK', player: goleiro[0], style: { bottom: '5%', left: '50%' } }, 
        
        // Defesa (Laterais + Zagueiros)
        { role: 'LE', player: laterais[0], style: { bottom: '22%', left: '15%' } }, 
        { role: 'ZC', player: zagueiros[0], style: { bottom: '16%', left: '38%' } }, 
        { role: 'ZC', player: zagueiros[1], style: { bottom: '16%', left: '62%' } }, 
        { role: 'LD', player: laterais[1], style: { bottom: '22%', left: '85%' } }, 
        
        // Volante (Central)
        { role: 'VOL', player: volante[0], style: { bottom: '35%', left: '50%' } }, 
        
        // Meio Campo (Ahead of Volante)
        { role: 'MC', player: meios[0], style: { bottom: '50%', left: '30%' } }, 
        { role: 'MC', player: meios[1], style: { bottom: '50%', left: '70%' } }, 
        
        // Ataque (Wingers)
        { role: 'AT', player: atacantes[0], style: { bottom: '65%', left: '20%' } }, 
        { role: 'AT', player: atacantes[1], style: { bottom: '65%', left: '80%' } }, 
        
        // Centro Avante (Lowered to 75%)
        { role: 'CA', player: centroavante[0], style: { bottom: '75%', left: '50%' } }, 
    ];
  }, [athletesWithScores, selectedCategory]);


  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>;
  if (!team) return <div className="p-10 text-center">Time não encontrado.</div>;

  const selectClass = "bg-gray-100 border border-gray-300 text-gray-900 rounded-lg p-2 text-sm focus:ring-blue-500 focus:border-blue-500 w-full";

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <PublicHeader team={team} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <h3 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <Filter size={16}/> Filtros de Visualização
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">CATEGORIA</label>
                    <select className={selectClass} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                        <option value="all">Todas as Categorias</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">POSIÇÃO</label>
                    <select className={selectClass} value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)}>
                        <option value="all">Todas as Posições</option>
                        {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">PERÍODO</label>
                    <select className={selectClass} value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
                        <option value="all">Todo o Período</option>
                        <option value="today">Hoje</option>
                        <option value="week">Últimos 7 dias</option>
                        <option value="month">Últimos 30 dias</option>
                        <option value="year">Este Ano</option>
                    </select>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Column 1: Ranked List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Users className="text-blue-600"/> Ranking de Atletas
                    </h3>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {displayAthletes.length} atletas
                    </span>
                </div>
                <div className="divide-y divide-gray-100 max-h-[800px] overflow-y-auto">
                    {displayAthletes.map((athlete, index) => (
                        /* LINK TO PUBLIC PROFILE */
                        <Link to={`/p/athlete/${athlete.id}`} key={athlete.id} className="flex items-center p-4 hover:bg-blue-50 transition-colors group">
                            <div className="flex-shrink-0 relative mr-4">
                                {athlete.photoUrl ? (
                                    <img src={athlete.photoUrl} className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 group-hover:border-blue-200" />
                                ) : (
                                    <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-400">
                                        {athlete.name.charAt(0)}
                                    </div>
                                )}
                                <div className="absolute -top-1 -left-1 w-6 h-6 bg-white shadow rounded-full flex items-center justify-center text-xs font-bold text-blue-600 border border-gray-100">
                                    {index + 1}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-gray-900 truncate">{athlete.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{athlete.position}</span>
                                    <span className="text-xs font-medium text-gray-500">{getCalculatedCategory(athlete.birthDate)}</span>
                                </div>
                            </div>
                            <div className="text-right pl-4">
                                <span className="block text-xs font-bold text-gray-400 uppercase">SCORE</span>
                                <span className={`text-xl font-bold ${athlete.averageScore >= 8 ? 'text-green-500' : athlete.averageScore >= 4 ? 'text-gray-600' : 'text-red-500'}`}>
                                    {athlete.averageScore > 0 ? athlete.averageScore.toFixed(1) : '--'}
                                </span>
                            </div>
                        </Link>
                    ))}
                    {displayAthletes.length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic">
                            Nenhum atleta encontrado com os filtros selecionados.
                        </div>
                    )}
                </div>
            </div>

            {/* Column 2: Best XI Field (Matched with Dashboard.tsx) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2 mb-6">
                    <Shirt className="text-green-600"/> Seleção do Momento (4-3-3)
                </h3>

                {/* Field Container - Aspect Ratio Optimized */}
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
                            /* LINK TO PUBLIC PROFILE */
                            <Link to={`/p/athlete/${pos.player.id}`} className="flex flex-col items-center">
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
        </div>
      </div>
    </div>
  );
};

export default PublicTeamDashboard;