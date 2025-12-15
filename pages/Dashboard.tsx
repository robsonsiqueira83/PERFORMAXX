import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Users, ClipboardList, TrendingUp, Trophy, Activity, Shirt, Calendar, Loader2, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { 
  getAthletes, 
  getCategories, 
  getTrainingEntries, 
  getTrainingSessions 
} from '../services/storageService';
import { calculateTotalScore, Position, Athlete, Category, TrainingSession, TrainingEntry, getCalculatedCategory, User, canEditData } from '../types';

interface DashboardProps {
  teamId: string;
}

const Dashboard: React.FC<DashboardProps> = ({ teamId }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Mobile Accordion State
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Custom Date Range State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // User for permissions
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Data State
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  useEffect(() => {
    // Get current user for permission check
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));

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
           if (!startDate || !endDate) return true; 
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

  // --- Best XI Logic (Field Distribution - 4-1-2-3) ---
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
    
    // Formation Logic based on User Request:
    // Goleiro, Laterais, Zagueiros, Volante, Meio campo, Atacantes, Centro avante

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
        
        // Defesa (Laterais + Zagueiros) - Slightly lowered for spacing
        { role: 'LE', player: laterais[0], style: { bottom: '22%', left: '15%' } }, 
        { role: 'ZC', player: zagueiros[0], style: { bottom: '16%', left: '38%' } }, 
        { role: 'ZC', player: zagueiros[1], style: { bottom: '16%', left: '62%' } }, 
        { role: 'LD', player: laterais[1], style: { bottom: '22%', left: '85%' } }, 
        
        // Volante (Central)
        { role: 'VOL', player: volante[0], style: { bottom: '35%', left: '50%' } }, 
        
        // Meio Campo (Ahead of Volante)
        { role: 'MC', player: meios[0], style: { bottom: '50%', left: '30%' } }, 
        { role: 'MC', player: meios[1], style: { bottom: '50%', left: '70%' } }, 
        
        // Ataque (Wingers) - Lowered from 70% to 65%
        { role: 'AT', player: atacantes[0], style: { bottom: '65%', left: '20%' } }, 
        { role: 'AT', player: atacantes[1], style: { bottom: '65%', left: '80%' } }, 
        
        // Centro Avante (Lowered from 80% to 75% to prevent top margin cut-off)
        { role: 'CA', player: centroavante[0], style: { bottom: '75%', left: '50%' } }, 
    ];
  }, [athletesWithScores, selectedCategory]);


  // --- Logic for Evolution Chart ---
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

  // --- Logic for Aggregate Stats ---
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

  const selectStyle = "bg-white border border-gray-300 text-gray-700 rounded-lg p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[150px] shadow-sm font-medium";

  return (
    <div className="space-y-8 pb-10">
      
      {/* MOBILE ACCORDION TOGGLE */}
      <div className="md:hidden">
          <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="w-full bg-white border border-gray-200 p-4 rounded-xl flex justify-between items-center shadow-sm text-blue-800 font-bold hover:bg-gray-50 transition-colors"
          >
              <span className="flex items-center gap-2"><Filter size={18} className="text-blue-600"/> Filtros e Opções</span>
              {showMobileFilters ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
          </button>
      </div>

      {/* FILTERS CONTAINER (Accordion on Mobile, Row on Desktop) */}
      <div className={`
          flex flex-col md:flex-row justify-between items-start md:items-end gap-6 
          ${showMobileFilters ? 'flex animate-fade-in' : 'hidden md:flex'} 
          bg-white md:bg-transparent p-6 md:p-0 rounded-xl shadow-sm md:shadow-none border md:border-none border-gray-100 mt-2 md:mt-0
      `}>
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto flex-wrap">
          {/* CATEGORY FILTER */}
          <div className="flex flex-col w-full md:w-auto">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Categoria</label>
             <div className="relative">
                 <select 
                   className={selectStyle}
                   value={selectedCategory}
                   onChange={(e) => setSelectedCategory(e.target.value)}
                 >
                   <option value="all">Todas</option>
                   {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
                 <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={14} />
             </div>
          </div>

          {/* POSITION FILTER */}
          <div className="flex flex-col w-full md:w-auto">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Posição</label>
             <div className="relative">
                 <select 
                   className={selectStyle}
                   value={selectedPosition}
                   onChange={(e) => setSelectedPosition(e.target.value)}
                 >
                   <option value="all">Todas</option>
                   {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                 </select>
                 <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={14} />
             </div>
          </div>

          {/* PERIOD FILTER */}
          <div className="flex flex-col w-full md:w-auto">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1 flex items-center gap-1"><Calendar size={10}/> Período</label>
             <div className="relative">
                 <select 
                   className={selectStyle}
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
                 <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={14} />
             </div>
          </div>
          
          {selectedPeriod === 'custom' && (
              <div className="flex gap-2 w-full md:w-auto">
                  <div className="flex flex-col w-1/2 md:w-auto">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Início</label>
                      <input 
                        type="date" 
                        className={selectStyle}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                  </div>
                  <div className="flex flex-col w-1/2 md:w-auto">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Fim</label>
                      <input 
                        type="date" 
                        className={selectStyle}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                  </div>
              </div>
          )}
        </div>

        {/* ACTION BUTTONS (Moved inside accordion on mobile for cleaner look) */}
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-none border-gray-100">
           <Link to="/athletes" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95">
              <Users size={18} />
              Atletas
           </Link>
           {/* HIDE NEW TRAINING IF READ ONLY */}
           {currentUser && canEditData(currentUser.role) && (
               <Link to="/training" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#4ade80] hover:bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95">
                  <ClipboardList size={18} />
                  Nova Atuação
               </Link>
           )}
        </div>
      </div>

      {/* Top 3 Ranking (Improved Visuals) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {rankedAthletes.map((athlete, index) => {
             // Styling based on Rank
             let rankColor = "bg-gray-100 text-gray-600";
             let cardBorder = "border-gray-100";
             let gradient = "from-white to-gray-50";
             
             if (index === 0) { 
                 rankColor = "bg-yellow-100 text-yellow-700 border-yellow-200"; 
                 cardBorder = "border-yellow-200 ring-1 ring-yellow-100";
                 gradient = "from-yellow-50/50 to-white";
             } else if (index === 1) {
                 rankColor = "bg-slate-200 text-slate-700 border-slate-300";
                 cardBorder = "border-slate-200";
                 gradient = "from-slate-50 to-white";
             } else if (index === 2) {
                 rankColor = "bg-orange-100 text-orange-800 border-orange-200";
                 cardBorder = "border-orange-200";
                 gradient = "from-orange-50/50 to-white";
             }

             return (
             <div key={athlete.id} className={`bg-gradient-to-br ${gradient} rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-5 border ${cardBorder} relative overflow-hidden group`}>
                 <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Trophy size={80} />
                 </div>
                 
                 <div className="flex items-center gap-4 relative z-10">
                     <div className="relative">
                        {athlete.photoUrl ? (
                            <img src={athlete.photoUrl} alt={athlete.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-gray-400 text-xl font-bold border-2 border-gray-100 shadow-sm">
                                {athlete.name.charAt(0)}
                            </div>
                        )}
                        <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border ${rankColor}`}>
                            #{index + 1}
                        </div>
                     </div>
                     <div>
                         <h3 className="font-bold text-gray-800 truncate max-w-[140px] text-lg leading-tight">{athlete.name}</h3>
                         <div className="flex flex-col gap-0.5 mt-1">
                             <span className="text-xs text-gray-500 font-medium">{getCalculatedCategory(athlete.birthDate)}</span>
                             <span className="text-xs text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded w-fit">{athlete.position}</span>
                         </div>
                     </div>
                 </div>
                 
                 <div className="mt-5 pt-4 border-t border-gray-200/60 flex justify-between items-end">
                     <div>
                         <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Score Médio</span>
                         <div className="text-3xl font-black text-gray-800 leading-none mt-0.5">{athlete.averageScore}</div>
                     </div>
                     <Link to={`/athletes/${athlete.id}`} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                         Ver Perfil
                     </Link>
                 </div>
             </div>
         )})}
         {rankedAthletes.length === 0 && (
             <div className="col-span-3 p-12 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-2">
                 <Users size={32} className="opacity-20"/>
                 <p>{filteredEntries.length === 0 ? "Nenhum dado encontrado para o período selecionado." : "Dados insuficientes para gerar ranking."}</p>
             </div>
         )}
      </div>

      {/* Football Field Visualization - Best XI */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <div className="bg-green-100 p-2 rounded-lg text-green-700"><Shirt size={20}/></div>
                Seleção do Momento (4-3-3)
             </h3>
             {selectedCategory !== 'all' && (
                 <span className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full border border-gray-200">
                     {categories.find(c => c.id === selectedCategory)?.name}
                 </span>
             )}
         </div>
         
         {/* Field Container with improved gradient */}
         <div className="relative w-full aspect-[3/4] md:aspect-[16/9] lg:aspect-[2/1] bg-gradient-to-b from-green-600 to-green-700 rounded-xl overflow-hidden border-4 border-green-800 shadow-inner">
             {/* Field Pattern (Stripes) */}
             <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.2) 50%)', backgroundSize: '10% 100%'}}></div>

             {/* Field Markings */}
             <div className="absolute inset-4 border-2 border-white/60 rounded-sm pointer-events-none"></div>
             <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/60 transform -translate-y-1/2 pointer-events-none"></div>
             <div className="absolute top-1/2 left-1/2 w-24 h-24 md:w-32 md:h-32 border-2 border-white/60 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
             
             {/* Goals Areas */}
             <div className="absolute bottom-4 left-1/2 w-48 h-24 border-2 border-white/60 border-b-0 transform -translate-x-1/2 bg-transparent pointer-events-none"></div>
             <div className="absolute top-4 left-1/2 w-48 h-24 border-2 border-white/60 border-t-0 transform -translate-x-1/2 bg-transparent pointer-events-none"></div>

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
                                 <img src={pos.player.photoUrl} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white shadow-lg object-cover bg-white" alt={pos.player.name} />
                             ) : (
                                 <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white shadow-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                     {pos.player.name.charAt(0)}
                                 </div>
                             )}
                             <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow border border-white">
                                 {pos.player.averageScore}
                             </div>
                          </div>
                          <div className="mt-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-white text-[9px] md:text-[10px] font-bold text-center truncate max-w-[80px] shadow-sm border border-white/20">
                              {pos.player.name.split(' ')[0]}
                          </div>
                      </Link>
                   ) : (
                       <div className="opacity-40 flex flex-col items-center hover:opacity-60 transition-opacity">
                           <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/70 bg-white/10 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                               {pos.role}
                           </div>
                       </div>
                   )}
                </div>
             ))}
         </div>
      </div>

      <div className="border-t border-gray-200 my-8"></div>
      
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 px-1">
         <Activity className="text-blue-600"/> 
         Média Geral {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : ''}
      </h2>

      {/* TACTICAL CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4 text-sm uppercase tracking-wide border-b border-purple-50 pb-2">Defendendo (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_def ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_def}>
                        <PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Defendendo" dataKey="A" stroke={defColor.stroke} fill={defColor.fill} fillOpacity={0.4} /><RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados suficientes</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4 text-sm uppercase tracking-wide border-b border-purple-50 pb-2">Construindo (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_const ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_const}>
                        <PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Construindo" dataKey="A" stroke={constColor.stroke} fill={constColor.fill} fillOpacity={0.4} /><RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados suficientes</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4 text-sm uppercase tracking-wide border-b border-purple-50 pb-2">Último Terço (Média)</h3>
              <div className="h-[250px]">
                 {teamStats && teamStats.tactical_ult ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teamStats.tactical_ult}>
                        <PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Último Terço" dataKey="A" stroke={ultColor.stroke} fill={ultColor.fill} fillOpacity={0.4} /><RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados suficientes</div>}
              </div>
          </div>
      </div>

      {/* TECH/PHYS Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-blue-700 mb-4 text-sm uppercase tracking-wide border-b border-blue-50 pb-2">Fundamentos (Média)</h3>
              <div className="h-[300px]">
                 {teamStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamStats.technical}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                        <Radar name="Fundamentos" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados suficientes</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-orange-700 mb-4 text-sm uppercase tracking-wide border-b border-orange-50 pb-2">Condição Físico (Média)</h3>
               <div className="h-[300px]">
                 {teamStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamStats.physical}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                        <Radar name="Físico" dataKey="A" stroke="#ea580c" fill="#f97316" fillOpacity={0.4} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados suficientes</div>}
              </div>
          </div>
      </div>

      {/* Evolution Line Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-6">
         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
            <TrendingUp size={20} className="text-green-600"/>
            Evolução Score Médio {selectedCategory !== 'all' ? `(${categories.find(c => c.id === selectedCategory)?.name})` : ''}
         </h3>
         <div className="h-[300px]">
             {evolutionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={evolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="date" fontSize={11} stroke="#9ca3af" tickMargin={10} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 10]} fontSize={11} stroke="#9ca3af" axisLine={false} tickLine={false} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                        <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} dot={{r: 4, fill: '#10b981'}} />
                    </LineChart>
                </ResponsiveContainer>
             ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados históricos para o período selecionado</div>}
         </div>
      </div>

    </div>
  );
};

export default Dashboard;