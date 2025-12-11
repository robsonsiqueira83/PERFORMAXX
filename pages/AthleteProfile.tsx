import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  getTrainingEntries, 
  getTrainingSessions, 
  deleteAthlete, 
  saveTrainingEntry,
  saveAthlete,
  saveTrainingSession,
  getCategories,
  deleteTrainingEntry
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { calculateTotalScore, TrainingEntry, Athlete, Position, TrainingSession, getCalculatedCategory, calculateCategoryAverage, HeatmapPoint, User, canEditData, canDeleteData } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Edit, Trash2, ArrowLeft, ClipboardList, User as UserIcon, Save, X, Eye, FileText, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Upload } from 'lucide-react';
import StatSlider from '../components/StatSlider';
import HeatmapField from '../components/HeatmapField';
import { v4 as uuidv4 } from 'uuid';

const AthleteProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Refresh trigger to reload data without page reload
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // User Permissions
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Data State
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Filtering State
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all'); // 'all', 'today', 'week', 'month', 'year', 'custom'
  const [customDate, setCustomDate] = useState<string>(''); // For the specific date picker
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Local state for modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; type: 'athlete' | 'entry' | null; id?: string }>({ isOpen: false, type: null });

  // Edit Profile State
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});

  // Add/Edit Training State
  const [trainingDate, setTrainingDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Used for both New and Edit modes
  const [currentStats, setCurrentStats] = useState({
    // Condição Física
    velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5,
    // Fundamentos
    controle_bola: 5, conducao: 5, passe: 5, recepcao: 5, drible: 5, finalizacao: 5, cruzamento: 5, desarme: 5, interceptacao: 5,
    // Tático - Defendendo
    def_posicionamento: 5, def_pressao: 5, def_cobertura: 5, def_fechamento: 5, def_temporizacao: 5, def_desarme_tatico: 5, def_reacao: 5,
    // Tático - Construindo
    const_qualidade_passe: 5, const_visao: 5, const_apoios: 5, const_mobilidade: 5, const_circulacao: 5, const_quebra_linhas: 5, const_tomada_decisao: 5,
    // Tático - Último Terço
    ult_movimentacao: 5, ult_ataque_espaco: 5, ult_1v1: 5, ult_ultimo_passe: 5, ult_finalizacao_eficiente: 5, ult_ritmo: 5, ult_bolas_paradas: 5
  });
  
  const [currentHeatmapPoints, setCurrentHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [currentNotes, setCurrentNotes] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null); // If null, it's a new entry
  
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     // Get User for permissions
     const storedUser = localStorage.getItem('performax_current_user');
     if (storedUser) setCurrentUser(JSON.parse(storedUser));

     const load = async () => {
         setLoading(true);
         const allAthletes = await getAthletes();
         const foundAthlete = allAthletes.find(a => a.id === id);
         
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setEditFormData({...foundAthlete});
             
             const allCats = await getCategories();
             setCategories(allCats.filter(c => c.teamId === foundAthlete.teamId));

             const allEntries = await getTrainingEntries();
             setEntries(allEntries.filter(e => e.athleteId === id));

             const allSessions = await getTrainingSessions();
             setSessions(allSessions);
         }
         setLoading(false);
     };
     load();
  }, [id, refreshKey]);

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

  // Full History Data (Always needed for the Line Chart and List)
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

  // --- FILTERED DATA ---
  const filteredEntries = useMemo(() => {
    const now = new Date();
    
    return entries.filter(e => {
        const session = sessions.find(s => s.id === e.sessionId);
        if (!session) return false;
        
        const sIso = session.date;
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
                return customDate ? sIso === customDate : true;
            case 'all':
            default:
                return true;
        }
    });
  }, [entries, sessions, selectedPeriod, customDate]);

  // Calculate Overall Average Score
  const overallScore = useMemo(() => {
    if (filteredEntries.length === 0) return 0;
    const getScore = (e: TrainingEntry) => calculateTotalScore(e.technical, e.physical, e.tactical);
    const total = filteredEntries.reduce((acc, curr) => acc + getScore(curr), 0);
    return total / filteredEntries.length;
  }, [filteredEntries]);

  // Aggregate Heatmap Points
  const aggregateHeatmapPoints = useMemo(() => {
      let allPoints: HeatmapPoint[] = [];
      filteredEntries.forEach(e => {
          if (e.heatmapPoints && e.heatmapPoints.length > 0) {
              allPoints = [...allPoints, ...e.heatmapPoints];
          }
      });
      return allPoints;
  }, [filteredEntries]);

  // Radar Data Logic
  const currentRadarStats = useMemo(() => {
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

  // --- PERFORMANCE RANKING ---
  const performanceAnalysis = useMemo(() => {
    if (!currentRadarStats) return { best: [], worst: [] };
    
    let allStats: { label: string; score: number; type: string }[] = [];
    
    const addStats = (list: any[], type: string) => {
       list.forEach(item => {
           allStats.push({ label: item.subject, score: item.A, type });
       });
    };

    const hasTactical = filteredEntries.some(e => e.tactical !== undefined && e.tactical !== null);

    addStats(currentRadarStats.technical, 'Fundamentos');
    addStats(currentRadarStats.physical, 'Físico');
    
    if (hasTactical) {
        addStats(currentRadarStats.tactical_def, 'Tático Def');
        addStats(currentRadarStats.tactical_const, 'Tático Cons');
        addStats(currentRadarStats.tactical_ult, 'Tático Ult');
    }

    allStats.sort((a, b) => b.score - a.score);

    return { 
        best: allStats.slice(0, 3), 
        worst: [...allStats].sort((a, b) => a.score - b.score).slice(0, 3) 
    };

  }, [currentRadarStats, filteredEntries]);

  const getTacticalColor = (data: any[]) => {
      if (!data || data.length === 0) return { stroke: '#8884d8', fill: '#8884d8' };
      const avg = data.reduce((sum, item) => sum + item.A, 0) / data.length;
      if (avg < 4) return { stroke: '#ef4444', fill: '#ef4444' };
      if (avg < 8) return { stroke: '#f97316', fill: '#f97316' };
      return { stroke: '#22c55e', fill: '#22c55e' };
  };

  const handleConfirmAction = async () => {
    if (confirmModal.type === 'athlete') {
        if (athlete) await deleteAthlete(athlete.id);
        navigate('/athletes');
    } else if (confirmModal.type === 'entry' && confirmModal.id) {
        await deleteTrainingEntry(confirmModal.id);
        setRefreshKey(prev => prev + 1);
        setConfirmModal({ isOpen: false, type: null });
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editFormData.name || !athlete) return;
      await saveAthlete({ ...athlete, ...editFormData } as Athlete);
      setShowEditModal(false);
      setRefreshKey(prev => prev + 1);
  };

  const handleEditDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData(prev => ({ ...prev, birthDate: e.target.value }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const url = await processImageUpload(e.target.files[0]);
          setEditFormData({ ...editFormData, photoUrl: url });
      }
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
  const getSessionDatesSet = () => {
      const dates = new Set<string>();
      historyData.forEach(h => { if (h && h.fullDate) dates.add(h.fullDate); });
      return dates;
  };
  const sessionDates = getSessionDatesSet();
  const handleDateSelect = (day: number) => {
      const year = calendarMonth.getFullYear();
      const month = String(calendarMonth.getMonth() + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayStr}`;
      setCustomDate(dateStr);
      setIsCalendarOpen(false);
  };
  const changeMonth = (offset: number) => {
      const newDate = new Date(calendarMonth);
      newDate.setMonth(newDate.getMonth() + offset);
      setCalendarMonth(newDate);
  };

  // --- MODALS FUNCTIONS ---
  
  const resetStats = () => ({
        velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5,
        controle_bola: 5, conducao: 5, passe: 5, recepcao: 5, drible: 5, finalizacao: 5, cruzamento: 5, desarme: 5, interceptacao: 5,
        def_posicionamento: 5, def_pressao: 5, def_cobertura: 5, def_fechamento: 5, def_temporizacao: 5, def_desarme_tatico: 5, def_reacao: 5,
        const_qualidade_passe: 5, const_visao: 5, const_apoios: 5, const_mobilidade: 5, const_circulacao: 5, const_quebra_linhas: 5, const_tomada_decisao: 5,
        ult_movimentacao: 5, ult_ataque_espaco: 5, ult_1v1: 5, ult_ultimo_passe: 5, ult_finalizacao_eficiente: 5, ult_ritmo: 5, ult_bolas_paradas: 5
  });

  const openNewTrainingModal = () => {
    setEditingEntryId(null);
    setCurrentStats(resetStats());
    setCurrentHeatmapPoints([]);
    setCurrentNotes('');
    setTrainingDate(new Date().toISOString().split('T')[0]);
    setShowTrainingModal(true);
  };

  const openEditTrainingModal = (entry: TrainingEntry, date: string) => {
    setEditingEntryId(entry.id);
    const defaults = resetStats();
    // Merge entry data with current structure
    setCurrentStats({ 
        ...defaults, // Base defaults
        ...entry.technical, 
        ...entry.physical, 
        ...entry.tactical 
    });
    setCurrentHeatmapPoints(entry.heatmapPoints || []);
    setCurrentNotes(entry.notes || '');
    setTrainingDate(date);
    setShowTrainingModal(true);
  };

  const handleSaveTraining = async () => {
     if (!athlete || !trainingDate) return;
     
     let sessionId = null;
     
     // Find or create session
     const existingSession = sessions.find(s => s.date === trainingDate && s.teamId === athlete.teamId && s.categoryId === athlete.categoryId);
     if (existingSession) {
         sessionId = existingSession.id;
     } else {
         sessionId = uuidv4();
         const newSession: TrainingSession = {
             id: sessionId,
             date: trainingDate,
             teamId: athlete.teamId,
             categoryId: athlete.categoryId,
             description: 'Atuação (Perfil)'
         };
         await saveTrainingSession(newSession);
     }

     const entryId = editingEntryId || uuidv4();

     const entry: TrainingEntry = {
         id: entryId,
         sessionId: sessionId,
         athleteId: athlete.id,
         technical: {
            controle_bola: currentStats.controle_bola, conducao: currentStats.conducao, passe: currentStats.passe,
            recepcao: currentStats.recepcao, drible: currentStats.drible, finalizacao: currentStats.finalizacao,
            cruzamento: currentStats.cruzamento, desarme: currentStats.desarme, interceptacao: currentStats.interceptacao
         },
         physical: {
            velocidade: currentStats.velocidade, agilidade: currentStats.agilidade, resistencia: currentStats.resistencia,
            forca: currentStats.forca, coordenacao: currentStats.coordenacao, mobilidade: currentStats.mobilidade, estabilidade: currentStats.estabilidade
         },
         tactical: {
            def_posicionamento: currentStats.def_posicionamento, def_pressao: currentStats.def_pressao, def_cobertura: currentStats.def_cobertura,
            def_fechamento: currentStats.def_fechamento, def_temporizacao: currentStats.def_temporizacao, def_desarme_tatico: currentStats.def_desarme_tatico,
            def_reacao: currentStats.def_reacao,
            const_qualidade_passe: currentStats.const_qualidade_passe, const_visao: currentStats.const_visao, const_apoios: currentStats.const_apoios,
            const_mobilidade: currentStats.const_mobilidade, const_circulacao: currentStats.const_circulacao, const_quebra_linhas: currentStats.const_quebra_linhas,
            const_tomada_decisao: currentStats.const_tomada_decisao,
            ult_movimentacao: currentStats.ult_movimentacao, ult_ataque_espaco: currentStats.ult_ataque_espaco, ult_1v1: currentStats.ult_1v1,
            ult_ultimo_passe: currentStats.ult_ultimo_passe, ult_finalizacao_eficiente: currentStats.ult_finalizacao_eficiente,
            ult_ritmo: currentStats.ult_ritmo, ult_bolas_paradas: currentStats.ult_bolas_paradas
         },
         heatmapPoints: currentHeatmapPoints,
         notes: currentNotes
     };
     
     await saveTrainingEntry(entry);
     setShowTrainingModal(false);
     setRefreshKey(prev => prev + 1);
  };

  const formatBirthDate = (dateString: string) => {
     if (!dateString) return '';
     const datePart = dateString.split('T')[0];
     const [year, month, day] = datePart.split('-');
     return `${day}/${month}/${year}`;
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;
  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:outline-none focus:border-blue-500";
  
  // Tactical Colors
  const defColor = currentRadarStats ? getTacticalColor(currentRadarStats.tactical_def) : { stroke: '#6b21a8', fill: '#a855f7' };
  const constColor = currentRadarStats ? getTacticalColor(currentRadarStats.tactical_const) : { stroke: '#7e22ce', fill: '#a855f7' };
  const ultColor = currentRadarStats ? getTacticalColor(currentRadarStats.tactical_ult) : { stroke: '#9333ea', fill: '#d8b4fe' };

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-4">
            <Link to="/athletes" className="text-gray-500 hover:text-blue-600">
                <ArrowLeft size={24} />
            </Link>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><UserIcon className="text-blue-600"/> Perfil do Atleta</h2>
         </div>
         {/* ... (Date Filter Select code remains similar) ... */}
         <div className="relative" ref={calendarRef}>
             <select value={selectedPeriod} onChange={handlePeriodChange} className="bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm focus:outline-none cursor-pointer appearance-none pr-8">
               <option value="all">Todo o Período</option>
               <option value="today">Hoje</option>
               <option value="week">Últimos 7 dias</option>
               <option value="month">Últimos 30 dias</option>
               <option value="year">Este Ano</option>
               <option value="custom">Data Específica...</option>
             </select>
             <ChevronDown size={14} className="text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
             {isCalendarOpen && (
                 <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4 animate-fade-in">
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
                            const hasSession = sessionDates.has(fullDate);
                            const isSelected = customDate === fullDate;
                            return (
                                <button key={day} onClick={() => handleDateSelect(day)} className={`h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-100 text-gray-700'} ${hasSession && !isSelected ? 'bg-green-100 text-green-700 border border-green-200 font-bold' : ''}`}>{day}</button>
                            );
                        })}
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
              {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-md" alt="" />
              ) : (
                 <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-blue-100 flex items-center justify-center text-4xl font-bold text-blue-600">{athlete.name.charAt(0)}</div>
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
            
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto justify-between md:justify-end mt-4 md:mt-0">
                 <div className="text-center px-6 py-2 bg-gray-50 rounded-xl border border-gray-100 min-w-[140px]">
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Média Geral</span>
                    <span className={`block text-5xl font-black ${overallScore >= 8 ? 'text-[#4ade80]' : overallScore >= 4 ? 'text-gray-500' : 'text-red-500'}`}>{overallScore > 0 ? overallScore.toFixed(1) : '--'}</span>
                 </div>
                 
                 {/* ACTION BUTTONS (PERMISSION GATED) */}
                 {currentUser && canEditData(currentUser.role) && (
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <button onClick={openNewTrainingModal} className="bg-[#4ade80] hover:bg-green-500 text-white px-6 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm w-full"><ClipboardList size={18} /> Nova Atuação</button>
                        <div className="flex gap-2 w-full">
                            <button onClick={() => setShowEditModal(true)} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1"><Edit size={16} /> Editar</button>
                            {/* STRICT DELETE PERMISSION */}
                            {canDeleteData(currentUser.role) && (
                                <button onClick={() => setConfirmModal({isOpen: true, type: 'athlete'})} className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1"><Trash2 size={16} /></button>
                            )}
                        </div>
                    </div>
                 )}
            </div>
        </div>
      </div>

      {/* --- AGGREGATE HEATMAP & ANALYSIS GRID --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-hidden flex flex-col items-center justify-center">
              <div className="w-full max-w-xl">
                  <HeatmapField points={aggregateHeatmapPoints} readOnly={true} label="Mapa de Calor (Posicionamento)" perspective={true} />
              </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
               <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><TrendingUp className="text-blue-600" /> Análise de Desempenho</h3>
               {filteredEntries.length > 0 ? (
                   <div className="flex-1 flex flex-col justify-center gap-6">
                        <div>
                            <h4 className="text-sm font-bold text-green-600 uppercase mb-3 border-b border-green-100 pb-1 flex items-center gap-2"><TrendingUp size={16} /> Destaques (Melhores)</h4>
                            <div className="space-y-3">{performanceAnalysis.best.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-green-50 px-3 py-2 rounded-lg"><div><span className="font-bold text-gray-800 text-sm">{item.label}</span><span className="text-xs text-gray-500 ml-2">({item.type})</span></div><span className="text-green-700 font-bold">{item.score.toFixed(1)}</span></div>))}</div>
                        </div>
                        <div className="w-full border-t border-dashed border-gray-200"></div>
                        <div>
                            <h4 className="text-sm font-bold text-red-500 uppercase mb-3 border-b border-red-100 pb-1 flex items-center gap-2"><TrendingDown size={16} /> Pontos de Atenção</h4>
                            <div className="space-y-3">{performanceAnalysis.worst.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-red-50 px-3 py-2 rounded-lg"><div><span className="font-bold text-gray-800 text-sm">{item.label}</span><span className="text-xs text-gray-500 ml-2">({item.type})</span></div><span className="text-red-600 font-bold">{item.score.toFixed(1)}</span></div>))}</div>
                        </div>
                   </div>
               ) : (
                   <div className="flex-1 flex items-center justify-center text-gray-400 italic">Sem dados suficientes para análise neste período.</div>
               )}
          </div>
      </div>

      {/* TACTICAL CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Defendendo</h3>
              <div className="h-[250px]">
                 {currentRadarStats && currentRadarStats.tactical_def ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentRadarStats.tactical_def}>
                        <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Defendendo" dataKey="A" stroke={defColor.stroke} fill={defColor.fill} fillOpacity={0.4} /><RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Construindo</h3>
              <div className="h-[250px]">
                 {currentRadarStats && currentRadarStats.tactical_const ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentRadarStats.tactical_const}>
                        <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 9 }} /><PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} /><Radar name="Construindo" dataKey="A" stroke={constColor.stroke} fill={constColor.fill} fillOpacity={0.4} /><RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-purple-700 mb-4">Último Terço</h3>
              <div className="h-[250px]">
                 {currentRadarStats && currentRadarStats.tactical_ult ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={currentRadarStats.tactical_ult}>
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
              <h3 className="font-bold text-blue-700 mb-4">Fundamentos</h3>
              <div className="h-[300px]">
                 {currentRadarStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentRadarStats.technical}>
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
              <h3 className="font-bold text-orange-700 mb-4">Condição Física</h3>
               <div className="h-[300px]">
                 {currentRadarStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentRadarStats.physical}>
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
            Evolução Score Total
         </h3>
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
             ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados históricos para o período selecionado</div>}
         </div>
      </div>

      {/* History List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
          <div className="p-6 border-b border-gray-100">
             <h3 className="font-bold text-gray-800">Histórico de Atuações</h3>
          </div>
          <div className="divide-y divide-gray-100">
              {historyData.map((item) => (
                  <div key={item!.id} className={`p-4 hover:bg-gray-50 transition-colors ${editingEntryId === item!.id ? 'bg-gray-50' : ''}`}>
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 cursor-pointer" onClick={() => setViewingEntry(item)}>
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-gray-800">{item!.date}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${item!.score >= 8 ? 'bg-green-100 text-green-800' : item!.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>Score: {item!.score.toFixed(1)}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {currentUser && canEditData(currentUser.role) && (
                                    <button onClick={(e) => { e.stopPropagation(); openEditTrainingModal(item!.entry, item!.fullDate); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"><Edit size={16} /></button>
                                )}
                                {currentUser && canDeleteData(currentUser.role) && (
                                    <button onClick={(e) => { e.stopPropagation(); setConfirmModal({isOpen: true, type: 'entry', id: item!.entry.id}); }} className="p-2 text-red-600 hover:bg-red-50 rounded-full"><Trash2 size={16} /></button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); setViewingEntry(item); }} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"><Eye size={16} /></button>
                            </div>
                        </div>
                  </div>
              ))}
          </div>
      </div>

      {/* --- MODALS --- */}

      {/* CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Trash2 className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir {confirmModal.type === 'athlete' ? 'Atleta' : 'Atuação'}?</h3>
                 <p className="text-gray-500 mb-6">
                    {confirmModal.type === 'athlete' 
                       ? "Tem certeza que deseja excluir este atleta? Todos os dados serão perdidos." 
                       : "Deseja excluir esta atuação do histórico do atleta?"}
                 </p>
                 <div className="flex gap-3">
                     <button onClick={() => setConfirmModal({isOpen: false, type: null})} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={handleConfirmAction} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700">Excluir</button>
                 </div>
             </div>
         </div>
      )}

      {/* ... (Existing Edit/Training/View Modals remain here, no changes needed to them besides proper closing) ... */}
      
      {/* 1. EDIT ATHLETE MODAL (Same as before) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800"><Edit className="text-blue-500"/> Editar Atleta</h3>
                <button onClick={() => setShowEditModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                 <div className="flex flex-col items-center mb-4">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                       {editFormData.photoUrl ? <img src={editFormData.photoUrl} className="w-full h-full object-cover" /> : <UserIcon size={32} className="text-gray-400" />}
                    </div>
                    <label className="cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800">
                       <Upload size={14} /> Alterar Foto
                       <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                    </label>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
                   <input required type="text" className={inputClass} value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Data Nasc.</label>
                      <input type="date" className={inputClass} value={editFormData.birthDate || ''} onChange={handleEditDateChange} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Categoria</label>
                      <select required className={inputClass} value={editFormData.categoryId || ''} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                         <option value="">Selecione...</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Posição</label>
                   <select className={inputClass} value={editFormData.position || ''} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                      {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                   </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Responsável</label>
                     <input type="text" className={inputClass} value={editFormData.responsibleName || ''} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                     <input type="text" className={inputClass} value={editFormData.responsiblePhone || ''} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} />
                   </div>
                 </div>

                 <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 hover:bg-blue-700 transition-colors">
                    Salvar Alterações
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* 2. TRAINING MODAL (Same as before) */}
      {showTrainingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-2 sticky top-0 bg-white z-10">
                <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                    <ClipboardList className="text-green-500"/> {editingEntryId ? 'Editar Atuação' : 'Nova Atuação'}
                </h3>
                <button onClick={() => setShowTrainingModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button>
              </div>

              <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Data da Atuação</label>
                  <input type="date" className={inputClass} value={trainingDate} onChange={e => setTrainingDate(e.target.value)} />
              </div>

              {/* HEATMAP */}
              <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                   <HeatmapField 
                      points={currentHeatmapPoints} 
                      onChange={setCurrentHeatmapPoints} 
                      label="Mapa de Calor (Toque para marcar)" 
                   />
              </div>

              <div className="space-y-8 mb-8">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       {/* Defendendo */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Tático: Defendendo</h4>
                           <StatSlider label="Posicionamento" value={currentStats.def_posicionamento} onChange={v => setCurrentStats({...currentStats, def_posicionamento: v})} />
                           <StatSlider label="Pressão na bola" value={currentStats.def_pressao} onChange={v => setCurrentStats({...currentStats, def_pressao: v})} />
                           <StatSlider label="Cobertura" value={currentStats.def_cobertura} onChange={v => setCurrentStats({...currentStats, def_cobertura: v})} />
                           <StatSlider label="Fechamento linhas" value={currentStats.def_fechamento} onChange={v => setCurrentStats({...currentStats, def_fechamento: v})} />
                           <StatSlider label="Temporização" value={currentStats.def_temporizacao} onChange={v => setCurrentStats({...currentStats, def_temporizacao: v})} />
                           <StatSlider label="Desarme tempo certo" value={currentStats.def_desarme_tatico} onChange={v => setCurrentStats({...currentStats, def_desarme_tatico: v})} />
                           <StatSlider label="Reação pós-perda" value={currentStats.def_reacao} onChange={v => setCurrentStats({...currentStats, def_reacao: v})} />
                       </div>
                       {/* Construindo */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Tático: Construindo</h4>
                           <StatSlider label="Qualidade Passe" value={currentStats.const_qualidade_passe} onChange={v => setCurrentStats({...currentStats, const_qualidade_passe: v})} />
                           <StatSlider label="Visão de Jogo" value={currentStats.const_visao} onChange={v => setCurrentStats({...currentStats, const_visao: v})} />
                           <StatSlider label="Apoios/Linhas" value={currentStats.const_apoios} onChange={v => setCurrentStats({...currentStats, const_apoios: v})} />
                           <StatSlider label="Mobilidade receber" value={currentStats.const_mobilidade} onChange={v => setCurrentStats({...currentStats, const_mobilidade: v})} />
                           <StatSlider label="Circulação bola" value={currentStats.const_circulacao} onChange={v => setCurrentStats({...currentStats, const_circulacao: v})} />
                           <StatSlider label="Quebra de linhas" value={currentStats.const_quebra_linhas} onChange={v => setCurrentStats({...currentStats, const_quebra_linhas: v})} />
                           <StatSlider label="Decisão sob pressão" value={currentStats.const_tomada_decisao} onChange={v => setCurrentStats({...currentStats, const_tomada_decisao: v})} />
                       </div>
                       {/* Último Terço */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">Tático: Último Terço</h4>
                           <StatSlider label="Mov. sem bola" value={currentStats.ult_movimentacao} onChange={v => setCurrentStats({...currentStats, ult_movimentacao: v})} />
                           <StatSlider label="Ataque ao espaço" value={currentStats.ult_ataque_espaco} onChange={v => setCurrentStats({...currentStats, ult_ataque_espaco: v})} />
                           <StatSlider label="Capacidade 1x1" value={currentStats.ult_1v1} onChange={v => setCurrentStats({...currentStats, ult_1v1: v})} />
                           <StatSlider label="Último passe" value={currentStats.ult_ultimo_passe} onChange={v => setCurrentStats({...currentStats, ult_ultimo_passe: v})} />
                           <StatSlider label="Finalização efic." value={currentStats.ult_finalizacao_eficiente} onChange={v => setCurrentStats({...currentStats, ult_finalizacao_eficiente: v})} />
                           <StatSlider label="Ritmo decisão" value={currentStats.ult_ritmo} onChange={v => setCurrentStats({...currentStats, ult_ritmo: v})} />
                           <StatSlider label="Bolas paradas" value={currentStats.ult_bolas_paradas} onChange={v => setCurrentStats({...currentStats, ult_bolas_paradas: v})} />
                       </div>
                   </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Fundamentos */}
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <h4 className="text-sm uppercase font-bold text-blue-700 mb-4 border-b border-blue-200 pb-2">Fundamentos</h4>
                      <StatSlider label="Controle de bola" value={currentStats.controle_bola} onChange={v => setCurrentStats({...currentStats, controle_bola: v})} />
                      <StatSlider label="Condução" value={currentStats.conducao} onChange={v => setCurrentStats({...currentStats, conducao: v})} />
                      <StatSlider label="Passe" value={currentStats.passe} onChange={v => setCurrentStats({...currentStats, passe: v})} />
                      <StatSlider label="Recepção orient." value={currentStats.recepcao} onChange={v => setCurrentStats({...currentStats, recepcao: v})} />
                      <StatSlider label="Drible" value={currentStats.drible} onChange={v => setCurrentStats({...currentStats, drible: v})} />
                      <StatSlider label="Finalização" value={currentStats.finalizacao} onChange={v => setCurrentStats({...currentStats, finalizacao: v})} />
                      <StatSlider label="Cruzamento" value={currentStats.cruzamento} onChange={v => setCurrentStats({...currentStats, cruzamento: v})} />
                      <StatSlider label="Desarme" value={currentStats.desarme} onChange={v => setCurrentStats({...currentStats, desarme: v})} />
                      <StatSlider label="Interceptação" value={currentStats.interceptacao} onChange={v => setCurrentStats({...currentStats, interceptacao: v})} />
                  </div>
                  {/* Physical */}
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                      <h4 className="text-sm uppercase font-bold text-orange-700 mb-4 border-b border-orange-200 pb-2">Condição Física</h4>
                      <StatSlider label="Velocidade" value={currentStats.velocidade} onChange={v => setCurrentStats({...currentStats, velocidade: v})} />
                      <StatSlider label="Agilidade" value={currentStats.agilidade} onChange={v => setCurrentStats({...currentStats, agilidade: v})} />
                      <StatSlider label="Resistência" value={currentStats.resistencia} onChange={v => setCurrentStats({...currentStats, resistencia: v})} />
                      <StatSlider label="Força/Potência" value={currentStats.forca} onChange={v => setCurrentStats({...currentStats, forca: v})} />
                      <StatSlider label="Coordenação" value={currentStats.coordenacao} onChange={v => setCurrentStats({...currentStats, coordenacao: v})} />
                      <StatSlider label="Mobilidade" value={currentStats.mobilidade} onChange={v => setCurrentStats({...currentStats, mobilidade: v})} />
                      <StatSlider label="Estabilidade Core" value={currentStats.estabilidade} onChange={v => setCurrentStats({...currentStats, estabilidade: v})} />
                  </div>
              </div>

              <div className="mt-8">
                  <h4 className="text-sm uppercase font-bold text-gray-500 mb-2 flex items-center gap-2"><FileText size={16} /> Observações</h4>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500 h-24"
                    value={currentNotes}
                    onChange={(e) => setCurrentNotes(e.target.value)}
                  ></textarea>
              </div>

              <div className="mt-8 flex justify-end">
                  <button onClick={handleSaveTraining} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg transform active:scale-95 transition-all flex items-center gap-2 text-lg">
                      <Save size={24} /> Salvar
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* 3. VIEW DETAILS MODAL (Same as before) */}
      {viewingEntry && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto relative shadow-2xl">
                    <button onClick={() => setViewingEntry(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">X</button>
                    <div className="flex items-center gap-3 mb-6 border-b pb-4">
                        <div>
                            <h3 className="font-bold text-xl text-gray-800">Detalhes da Atuação</h3>
                            <p className="text-sm text-gray-500">{viewingEntry.date}</p>
                        </div>
                    </div>
                    {viewingEntry.heatmapPoints?.length > 0 && <div className="mb-6"><HeatmapField points={viewingEntry.heatmapPoints} readOnly={true} label="Posicionamento" /></div>}
                    {viewingEntry.entry.notes && <div className="bg-yellow-50 p-4 mb-6 rounded"><p className="text-sm italic text-gray-700">{viewingEntry.entry.notes}</p></div>}
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                         <div>
                             <h4 className="font-bold text-blue-500 mb-2 border-b">Fundamentos</h4>
                             {Object.entries(viewingEntry.technical).map(([k,v]:any)=><div key={k} className="flex justify-between capitalize border-b border-gray-100 py-1"><span>{k.replace(/_/g,' ')}</span><span className="font-bold">{v}</span></div>)}
                         </div>
                         <div>
                             <h4 className="font-bold text-orange-500 mb-2 border-b">Físico</h4>
                             {Object.entries(viewingEntry.physical).map(([k,v]:any)=><div key={k} className="flex justify-between capitalize border-b border-gray-100 py-1"><span>{k.replace(/_/g,' ')}</span><span className="font-bold">{v}</span></div>)}
                         </div>
                    </div>
                    {viewingEntry.tactical && (
                      <div className="mt-4">
                         <h4 className="font-bold text-purple-500 mb-2 border-b text-xs">Tático (Resumo)</h4>
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            {Object.entries(viewingEntry.tactical).slice(0,10).map(([k,v]:any)=><div key={k} className="flex justify-between capitalize border-b border-gray-100 py-1"><span>{k.replace('def_','').replace('const_','').replace('ult_','').replace(/_/g,' ')}</span><span className="font-bold">{v}</span></div>)}
                            <div className="col-span-2 text-center text-gray-400 italic mt-2">...ver gráfico completo no perfil</div>
                         </div>
                      </div>
                    )}
                </div>
            </div>
      )}

    </div>
  );
};

export default AthleteProfile;