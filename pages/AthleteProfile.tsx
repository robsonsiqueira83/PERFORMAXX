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
  deleteTrainingEntry,
  getTeams
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { calculateTotalScore, TrainingEntry, Athlete, Position, TrainingSession, getCalculatedCategory, HeatmapPoint, User, canEditData, canDeleteData, Team, UserRole } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Edit, Trash2, ArrowLeft, ClipboardList, User as UserIcon, Save, X, FileText, Loader2, Calendar, ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Upload, Clock, Copy, CheckCircle, Timer, PlayCircle, PauseCircle, SkipForward, ArrowRightLeft, Search, AlertTriangle } from 'lucide-react';
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
  const [allTeams, setAllTeams] = useState<Team[]>([]); // To validate transfers

  // Filtering State
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all'); // 'all', 'today', 'week', 'month', 'year', 'custom'
  const [customDate, setCustomDate] = useState<string>(''); // For the specific date picker
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Local state for modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  
  // Replay Modal State
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [replayData, setReplayData] = useState<any>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; type: 'athlete' | 'entry' | null; id?: string }>({ isOpen: false, type: null });

  // Edit Profile State
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});
  
  // Transfer Logic State
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferTeamId, setTransferTeamId] = useState('');
  const [searchResult, setSearchResult] = useState<{found: boolean, text: string} | null>(null);

  // UI Feedback
  const [copyFeedback, setCopyFeedback] = useState(false);

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
  const replayTimerRef = useRef<number | null>(null);

  useEffect(() => {
     // Get User for permissions
     const storedUser = localStorage.getItem('performax_current_user');
     if (storedUser) setCurrentUser(JSON.parse(storedUser));

     const load = async () => {
         setLoading(true);
         const [allAthletes, allEntries, allSessions, allCats, teams] = await Promise.all([
             getAthletes(),
             getTrainingEntries(),
             getTrainingSessions(),
             getCategories(),
             getTeams()
         ]);
         
         setAllTeams(teams);

         const foundAthlete = allAthletes.find(a => a.id === id);
         
         if (foundAthlete) {
             setAthlete(foundAthlete);
             setEditFormData({...foundAthlete});
             setCategories(allCats.filter(c => c.teamId === foundAthlete.teamId));
             setEntries(allEntries.filter(e => e.athleteId === id));
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

  // Full History Data (Always needed for the Line Chart and List)
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
        isRealTime: isRealTime, // Flag for UI
        sessionDescription: session.description
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
      
      let finalData = { ...editFormData };

      // Handle Transfer Logic
      if (isTransferring && transferTeamId) {
          // Verify Team ID
          const targetTeam = allTeams.find(t => t.id === transferTeamId);
          if (targetTeam) {
              // SET PENDING TRANSFER, DO NOT CHANGE TEAM ID YET
              finalData.pendingTransferTeamId = transferTeamId;
          } else {
              alert('ID do time inválido. Verifique e tente novamente.');
              return;
          }
      }

      await saveAthlete({ ...athlete, ...finalData } as Athlete);
      
      setShowEditModal(false);
      setIsTransferring(false);
      setTransferTeamId('');
      setSearchResult(null);
      
      setRefreshKey(prev => prev + 1);
  };

  const cancelTransfer = async () => {
      if (!athlete) return;
      // Clear pending transfer
      await saveAthlete({ ...athlete, pendingTransferTeamId: undefined } as any); // Cast slightly to avoid strict null check issues if type mismatch
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

  const handleCopyRg = () => {
      if (athlete?.rg) {
          navigator.clipboard.writeText(athlete.rg);
          setCopyFeedback(true);
          setTimeout(() => setCopyFeedback(false), 2000);
      }
  };

  const handleVerifyTeam = () => {
      if (!transferTeamId) return;
      const team = allTeams.find(t => t.id === transferTeamId);
      if (team) {
          setSearchResult({ found: true, text: team.name });
      } else {
          setSearchResult({ found: false, text: 'Time não encontrado com este ID.' });
      }
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
              // Not JSON or legacy note
          }
      }
      openEditTrainingModal(item.entry, item.fullDate);
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
    setTrainingDate(new Date().toISOString().split('T')[0]);
    
    // --- CALCULATE AVERAGES FOR NEW ENTRY ---
    if (entries.length > 0) {
        const defaultKeys = resetStats();
        const newStats: any = {};
        
        Object.keys(defaultKeys).forEach(key => {
            let sum = 0;
            let count = 0;
            
            entries.forEach(entry => {
                const val = (entry.technical as any)[key] ?? (entry.physical as any)[key] ?? (entry.tactical as any)?.[key];
                if (val !== undefined && val !== null) {
                    sum += Number(val);
                    count++;
                }
            });
            
            if (count > 0) {
                newStats[key] = Math.round((sum / count) * 2) / 2;
            } else {
                newStats[key] = 5;
            }
        });
        setCurrentStats(newStats);
    } else {
        setCurrentStats(resetStats());
    }

    setCurrentHeatmapPoints([]);
    setCurrentNotes('');
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
    // Handle notes: if JSON, show a simple message, otherwise show text
    let displayNotes = entry.notes || '';
    try {
        const parsed = JSON.parse(displayNotes);
        if (parsed.type === 'REAL_TIME_LOG') displayNotes = `[Log de Tempo Real: ${parsed.totalEvents} ações]`;
    } catch (e) {}
    
    setCurrentNotes(displayNotes);
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

     // If editing a Real Time log, preserve the original notes if not modified by user to something else
     // This is a simple check to avoid overwriting the JSON log with the "[Log...]" placeholder
     let notesToSave = currentNotes;
     if (editingEntryId) {
         const originalEntry = entries.find(e => e.id === editingEntryId);
         if (originalEntry && currentNotes.startsWith('[Log de Tempo Real')) {
             notesToSave = originalEntry.notes || '';
         }
     }

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
         notes: notesToSave
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

  // Activity Mini Calendar Renderer
  const renderActivityCalendar = () => {
      // Last 14 days or just a grid of filled dates?
      // Let's make a grid for the current month
      const currentMonthDates = Array.from({length: daysInMonth}, (_, i) => {
          const d = i + 1;
          const full = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const type = sessionDates.get(full); // 'realtime' | 'regular' | undefined
          return { d, full, type };
      });

      return (
          <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm w-full max-w-[200px]">
              <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">{calendarMonth.toLocaleString('pt-BR', { month: 'short' })}</span>
                  <div className="flex gap-1">
                      <button onClick={() => changeMonth(-1)} className="p-0.5 hover:bg-gray-100 rounded"><ChevronLeft size={12}/></button>
                      <button onClick={() => changeMonth(1)} className="p-0.5 hover:bg-gray-100 rounded"><ChevronRight size={12}/></button>
                  </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {currentMonthDates.map(day => (
                      <div 
                        key={day.d} 
                        className={`h-5 w-5 rounded flex items-center justify-center text-[10px] 
                            ${day.type === 'realtime' ? 'bg-purple-100 text-purple-700 font-bold' : 
                              day.type === 'regular' ? 'bg-green-100 text-green-700 font-bold' : 
                              'text-gray-300'}`}
                      >
                          {day.d}
                      </div>
                  ))}
              </div>
              <div className="mt-2 flex gap-2 justify-center">
                  <div className="flex items-center gap-1 text-[9px] text-gray-500"><div className="w-2 h-2 bg-green-100 rounded-full"></div> Atuação</div>
                  <div className="flex items-center gap-1 text-[9px] text-gray-500"><div className="w-2 h-2 bg-purple-100 rounded-full"></div> Tempo Real</div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-4">
            <Link to="/athletes" className="text-gray-500 hover:text-blue-600">
                <ArrowLeft size={24} />
            </Link>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><UserIcon className="text-blue-600"/> Perfil do Atleta</h2>
         </div>
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
                            const isSelected = customDate === fullDate;
                            return (
                                <button key={day} onClick={() => handleDateSelect(day)} className={`h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-100 text-gray-700'}`}>{day}</button>
                            );
                        })}
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* PENDING TRANSFER NOTIFICATION */}
        {athlete.pendingTransferTeamId && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Clock className="text-yellow-600" size={24} />
                    <div>
                        <h4 className="font-bold text-yellow-800 text-sm">Transferência Solicitada</h4>
                        <p className="text-xs text-yellow-700">
                            Aguardando aceite do time de destino (ID: {athlete.pendingTransferTeamId.substring(0,8)}...). 
                            O atleta permanece neste painel até a confirmação.
                        </p>
                    </div>
                </div>
                {canEditData(currentUser?.role || UserRole.TECNICO) && (
                    <button 
                        onClick={cancelTransfer}
                        className="text-xs bg-white border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded hover:bg-yellow-100 font-bold"
                    >
                        Cancelar
                    </button>
                )}
            </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
              {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-md" alt="" />
              ) : (
                 <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-blue-100 flex items-center justify-center text-4xl font-bold text-blue-600">{athlete.name.charAt(0)}</div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{athlete.name}</h1>
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                   <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold">{athlete.position}</span>
                   <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded font-bold">{getCalculatedCategory(athlete.birthDate)}</span>
                   <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded font-medium">Nasc: {formatBirthDate(athlete.birthDate)}</span>
                   {athlete.rg && (
                       <span className="text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-1 rounded font-mono flex items-center gap-1">
                           RG: {athlete.rg}
                           <button 
                             onClick={handleCopyRg} 
                             className="ml-1 p-0.5 hover:text-blue-600 transition-colors"
                             title="Copiar RG"
                           >
                               {copyFeedback ? <CheckCircle size={10} className="text-green-600" /> : <Copy size={10} />}
                           </button>
                       </span>
                   )}
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
                            <button onClick={() => navigate(`/athletes/${id}/realtime`)} className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors" title="Análise em Tempo Real">
                                <Timer size={16} />
                            </button>
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

      {/* --- HEATMAP & ANALYSIS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center">
             <div className="w-full max-w-xl">
                 <HeatmapField points={aggregateHeatmapPoints} readOnly={true} label="Mapa de Calor (Geral)" perspective={true} />
             </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <TrendingUp className="text-blue-600" /> Análise de Desempenho
                </h3>
                {filteredEntries.length > 0 ? (
                    <div className="flex-1 flex flex-col justify-center gap-6">
                        <div>
                            <h4 className="text-sm font-bold text-green-600 uppercase mb-3 border-b border-green-100 pb-1 flex items-center gap-2"><TrendingUp size={16} /> Destaques</h4>
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

      {/* --- HISTORY LIST --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Histórico de Atuações</h3>
          </div>
          <div className="divide-y divide-gray-100">
              {historyData.map((item) => (
                  <div key={item!.id} 
                       onClick={() => handleHistoryItemClick(item)}
                       className="p-4 hover:bg-gray-50 transition-colors cursor-pointer flex flex-col sm:flex-row justify-between items-center gap-4 group"
                  >
                      <div className="flex-1">
                          <div className="flex items-center gap-3">
                              {/* TYPE ICON */}
                              <div className={`p-2 rounded-lg ${item!.isRealTime ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                                  {item!.isRealTime ? <Timer size={20} /> : <ClipboardList size={20} />}
                              </div>
                              <div>
                                  <span className="font-bold text-gray-800 block">{item!.date}</span>
                                  <span className="text-xs text-gray-500">{item!.isRealTime ? 'Análise em Tempo Real' : 'Atuação Regular'}</span>
                              </div>
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded font-bold ${item!.score >= 8 ? 'bg-green-100 text-green-800' : item!.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>Score: {item!.score.toFixed(1)}</span>
                          </div>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); openEditTrainingModal(item!.entry, item!.fullDate); }} className="text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmModal({ isOpen: true, type: 'entry', id: item!.id }); }} className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                      </div>
                  </div>
              ))}
              {historyData.length === 0 && <div className="p-8 text-center text-gray-400 italic">Nenhuma atuação registrada no período.</div>}
          </div>
      </div>
      
      {/* --- MODALS --- */}
      
      {/* REPLAY MODAL */}
      {showReplayModal && replayData && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
                  <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
                      <div>
                          <h3 className="font-bold flex items-center gap-2"><PlayCircle size={18} /> Replay da Sessão</h3>
                          <p className="text-xs text-gray-400">{new Date(replayData.startTime).toLocaleString()} • {replayData.events.length} ações</p>
                      </div>
                      <button onClick={() => setShowReplayModal(false)}><X className="text-gray-400 hover:text-white" /></button>
                  </div>
                  
                  <div className="relative aspect-[16/9] bg-green-600 border-b-4 border-green-800">
                      {/* Field Background (Static Lines) */}
                      <div className="absolute inset-0 pointer-events-none opacity-50">
                          <div className="absolute inset-4 border-2 border-white rounded-sm"></div>
                          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white"></div>
                          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                      </div>

                      {/* Animated Marker */}
                      {replayData.events[replayIndex] && (
                          <>
                              <div 
                                className="absolute w-6 h-6 bg-yellow-400 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 z-10"
                                style={{ left: `${replayData.events[replayIndex].location.x}%`, top: `${replayData.events[replayIndex].location.y}%` }}
                              >
                                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                      {replayData.events[replayIndex].timestamp}
                                  </div>
                              </div>
                              
                              {/* Stats Overlay */}
                              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg text-sm border-l-4 border-blue-600 transition-all">
                                  <div className="flex justify-between font-bold text-gray-800 mb-1">
                                      <span>{replayData.events[replayIndex].zone === 'DEF' ? 'Defesa' : replayData.events[replayIndex].zone === 'MID' ? 'Meio-Campo' : 'Ataque'}</span>
                                      <span className="text-blue-600">Ação {replayIndex + 1}/{replayData.events.length}</span>
                                  </div>
                                  <p className="text-gray-600 italic mb-2">"{replayData.events[replayIndex].note || 'Sem observações'}"</p>
                                  <div className="flex flex-wrap gap-2">
                                      {Object.entries(replayData.events[replayIndex].stats).map(([k, v]: any) => (
                                          v > 0 && (
                                              <span key={k} className="text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 font-medium">
                                                  {k.replace('_', ' ').substring(0, 15)}: <span className={v>=8?'text-green-600':v<4?'text-red-600':'text-gray-600'}>{v}</span>
                                              </span>
                                          )
                                      ))}
                                  </div>
                              </div>
                          </>
                      )}
                  </div>

                  <div className="p-4 bg-gray-50 flex justify-center gap-4">
                      <button onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))} className="p-2 hover:bg-gray-200 rounded"><ChevronLeft /></button>
                      <button onClick={() => setIsReplaying(!isReplaying)} className="p-2 bg-blue-600 text-white rounded-full shadow hover:bg-blue-700">
                          {isReplaying ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
                      </button>
                      <button onClick={() => setReplayIndex(Math.min(replayData.events.length - 1, replayIndex + 1))} className="p-2 hover:bg-gray-200 rounded"><ChevronRight /></button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT PROFILE MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
           <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-8">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-gray-800">Editar Perfil</h3>
                 <button onClick={() => setShowEditModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                 <div className="flex flex-col items-center mb-6">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                        {editFormData.photoUrl ? (
                            <img src={editFormData.photoUrl} className="w-full h-full object-cover" />
                        ) : (
                            <UserIcon size={32} className="text-gray-400" />
                        )}
                    </div>
                    <label className="cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800">
                        <Upload size={14} /> Alterar Foto
                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                    </label>
                 </div>

                 <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Nome</label>
                     <input className={inputClass} value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Posição</label>
                         <select className={inputClass} value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                             {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                         </select>
                     </div>
                     <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Categoria</label>
                         <select className={inputClass} value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                             {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                     </div>
                 </div>

                 <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Data de Nascimento</label>
                     <input type="date" className={inputClass} value={editFormData.birthDate || ''} onChange={handleEditDateChange} />
                 </div>

                 <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">RG (Identificador)</label>
                     <input type="text" className={inputClass} value={editFormData.rg || ''} onChange={e => setEditFormData({...editFormData, rg: e.target.value})} />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Responsável</label>
                         <input className={inputClass} value={editFormData.responsibleName || ''} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} />
                     </div>
                     <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Telefone</label>
                         <input className={inputClass} value={editFormData.responsiblePhone || ''} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} />
                     </div>
                 </div>

                 {/* TRANSFER REQUEST SECTION */}
                 <div className="mt-6 pt-4 border-t border-gray-100">
                     <button 
                         type="button" 
                         onClick={() => setIsTransferring(!isTransferring)}
                         className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600 mb-2"
                     >
                         <ArrowRightLeft size={16} /> Solicitar Transferência para outro time
                     </button>
                     
                     {isTransferring && (
                         <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                             <label className="block text-xs font-bold text-gray-700 mb-1">ID do Time de Destino</label>
                             <div className="flex gap-2 mb-2">
                                 <input 
                                     type="text" 
                                     className={inputClass}
                                     placeholder="Cole o ID do time aqui..."
                                     value={transferTeamId}
                                     onChange={(e) => setTransferTeamId(e.target.value)}
                                 />
                                 <button 
                                     type="button"
                                     onClick={handleVerifyTeam}
                                     className="bg-gray-200 hover:bg-gray-300 px-3 rounded text-gray-700 font-bold"
                                 >
                                     <Search size={18} />
                                 </button>
                             </div>
                             {searchResult && (
                                 <div className={`text-xs font-bold p-2 rounded mb-2 ${searchResult.found ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                     {searchResult.text}
                                 </div>
                             )}
                             <p className="text-[10px] text-gray-500">
                                 Ao salvar, uma solicitação será enviada. O atleta só mudará de time após aprovação do destino.
                             </p>
                         </div>
                     )}
                 </div>

                 <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-2 hover:bg-blue-700 transition-colors shadow-md">
                     Salvar Alterações
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* TRAINING MODAL (NEW / EDIT) */}
      {showTrainingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
           <div className="bg-white rounded-xl w-full max-w-4xl p-6 shadow-2xl relative my-8">
              <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-4 border-b">
                 <div>
                     <h3 className="text-xl font-bold text-gray-800">{editingEntryId ? 'Editar Atuação' : 'Nova Atuação'}</h3>
                     <input type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} className="text-sm text-gray-500 border rounded px-2 py-1 mt-1" />
                 </div>
                 
                 <div className="flex gap-2">
                     {editingEntryId && (
                         <button 
                            onClick={() => setConfirmModal({ isOpen: true, type: 'entry', id: editingEntryId })}
                            className="bg-red-50 text-red-600 px-3 py-1.5 rounded hover:bg-red-100 font-bold flex items-center gap-1"
                         >
                             <Trash2 size={16} /> Excluir
                         </button>
                     )}
                     <button onClick={() => setShowTrainingModal(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                 </div>
              </div>
              
              <div className="space-y-8">
                  {/* Heatmap Input */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                       <HeatmapField 
                          points={currentHeatmapPoints} 
                          onChange={setCurrentHeatmapPoints} 
                          label="Mapa de Calor (Toque para marcar)" 
                       />
                  </div>

                  {/* Stats Sliders */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Defendendo */}
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                           <h4 className="text-xs uppercase font-bold text-purple-700 mb-3 border-b border-purple-200 pb-1">Defendendo</h4>
                           <StatSlider label="Posicionamento" value={currentStats.def_posicionamento} onChange={v => setCurrentStats({...currentStats, def_posicionamento: v})} />
                           <StatSlider label="Pressão" value={currentStats.def_pressao} onChange={v => setCurrentStats({...currentStats, def_pressao: v})} />
                           <StatSlider label="Cobertura" value={currentStats.def_cobertura} onChange={v => setCurrentStats({...currentStats, def_cobertura: v})} />
                           <StatSlider label="Fechamento" value={currentStats.def_fechamento} onChange={v => setCurrentStats({...currentStats, def_fechamento: v})} />
                           <StatSlider label="Temporização" value={currentStats.def_temporizacao} onChange={v => setCurrentStats({...currentStats, def_temporizacao: v})} />
                           <StatSlider label="Desarme Tát." value={currentStats.def_desarme_tatico} onChange={v => setCurrentStats({...currentStats, def_desarme_tatico: v})} />
                           <StatSlider label="Reação" value={currentStats.def_reacao} onChange={v => setCurrentStats({...currentStats, def_reacao: v})} />
                      </div>

                      {/* Construindo */}
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                           <h4 className="text-xs uppercase font-bold text-purple-700 mb-3 border-b border-purple-200 pb-1">Construindo</h4>
                           <StatSlider label="Qual. Passe" value={currentStats.const_qualidade_passe} onChange={v => setCurrentStats({...currentStats, const_qualidade_passe: v})} />
                           <StatSlider label="Visão" value={currentStats.const_visao} onChange={v => setCurrentStats({...currentStats, const_visao: v})} />
                           <StatSlider label="Apoios" value={currentStats.const_apoios} onChange={v => setCurrentStats({...currentStats, const_apoios: v})} />
                           <StatSlider label="Mobilidade" value={currentStats.const_mobilidade} onChange={v => setCurrentStats({...currentStats, const_mobilidade: v})} />
                           <StatSlider label="Circulação" value={currentStats.const_circulacao} onChange={v => setCurrentStats({...currentStats, const_circulacao: v})} />
                           <StatSlider label="Quebra Linhas" value={currentStats.const_quebra_linhas} onChange={v => setCurrentStats({...currentStats, const_quebra_linhas: v})} />
                           <StatSlider label="Decisão" value={currentStats.const_tomada_decisao} onChange={v => setCurrentStats({...currentStats, const_tomada_decisao: v})} />
                      </div>

                      {/* Último Terço */}
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                           <h4 className="text-xs uppercase font-bold text-purple-700 mb-3 border-b border-purple-200 pb-1">Último Terço</h4>
                           <StatSlider label="Movimentação" value={currentStats.ult_movimentacao} onChange={v => setCurrentStats({...currentStats, ult_movimentacao: v})} />
                           <StatSlider label="Atq Espaço" value={currentStats.ult_ataque_espaco} onChange={v => setCurrentStats({...currentStats, ult_ataque_espaco: v})} />
                           <StatSlider label="1v1" value={currentStats.ult_1v1} onChange={v => setCurrentStats({...currentStats, ult_1v1: v})} />
                           <StatSlider label="Último Passe" value={currentStats.ult_ultimo_passe} onChange={v => setCurrentStats({...currentStats, ult_ultimo_passe: v})} />
                           <StatSlider label="Finalização" value={currentStats.ult_finalizacao_eficiente} onChange={v => setCurrentStats({...currentStats, ult_finalizacao_eficiente: v})} />
                           <StatSlider label="Ritmo" value={currentStats.ult_ritmo} onChange={v => setCurrentStats({...currentStats, ult_ritmo: v})} />
                           <StatSlider label="Bolas Paradas" value={currentStats.ult_bolas_paradas} onChange={v => setCurrentStats({...currentStats, ult_bolas_paradas: v})} />
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Technical */}
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                           <h4 className="text-xs uppercase font-bold text-blue-700 mb-3 border-b border-blue-200 pb-1">Fundamentos</h4>
                           <StatSlider label="Controle" value={currentStats.controle_bola} onChange={v => setCurrentStats({...currentStats, controle_bola: v})} />
                           <StatSlider label="Condução" value={currentStats.conducao} onChange={v => setCurrentStats({...currentStats, conducao: v})} />
                           <StatSlider label="Passe" value={currentStats.passe} onChange={v => setCurrentStats({...currentStats, passe: v})} />
                           <StatSlider label="Recepção" value={currentStats.recepcao} onChange={v => setCurrentStats({...currentStats, recepcao: v})} />
                           <StatSlider label="Drible" value={currentStats.drible} onChange={v => setCurrentStats({...currentStats, drible: v})} />
                           <StatSlider label="Finalização" value={currentStats.finalizacao} onChange={v => setCurrentStats({...currentStats, finalizacao: v})} />
                           <StatSlider label="Cruzamento" value={currentStats.cruzamento} onChange={v => setCurrentStats({...currentStats, cruzamento: v})} />
                           <StatSlider label="Desarme" value={currentStats.desarme} onChange={v => setCurrentStats({...currentStats, desarme: v})} />
                           <StatSlider label="Intercept." value={currentStats.interceptacao} onChange={v => setCurrentStats({...currentStats, interceptacao: v})} />
                      </div>

                      {/* Physical */}
                      <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                           <h4 className="text-xs uppercase font-bold text-orange-700 mb-3 border-b border-orange-200 pb-1">Físico</h4>
                           <StatSlider label="Velocidade" value={currentStats.velocidade} onChange={v => setCurrentStats({...currentStats, velocidade: v})} />
                           <StatSlider label="Agilidade" value={currentStats.agilidade} onChange={v => setCurrentStats({...currentStats, agilidade: v})} />
                           <StatSlider label="Resistência" value={currentStats.resistencia} onChange={v => setCurrentStats({...currentStats, resistencia: v})} />
                           <StatSlider label="Força" value={currentStats.forca} onChange={v => setCurrentStats({...currentStats, forca: v})} />
                           <StatSlider label="Coordenação" value={currentStats.coordenacao} onChange={v => setCurrentStats({...currentStats, coordenacao: v})} />
                           <StatSlider label="Mobilidade" value={currentStats.mobilidade} onChange={v => setCurrentStats({...currentStats, mobilidade: v})} />
                           <StatSlider label="Estabilidade" value={currentStats.estabilidade} onChange={v => setCurrentStats({...currentStats, estabilidade: v})} />
                      </div>
                  </div>

                  <div>
                      <h4 className="text-sm font-bold text-gray-700 mb-2">Observações</h4>
                      <textarea 
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500 h-24"
                        value={currentNotes}
                        onChange={(e) => setCurrentNotes(e.target.value)}
                        placeholder="Notas sobre a atuação..."
                      ></textarea>
                  </div>

                  <button 
                    onClick={handleSaveTraining}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors flex items-center justify-center gap-2"
                  >
                      <Save size={18} /> Salvar Atuação
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">
                     {confirmModal.type === 'athlete' ? 'Excluir Atleta?' : 'Excluir Atuação?'}
                 </h3>
                 <p className="text-gray-500 mb-6">Esta ação não pode ser desfeita.</p>
                 <div className="flex gap-3">
                     <button onClick={() => setConfirmModal({isOpen: false, type: null})} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={handleConfirmAction} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700">Excluir</button>
                 </div>
             </div>
         </div>
      )}

      {/* COPY RG FEEDBACK */}
      {copyFeedback && (
         <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in flex items-center gap-2 font-bold z-50">
             <CheckCircle size={18} /> RG Copiado!
         </div>
      )}

    </div>
  );
};

export default AthleteProfile;