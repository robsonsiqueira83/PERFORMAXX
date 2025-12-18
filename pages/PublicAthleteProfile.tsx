
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  getTeams,
  getCategories
} from '../services/storageService';
// Removed non-existent calculateCategoryAverage from import
import { calculateTotalScore, TrainingEntry, Athlete, TrainingSession, getCalculatedCategory, HeatmapPoint } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { ArrowLeft, User, TrendingUp, TrendingDown, FileText, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronDown, PlayCircle, PauseCircle, X, RefreshCcw } from 'lucide-react';
import HeatmapField from '../components/HeatmapField';
import PublicHeader from '../components/PublicHeader';

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
  const [customDate, setCustomDate] = useState<string>('');
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);
  
  // Calendar State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const calendarRef = useRef<HTMLDivElement>(null);

  // Replay Modal State
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [replayData, setReplayData] = useState<any>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef<number | null>(null);

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

  // Close calendar on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [calendarRef]);

  // REPLAY LOGIC
  useEffect(() => {
      if (isReplaying && replayData && replayData.events) {
          replayTimerRef.current = window.setInterval(() => {
              setReplayIndex(prev => {
                  const next = prev + 1;
                  if (next >= replayData.events.length) {
                      setIsReplaying(false);
                      return prev;
                  }
                  return next;
              });
          }, 2000); // 2 seconds per event step
      } else {
          if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      }
      return () => { if (replayTimerRef.current) clearInterval(replayTimerRef.current); };
  }, [isReplaying, replayData]);

  // Handle Select Change
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setSelectedPeriod(val);
      if (val === 'custom') {
          setIsCalendarOpen(true);
      } else {
          setIsCalendarOpen(false);
          setCustomDate('');
      }
  };

  const handleResetFilter = () => {
      setSelectedPeriod('all');
      setCustomDate('');
  };

  // Full History Data
  const historyData = useMemo(() => {
    return entries.map(entry => {
      const session = sessions.find(s => s.id === entry.sessionId);
      if (!session) return null;
      
      const isRealTime = session.description?.includes('Análise em Tempo Real');

      return {
        id: entry.id,
        date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        fullDate: session.date,
        score: calculateTotalScore(entry.technical, entry.physical, entry.tactical),
        technical: entry.technical,
        physical: entry.physical,
        tactical: entry.tactical,
        heatmapPoints: entry.heatmapPoints || [],
        entry: entry,
        isRealTime
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
            case 'custom':
                return customDate ? sIso === customDate : true;
            case 'all':
            default:
                return true;
        }
    });
  }, [entries, sessions, selectedPeriod, customDate]);

  // Filtered History List (Syncs with Calendar)
  const displayedHistory = useMemo(() => {
      const filteredIds = new Set(filteredEntries.map(e => e.id));
      return historyData.filter(h => h && filteredIds.has(h.id));
  }, [historyData, filteredEntries]);

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

  // Performance Rankings
  const performanceAnalysis = useMemo(() => {
    if (!currentStats) return { best: [], worst: [] };
    let allStats: { label: string; score: number; type: string }[] = [];
    
    const addStats = (list: any[], type: string) => list.forEach(item => allStats.push({ label: item.subject, score: item.A, type }));
    const hasTactical = filteredEntries.some(e => e.tactical !== undefined && e.tactical !== null);

    addStats(currentStats.technical, 'Fundamentos');
    addStats(currentStats.physical, 'Físico');
    if (hasTactical) {
        addStats(currentStats.tactical_def, 'Tático Def');
        addStats(currentStats.tactical_const, 'Tático Cons');
        addStats(currentStats.tactical_ult, 'Tático Ult');
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

  // Calendar Logic
  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      return { days, firstDay };
  };
  const { days: daysInMonth, firstDay } = getDaysInMonth(calendarMonth);
  const getSessionDatesMap = () => {
      const map = new Map<string, string>(); // Date -> Type (RealTime or Regular)
      historyData.forEach(h => { 
          if (h && h.fullDate) {
              map.set(h.fullDate, h.isRealTime ? 'realtime' : 'regular');
          } 
      });
      return map;
  };
  const sessionDates = getSessionDatesMap();
  
  const handleDateSelect = (day: number) => {
      const year = calendarMonth.getFullYear();
      const month = String(calendarMonth.getMonth() + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayStr}`;
      
      setCustomDate(dateStr);
      setSelectedPeriod('custom');
      setIsCalendarOpen(false);
  };
  
  const changeMonth = (offset: number) => {
      const newDate = new Date(calendarMonth);
      newDate.setMonth(newDate.getMonth() + offset);
      setCalendarMonth(newDate);
  };

  const handleHistoryItemClick = (item: any) => {
      if (item.isRealTime && item.entry.notes) {
          try {
              const parsed = JSON.parse(item.entry.notes);
              if (parsed.type === 'REAL_TIME_LOG' && parsed.events) {
                  setReplayData(parsed);
                  setReplayIndex(0);
                  setIsReplaying(false);
                  setShowReplayModal(true);
                  return;
              }
          } catch(e) {
              // fallback to regular modal
          }
      }
      setViewingEntry(item);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-10 text-center text-gray-500">Atleta não encontrado.</div>;

  const defColor = currentStats ? getTacticalColor(currentStats.tactical_def) : { stroke: '#6b21a8', fill: '#a855f7' };
  const constColor = currentStats ? getTacticalColor(currentStats.tactical_const) : { stroke: '#7e22ce', fill: '#a855f7' };
  const ultColor = currentStats ? getTacticalColor(currentStats.tactical_ult) : { stroke: '#9333ea', fill: '#d8b4fe' };

  const formatBirthDate = (dateString: string) => {
     if (!dateString) return '';
     const datePart = dateString.split('T')[0];
     const [year, month, day] = datePart.split('-');
     return `${day}/${month}/${year}`;
  };

  // Activity Mini Calendar Renderer
  const renderActivityCalendar = () => {
      const currentMonthDates = Array.from({length: daysInMonth}, (_, i) => {
          const d = i + 1;
          const full = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const type = sessionDates.get(full); // 'realtime' | 'regular' | undefined
          return { d, full, type };
      });

      return (
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm w-full h-auto min-h-[300px] flex flex-col">
              <div className="flex justify-between items-center mb-4 shrink-0">
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{calendarMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  <div className="flex gap-2">
                      <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft size={16}/></button>
                      <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronRight size={16}/></button>
                  </div>
              </div>
              <div className="flex-1 flex flex-col justify-center gap-2">
                  <div className="grid grid-cols-7 gap-1 mb-1">
                      {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-[10px] text-center font-bold text-gray-400">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                      {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
                      {currentMonthDates.map(day => {
                          const isSelected = customDate === day.full && selectedPeriod === 'custom';
                          return (
                              <button 
                                key={day.d}
                                onClick={() => handleDateSelect(day.d)}
                                className={`aspect-square rounded-lg flex items-center justify-center text-xs transition-colors relative
                                    ${day.type === 'realtime' ? 'bg-purple-100 text-purple-700 font-bold border border-purple-200 hover:bg-purple-200' : 
                                      day.type === 'regular' ? 'bg-green-100 text-green-700 font-bold border border-green-200 hover:bg-green-200' : 
                                      'text-gray-400 hover:bg-gray-50'}
                                    ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                                `}
                              >
                                  {day.d}
                              </button>
                          );
                      })}
                  </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                  {selectedPeriod === 'custom' && customDate ? (
                      <button 
                          onClick={handleResetFilter}
                          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-lg transition-colors"
                      >
                          <RefreshCcw size={12} /> Limpar Data ({new Date(customDate).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})})
                      </button>
                  ) : (
                      <div className="flex gap-4 justify-center shrink-0">
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium"><div className="w-2.5 h-2.5 bg-green-100 border border-green-200 rounded"></div> Atuação</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium"><div className="w-2.5 h-2.5 bg-purple-100 border border-purple-200 rounded"></div> Tempo Real</div>
                      </div>
                  )}
              </div>
          </div>
      );
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
                    <div className="flex items-center gap-2 mb-2 relative" ref={calendarRef}>
                        <label className="text-xs font-bold text-gray-500">PERÍODO:</label>
                        <div className="relative">
                            <select 
                                value={selectedPeriod}
                                onChange={handlePeriodChange}
                                className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm font-semibold appearance-none pr-8 cursor-pointer"
                            >
                                <option value="all">Todo o Período</option>
                                <option value="today">Hoje</option>
                                <option value="week">Últimos 7 dias</option>
                                <option value="month">Últimos 30 dias</option>
                                <option value="year">Este Ano</option>
                                <option value="custom">Data Específica...</option>
                            </select>
                            <ChevronDown size={14} className="text-gray-400 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                        </div>
                        {isCalendarOpen && (
                             <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4 animate-fade-in">
                                 <div className="flex items-center justify-between mb-2 px-1">
                                    <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
                                    <span className="text-sm font-bold text-gray-800 capitalize">{calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                                    <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
                                 </div>
                                 <div className="grid grid-cols-7 gap-1 text-center mb-1">{['D','S','T','Q','Q','S','S'].map(d => <span key={d} className="text-[10px] text-gray-400 font-bold">{d}</span>)}</div>
                                 <div className="grid grid-cols-7 gap-1">
                                    {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
                                    {Array(daysInMonth).fill(null).map((_, i) => {
                                        const day = i + 1;
                                        const fullDate = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isSelected = customDate === fullDate;
                                        return (
                                            <button key={day} onClick={() => handleDateSelect(day)} className={`h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-100 text-gray-700'}`}>{day}</button>
                                        );
                                    })}
                                 </div>
                             </div>
                         )}
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
                            <h4 className="text-sm font-bold text-green-600 uppercase mb-3 border-b border-green-100 pb-1 flex items-center gap-2"><TrendingUp size={16} /> Destaques (Melhores)</h4>
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
                            <h4 className="text-sm font-bold text-red-500 uppercase mb-3 border-b border-red-100 pb-1 flex items-center gap-2"><TrendingDown size={16} /> Pontos de Atenção</h4>
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
                    <div className="flex-1 flex items-center justify-center text-gray-400 italic">Sem dados suficientes para análise neste período.</div>
                )}
            </div>
        </div>

        {/* --- ATRIBUTOS TÉCNICOS E TÁTICOS (2ª Linha) --- */}
        <h3 className="text-xl font-bold text-gray-800 mt-2 mb-4">Atributos Técnicos e Táticos</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Defendendo */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Defendendo</h3>
                <div className="h-[250px]">
                    {currentStats && currentStats.tactical_def ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_def}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                            <Radar name="Defendendo" dataKey="A" stroke={defColor.stroke} fill={defColor.fill} fillOpacity={0.4} />
                            <RechartsTooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
                </div>
            </div>
            {/* Construindo */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Construindo</h3>
                <div className="h-[250px]">
                    {currentStats && currentStats.tactical_const ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_const}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                            <Radar name="Construindo" dataKey="A" stroke={constColor.stroke} fill={constColor.fill} fillOpacity={0.4} />
                            <RechartsTooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
                </div>
            </div>
            {/* Último Terço */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-purple-700 mb-4">Último Terço</h3>
                <div className="h-[250px]">
                    {currentStats && currentStats.tactical_ult ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentStats.tactical_ult}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                            <Radar name="Último Terço" dataKey="A" stroke={ultColor.stroke} fill={ultColor.fill} fillOpacity={0.4} />
                            <RechartsTooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
                </div>
            </div>
        </div>

        {/* --- FUNDAMENTOS E CONDIÇÃO FÍSICA (3ª Linha) --- */}
        <h3 className="text-xl font-bold text-gray-800 mt-6 mb-4">Fundamentos e Físico</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-blue-700 mb-4">Fundamentos (Média)</h3>
                <div className="h-[300px]">
                    {currentStats ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentStats.technical}>
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
                <h3 className="font-bold text-orange-700 mb-4">Condição Física (Média)</h3>
                <div className="h-[300px]">
                    {currentStats ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentStats.physical}>
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

        {/* --- EVOLUTION CHART & CALENDAR --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Evolução do Score Total</h3>
                <div className="h-[300px]">
                    {historyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={historyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="date" fontSize={12} stroke="#9ca3af" tickMargin={10} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 10]} fontSize={12} stroke="#9ca3af" axisLine={false} tickLine={false} />
                                <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                                <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8, fill: '#10b981', stroke: 'white' }} dot={{r: 4, fill: '#10b981'}} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sem dados históricos</div>}
                </div>
            </div>
            
            <div className="flex flex-col">
                {renderActivityCalendar()}
            </div>
        </div>

        {/* --- HISTORY LIST (READ ONLY) --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Histórico de Atuações</h3>
                {selectedPeriod === 'custom' && customDate && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">
                        Filtro: {new Date(customDate).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}
                    </span>
                )}
            </div>
            <div className="divide-y divide-gray-100">
                {displayedHistory.map((item) => (
                    <div key={item!.id} onClick={() => handleHistoryItemClick(item)} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-gray-800">{item!.date}</span>
                                {item!.isRealTime && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold uppercase">Tempo Real</span>}
                                <span className={`text-xs px-2 py-0.5 rounded font-bold ${item!.score >= 8 ? 'bg-green-100 text-green-800' : item!.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>Score: {item!.score.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                ))}
                {displayedHistory.length === 0 && (
                    <div className="p-8 text-center text-gray-400 italic">
                        {selectedPeriod === 'custom' ? 'Nenhuma atuação nesta data.' : 'Nenhuma atuação registrada no período.'}
                    </div>
                )}
            </div>
        </div>

        {/* REPLAY MODAL */}
        {showReplayModal && replayData && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
                  <div className="p-4 bg-gray-900 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="font-bold flex items-center gap-2"><PlayCircle size={18} /> Replay da Sessão</h3>
                          <p className="text-xs text-gray-400">{new Date(replayData.startTime).toLocaleString()} • {replayData.events.length} ações</p>
                      </div>
                      <button onClick={() => setShowReplayModal(false)}><X className="text-gray-400 hover:text-white" /></button>
                  </div>
                  
                  {/* FIELD AREA */}
                  <div className="relative aspect-[16/9] bg-green-600 border-b-4 border-green-800 shrink-0">
                      {/* Field Background (Static Lines) */}
                      <div className="absolute inset-0 pointer-events-none opacity-50">
                          <div className="absolute inset-4 border-2 border-white rounded-sm"></div>
                          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white"></div>
                          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                      </div>

                      {/* Animated Marker */}
                      {replayData.events[replayIndex] && (
                          <div 
                            className="absolute w-6 h-6 bg-yellow-400 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 z-10"
                            style={{ left: `${replayData.events[replayIndex].location.x}%`, top: `${replayData.events[replayIndex].location.y}%` }}
                          >
                              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-mono">
                                  {replayData.events[replayIndex].timestamp}
                              </div>
                          </div>
                      )}
                  </div>

                  {/* DETAILS AREA (Below Field) */}
                  <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                      {replayData.events[replayIndex] ? (
                          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-fade-in">
                              <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
                                  <div className="flex items-center gap-2">
                                      <span className={`px-2 py-1 rounded text-xs font-bold text-white
                                          ${replayData.events[replayIndex].zone === 'DEF' ? 'bg-purple-600' : replayData.events[replayIndex].zone === 'MID' ? 'bg-blue-600' : 'bg-orange-600'}
                                      `}>
                                          {replayData.events[replayIndex].zone === 'DEF' ? 'DEFESA' : replayData.events[replayIndex].zone === 'MID' ? 'MEIO' : 'ATAQUE'}
                                      </span>
                                      <span className="text-gray-400 text-xs font-bold uppercase">{replayData.events[replayIndex].period}º Tempo</span>
                                  </div>
                                  <span className="text-blue-600 font-bold text-sm">Ação {replayIndex + 1} de {replayData.events.length}</span>
                              </div>
                              
                              <div className="mb-4">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Observação</h4>
                                  <p className="text-gray-800 text-sm italic bg-gray-50 p-2 rounded border border-gray-100">
                                      "{replayData.events[replayIndex].note || 'Sem observações registradas.'}"
                                  </p>
                              </div>

                              <div>
                                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Indicadores Avaliados</h4>
                                  <div className="grid grid-cols-2 gap-2">
                                      {Object.entries(replayData.events[replayIndex].stats).map(([k, v]: any) => (
                                          v > 0 && (
                                              <div key={k} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded border border-gray-100">
                                                  <span className="text-xs text-gray-600 font-medium capitalize">{k.replace(/_/g, ' ')}</span>
                                                  <span className={`text-sm font-bold ${v>=8?'text-green-600':v<4?'text-red-600':'text-gray-700'}`}>{v}</span>
                                              </div>
                                          )
                                      ))}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center text-gray-400 py-10">Carregando dados da ação...</div>
                      )}
                  </div>

                  <div className="p-4 bg-white border-t border-gray-200 flex justify-center gap-4 shrink-0">
                      <button onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))} className="p-3 hover:bg-gray-100 rounded-full transition-colors text-gray-600"><ChevronLeft size={24}/></button>
                      <button onClick={() => setIsReplaying(!isReplaying)} className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-transform active:scale-95">
                          {isReplaying ? <PauseCircle size={28} /> : <PlayCircle size={28} />}
                      </button>
                      <button onClick={() => setReplayIndex(Math.min(replayData.events.length - 1, replayIndex + 1))} className="p-3 hover:bg-gray-100 rounded-full transition-colors text-gray-600"><ChevronRight size={24}/></button>
                  </div>
              </div>
          </div>
        )}

        {/* View Detail Modal (Fallback) */}
        {viewingEntry && !showReplayModal && (
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
                             <h4 className="font-bold text-xs uppercase text-blue-500 mb-2 border-b">Fundamentos</h4>
                             {Object.entries(viewingEntry.technical).map(([k,v]:any)=><div key={k} className="flex justify-between text-xs capitalize"><span>{k.replace('_',' ')}</span><span className="font-bold">{v}</span></div>)}
                         </div>
                         <div>
                             <h4 className="font-bold text-xs uppercase text-orange-500 mb-2 border-b">Físico</h4>
                             {Object.entries(viewingEntry.physical).map(([k,v]:any)=><div key={k} className="flex justify-between text-xs capitalize"><span>{k.replace('_',' ')}</span><span className="font-bold">{v}</span></div>)}
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
