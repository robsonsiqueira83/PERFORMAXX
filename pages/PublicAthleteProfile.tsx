import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  getTeams,
  getCategories
} from '../services/storageService';
import { calculateTotalScore, TrainingEntry, Athlete, TrainingSession, getCalculatedCategory, calculateCategoryAverage, HeatmapPoint } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { ArrowLeft, User, TrendingUp, TrendingDown, FileText, Loader2, Calendar } from 'lucide-react';
import HeatmapField from '../components/HeatmapField';
import PublicHeader from '../components/PublicHeader';

const tacticalLabels: Record<string, string> = {
  const_passe: 'Passe',
  const_jogo_costas: 'Jogo de costas',
  const_dominio: 'Domínio',
  const_1v1_ofensivo: '1v1 ofensivo',
  const_movimentacao: 'Movimentação',
  ult_finalizacao: 'Finalização',
  ult_desmarques: 'Desmarques de ruptura',
  ult_passes_ruptura: 'Passes de ruptura',
  def_compactacao: 'Compactação',
  def_recomposicao: 'Tempo/Intensidade de Recomposição',
  def_salto_pressao: 'Salto de pressão',
  def_1v1_defensivo: '1v1 defensivo',
  def_duelos_aereos: 'Duelos aéreos'
};

const PublicAthleteProfile: React.FC = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const [loading, setLoading] = useState(true);

  // Data State
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [team, setTeam] = useState<any | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);

  // Filtering State
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);

  useEffect(() => {
     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allTeams] = await Promise.all([
             getAthletes(),
             getTrainingEntries(),
             getTrainingSessions(),
             getTeams()
         ]);
         
         const foundAthlete = allAthletes.find(a => a.id === athleteId);
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setTeam(allTeams.find(t => t.id === foundAthlete.teamId) || null);
             setEntries(allEntries.filter(e => e.athleteId === athleteId));
             setSessions(allSessions);
         }
         setLoading(false);
     };
     load();
  }, [athleteId]);

  // Full History Data
  const historyData = useMemo(() => {
    return entries.map(entry => {
      const session = sessions.find(s => s.id === entry.sessionId);
      if (!session) return null;
      return {
        id: entry.id,
        date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        fullDate: session.date,
        score: calculateTotalScore(entry.technical, entry.physical, entry.tactical),
        technical: entry.technical,
        physical: entry.physical,
        tactical: entry.tactical,
        heatmapPoints: entry.heatmapPoints || [],
        entry: entry
      };
    }).filter(Boolean).sort((a, b) => new Date(a!.fullDate).getTime() - new Date(b!.fullDate).getTime());
  }, [entries, sessions]);

  // Filtered Data
  const filteredEntries = useMemo(() => {
    const now = new Date();
    return entries.filter(e => {
        const session = sessions.find(s => s.id === e.sessionId);
        if (!session) return false;
        const sIso = session.date;
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
  }, [entries, sessions, selectedPeriod]);

  // Overall Score
  const overallScore = useMemo(() => {
    if (filteredEntries.length === 0) return 0;
    const getScore = (e: TrainingEntry) => calculateTotalScore(e.technical, e.physical, e.tactical);
    const total = filteredEntries.reduce((acc, curr) => acc + getScore(curr), 0);
    return total / filteredEntries.length;
  }, [filteredEntries]);

  // Aggregate Heatmap
  const aggregateHeatmapPoints = useMemo(() => {
      let allPoints: HeatmapPoint[] = [];
      filteredEntries.forEach(e => {
          if (e.heatmapPoints) allPoints = [...allPoints, ...e.heatmapPoints];
      });
      return allPoints;
  }, [filteredEntries]);

  // Radar Data
  const currentStats = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    const dataToAverage = filteredEntries;
    const avg = (key: string, type: 'technical' | 'physical' | 'tactical') => {
      let count = 0;
      const sum = dataToAverage.reduce((acc, curr) => {
          const group = curr[type] as any;
          if (group) {
              count++;
              return acc + (group[key] || 0);
          }
          return acc;
      }, 0);
      return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    };

    return {
      technical: [
        { subject: 'Controle', A: avg('controle', 'technical'), fullMark: 10 },
        { subject: 'Passe', A: avg('passe', 'technical'), fullMark: 10 },
        { subject: 'Finalização', A: avg('finalizacao', 'technical'), fullMark: 10 },
        { subject: 'Drible', A: avg('drible', 'technical'), fullMark: 10 },
        { subject: 'Cabeceio', A: avg('cabeceio', 'technical'), fullMark: 10 },
        { subject: 'Posição', A: avg('posicao', 'technical'), fullMark: 10 },
      ],
      physical: [
        { subject: 'Velocidade', A: avg('velocidade', 'physical'), fullMark: 10 },
        { subject: 'Agilidade', A: avg('agilidade', 'physical'), fullMark: 10 },
        { subject: 'Força', A: avg('forca', 'physical'), fullMark: 10 },
        { subject: 'Resistência', A: avg('resistencia', 'physical'), fullMark: 10 },
        { subject: 'Coordenação', A: avg('coordenacao', 'physical'), fullMark: 10 },
        { subject: 'Equilíbrio', A: avg('equilibrio', 'physical'), fullMark: 10 },
      ],
      tactical_const: [
        { subject: tacticalLabels.const_passe, A: avg('const_passe', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.const_jogo_costas, A: avg('const_jogo_costas', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.const_dominio, A: avg('const_dominio', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.const_1v1_ofensivo, A: avg('const_1v1_ofensivo', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.const_movimentacao, A: avg('const_movimentacao', 'tactical'), fullMark: 10 },
      ],
      tactical_ult: [
        { subject: tacticalLabels.ult_finalizacao, A: avg('ult_finalizacao', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.ult_desmarques, A: avg('ult_desmarques', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.ult_passes_ruptura, A: avg('ult_passes_ruptura', 'tactical'), fullMark: 10 },
      ],
      tactical_def: [
        { subject: tacticalLabels.def_compactacao, A: avg('def_compactacao', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.def_recomposicao, A: avg('def_recomposicao', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.def_salto_pressao, A: avg('def_salto_pressao', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.def_1v1_defensivo, A: avg('def_1v1_defensivo', 'tactical'), fullMark: 10 },
        { subject: tacticalLabels.def_duelos_aereos, A: avg('def_duelos_aereos', 'tactical'), fullMark: 10 },
      ]
    };
  }, [filteredEntries]);

  // Performance Rankings
  const performanceAnalysis = useMemo(() => {
    if (!currentStats) return { best: [], worst: [] };
    let allStats: { label: string; score: number; type: string }[] = [];
    
    const addStats = (list: any[], type: string) => list.forEach(item => allStats.push({ label: item.subject, score: item.A, type }));
    const hasTactical = filteredEntries.some(e => e.tactical !== undefined && e.tactical !== null);

    addStats(currentStats.technical, 'Técnico');
    addStats(currentStats.physical, 'Físico');
    if (hasTactical) {
        addStats(currentStats.tactical_const, 'Tático');
        addStats(currentStats.tactical_ult, 'Tático');
        addStats(currentStats.tactical_def, 'Tático');
    }

    allStats.sort((a, b) => b.score - a.score);
    return { 
        best: allStats.slice(0, 3), 
        worst: [...allStats].sort((a, b) => a.score - b.score).slice(0, 3) 
    };
  }, [currentStats, filteredEntries]);

  // Helper colors
  const getTacticalColor = (data: any[]) => {
      if (!data || data.length === 0) return { stroke: '#8884d8', fill: '#8884d8' };
      const avg = data.reduce((sum, item) => sum + item.A, 0) / data.length;
      if (avg < 4) return { stroke: '#ef4444', fill: '#ef4444' };
      if (avg < 8) return { stroke: '#f97316', fill: '#f97316' };
      return { stroke: '#22c55e', fill: '#22c55e' };
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-10 text-center text-gray-500">Atleta não encontrado.</div>;

  const constColor = currentStats ? getTacticalColor(currentStats.tactical_const) : { stroke: '#7e22ce', fill: '#a855f7' };
  const ultColor = currentStats ? getTacticalColor(currentStats.tactical_ult) : { stroke: '#9333ea', fill: '#d8b4fe' };
  const defColor = currentStats ? getTacticalColor(currentStats.tactical_def) : { stroke: '#6b21a8', fill: '#a855f7' };

  const formatBirthDate = (dateString: string) => {
     if (!dateString) return '';
     const datePart = dateString.split('T')[0];
     const [year, month, day] = datePart.split('-');
     return `${day}/${month}/${year}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <PublicHeader team={team} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* LINK TO PUBLIC TEAM DASHBOARD */}
        <Link to={`/p/team/${athlete.teamId}`} className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 mb-4 transition-colors">
            <ArrowLeft size={20} /> Voltar para o time
        </Link>

        {/* --- HEADER --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-6">
                   {athlete.photoUrl ? (
                        <img src={athlete.photoUrl} className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-md" />
                   ) : (
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-blue-100 flex items-center justify-center text-4xl font-bold text-blue-600">
                             {athlete.name.charAt(0)}
                        </div>
                   )}
                   <div>
                        <h1 className="text-3xl font-bold text-gray-900">{athlete.name}</h1>
                        <div className="flex flex-wrap gap-2 mt-2">
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold">{athlete.position}</span>
                            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded font-bold">{getCalculatedCategory(athlete.birthDate)}</span>
                            <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded font-medium">Nasc: {formatBirthDate(athlete.birthDate)}</span>
                        </div>
                   </div>
                </div>

                <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <label className="text-xs font-bold text-gray-500">PERÍODO:</label>
                        <select 
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                            className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm font-semibold"
                        >
                            <option value="all">Todo o Período</option>
                            <option value="today">Hoje</option>
                            <option value="week">Últimos 7 dias</option>
                            <option value="month">Últimos 30 dias</option>
                            <option value="year">Este Ano</option>
                        </select>
                    </div>

                    <div className="text-center px-6 py-2 bg-gray-50 rounded-xl border border-gray-100 min-w-[140px]">
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Média Geral</span>
                        <span className={`block text-5xl font-black ${overallScore >= 8 ? 'text-[#4ade80]' : overallScore >= 4 ? 'text-gray-500' : 'text-red-500'}`}>
                            {overallScore > 0 ? overallScore.toFixed(1) : '--'}
                        </span>
                    </div>
                </div>
             </div>
        </div>

        {/* --- HEATMAP & ANALYSIS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-xl">
                    <HeatmapField 
                        points={aggregateHeatmapPoints} 
                        readOnly={true} 
                        label="Mapa de Calor (Posicionamento)"
                        perspective={true} 
                    />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <TrendingUp className="text-blue-600" /> Análise de Desempenho
                </h3>
                {filteredEntries.length > 0 ? (
                    <div className="flex-1 flex flex-col justify-center gap-6">
                        <div>
                            <h4 className="text-sm font-bold text-green-600 uppercase mb-3 border-b border-green-100 pb-1">Destaques (Melhores)</h4>
                            <div className="space-y-3">
                                {performanceAnalysis.best.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-green-50 px-3 py-2 rounded-lg">
                                        <div><span className="font-bold text-gray-800 text-sm">{item.label}</span><span className="text-xs text-gray-500 ml-2">({item.type})</span></div>
                                        <span className="text-green-700 font-bold">{item.score.toFixed(1)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="w-full border-t border-dashed border-gray-200"></div>
                        <div>
                            <h4 className="text-sm font-bold text-red-500 uppercase mb-3 border-b border-red-100 pb-1">Pontos de Atenção</h4>
                            <div className="space-y-3">
                                {performanceAnalysis.worst.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-red-50 px-3 py-2 rounded-lg">
                                        <div><span className="font-bold text-gray-800 text-sm">{item.label}</span><span className="text-xs text-gray-500 ml-2">({item.type})</span></div>
                                        <span className="text-red-600 font-bold">{item.score.toFixed(1)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 italic">Sem dados suficientes.</div>
                )}
            </div>
        </div>

        {/* --- RADAR CHARTS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Construindo</h3>
                <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%">{currentStats?.tactical_const ? <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_const}><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Construindo" dataKey="A" stroke={constColor.stroke} fill={constColor.fill} fillOpacity={0.4} /><RechartsTooltip /></RadarChart> : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}</ResponsiveContainer></div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Último Terço</h3>
                <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%">{currentStats?.tactical_ult ? <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_ult}><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Último Terço" dataKey="A" stroke={ultColor.stroke} fill={ultColor.fill} fillOpacity={0.4} /><RechartsTooltip /></RadarChart> : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}</ResponsiveContainer></div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Defendendo</h3>
                <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%">{currentStats?.tactical_def ? <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_def}><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Defendendo" dataKey="A" stroke={defColor.stroke} fill={defColor.fill} fillOpacity={0.4} /><RechartsTooltip /></RadarChart> : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}</ResponsiveContainer></div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-blue-700 mb-4">Perfil Técnico</h3>
                <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">{currentStats ? <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentStats.technical}><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} /><Radar name="Técnico" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} /><RechartsTooltip /></RadarChart> : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}</ResponsiveContainer></div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-orange-700 mb-4">Perfil Físico</h3>
                <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">{currentStats ? <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentStats.physical}><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} /><Radar name="Físico" dataKey="A" stroke="#ea580c" fill="#f97316" fillOpacity={0.4} /><RechartsTooltip /></RadarChart> : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}</ResponsiveContainer></div>
            </div>
        </div>

        {/* --- EVOLUTION CHART --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <h3 className="font-bold text-gray-800 mb-4">Evolução do Score Total</h3>
            <div className="h-[300px]">
                {historyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" fontSize={12} stroke="#9ca3af" />
                            <YAxis domain={[0, 10]} fontSize={12} stroke="#9ca3af" />
                            <RechartsTooltip />
                            <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados históricos</div>}
            </div>
        </div>

        {/* --- HISTORY LIST (READ ONLY) --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-gray-800">Histórico de Atuações</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {historyData.map((item) => (
                    /* Read Only View - No edit buttons */
                    <div key={item!.id} onClick={() => setViewingEntry(item)} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-800">{item!.date}</span>
                                <span className={`text-xs px-2 py-0.5 rounded font-bold ${item!.score >= 8 ? 'bg-green-100 text-green-800' : item!.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>Score: {item!.score.toFixed(1)}</span>
                            </div>
                            <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                <span>Técnica: {calculateCategoryAverage(item!.technical).toFixed(1)}</span>
                                <span>Físico: {calculateCategoryAverage(item!.physical).toFixed(1)}</span>
                                {item!.tactical && <span>Tático: {calculateCategoryAverage(item!.tactical).toFixed(1)}</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* View Detail Modal (Simplified) */}
        {viewingEntry && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto relative animate-fade-in">
                    <button onClick={() => setViewingEntry(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">X</button>
                    <div className="flex items-center gap-3 mb-6 border-b pb-4">
                        <div>
                            <h3 className="font-bold text-xl text-gray-800">Detalhes da Atuação</h3>
                            <p className="text-sm text-gray-500">{viewingEntry.date}</p>
                        </div>
                    </div>
                    {viewingEntry.heatmapPoints?.length > 0 && <div className="mb-6"><HeatmapField points={viewingEntry.heatmapPoints} readOnly={true} label="Posicionamento" /></div>}
                    {viewingEntry.entry.notes && <div className="bg-yellow-50 p-4 mb-6 rounded"><p className="text-sm italic text-gray-700">{viewingEntry.entry.notes}</p></div>}
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                             <h4 className="font-bold text-xs uppercase text-blue-500 mb-2 border-b">Técnica</h4>
                             {Object.entries(viewingEntry.technical).map(([k,v]:any)=><div key={k} className="flex justify-between text-xs capitalize"><span>{k}</span><span className="font-bold">{v}</span></div>)}
                         </div>
                         <div>
                             <h4 className="font-bold text-xs uppercase text-orange-500 mb-2 border-b">Físico</h4>
                             {Object.entries(viewingEntry.physical).map(([k,v]:any)=><div key={k} className="flex justify-between text-xs capitalize"><span>{k}</span><span className="font-bold">{v}</span></div>)}
                         </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default PublicAthleteProfile;