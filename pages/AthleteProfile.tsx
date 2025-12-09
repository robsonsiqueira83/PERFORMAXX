import React, { useMemo, useState, useEffect } from 'react';
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
import { calculateTotalScore, TrainingEntry, Athlete, Position, TrainingSession, getCalculatedCategory } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Edit, Trash2, ArrowLeft, ClipboardList, User, Save, X, Eye, FileText, Loader2 } from 'lucide-react';
import StatSlider from '../components/StatSlider';
import { v4 as uuidv4 } from 'uuid';

const AthleteProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Refresh trigger to reload data without page reload
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Data State
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Local state for modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);

  // Edit Profile State
  const [editFormData, setEditFormData] = useState<Partial<Athlete>>({});

  // Add Training State
  const [trainingDate, setTrainingDate] = useState(new Date().toISOString().split('T')[0]);
  const [newStats, setNewStats] = useState({
    controle: 5, passe: 5, finalizacao: 5, drible: 5, cabeceio: 5, posicao: 5,
    velocidade: 5, agilidade: 5, forca: 5, resistencia: 5, coordenacao: 5, equilibrio: 5
  });
  const [newNotes, setNewNotes] = useState('');

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [tempStats, setTempStats] = useState<any>(null);
  const [tempNotes, setTempNotes] = useState('');

  useEffect(() => {
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


  const historyData = useMemo(() => {
    return entries.map(entry => {
      const session = sessions.find(s => s.id === entry.sessionId);
      if (!session) return null;
      return {
        id: entry.id,
        date: new Date(session.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
        fullDate: session.date,
        score: calculateTotalScore(entry.technical, entry.physical),
        technical: entry.technical,
        physical: entry.physical,
        entry: entry
      };
    }).filter(Boolean).sort((a, b) => new Date(a!.fullDate).getTime() - new Date(b!.fullDate).getTime());
  }, [entries, sessions]);

  // Calculate Latest Score for Highlight
  const latestScore = useMemo(() => {
    if (historyData.length === 0) return 0;
    return historyData[historyData.length - 1]?.score || 0;
  }, [historyData]);

  // Current Stats (Average of last 3 sessions sorted by date)
  const currentStats = useMemo(() => {
    if (entries.length === 0) return null;

    // Sort entries by session date first
    const sortedEntries = [...entries].map(e => {
        const s = sessions.find(s => s.id === e.sessionId);
        return { ...e, _date: s ? s.date : '1970-01-01' };
    }).sort((a, b) => new Date(a._date).getTime() - new Date(b._date).getTime());

    const recent = sortedEntries.slice(-3); // Get last 3
    const avg = (key: string, type: 'technical' | 'physical') => {
      const sum = recent.reduce((acc, curr) => acc + (curr[type] as any)[key], 0);
      return Math.round((sum / recent.length) * 10) / 10;
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
      ]
    };
  }, [entries, sessions]);

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja excluir este atleta? Todos os dados serão perdidos.')) {
      if (athlete) await deleteAthlete(athlete.id);
      navigate('/athletes');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (confirm('Deseja excluir este treino do histórico do atleta?')) {
        await deleteTrainingEntry(entryId);
        setRefreshKey(prev => prev + 1);
    }
  };

  const handleEditDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      // Sync update
      setEditFormData(prev => ({ ...prev, birthDate: newDate }));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editFormData.name || !athlete) return;
      await saveAthlete({ ...athlete, ...editFormData } as Athlete);
      setShowEditModal(false);
      setRefreshKey(prev => prev + 1);
  };

  const openTrainingModal = () => {
    // Pre-fill with last known stats if available
    if (entries.length > 0) {
        // Sort by date to get latest
        const sorted = [...entries].map(e => {
            const s = sessions.find(s => s.id === e.sessionId);
            return { ...e, _date: s ? s.date : '1970-01-01' };
        }).sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime()); // Descending

        const latest = sorted[0];
        setNewStats({ ...latest.technical, ...latest.physical });
    } else {
        // Reset to default
        setNewStats({
            controle: 5, passe: 5, finalizacao: 5, drible: 5, cabeceio: 5, posicao: 5,
            velocidade: 5, agilidade: 5, forca: 5, resistencia: 5, coordenacao: 5, equilibrio: 5
        });
    }
    setNewNotes('');
    setShowTrainingModal(true);
  };

  const handleQuickTraining = async () => {
     if (!athlete || !trainingDate) return;
     
     // 1. Check if session exists for this date/category/team
     let sessionId = null;
     const existingSession = sessions.find(s => s.date === trainingDate && s.teamId === athlete.teamId && s.categoryId === athlete.categoryId);
     
     if (existingSession) {
         sessionId = existingSession.id;
     } else {
         // Create new session
         sessionId = uuidv4();
         const newSession: TrainingSession = {
             id: sessionId,
             date: trainingDate,
             teamId: athlete.teamId,
             categoryId: athlete.categoryId,
             description: 'Treino Rápido (Via Perfil)'
         };
         await saveTrainingSession(newSession);
     }

     // 2. Create Entry
     const entry: TrainingEntry = {
         id: uuidv4(),
         sessionId: sessionId,
         athleteId: athlete.id,
         technical: {
            controle: newStats.controle, passe: newStats.passe, finalizacao: newStats.finalizacao,
            drible: newStats.drible, cabeceio: newStats.cabeceio, posicao: newStats.posicao
         },
         physical: {
            velocidade: newStats.velocidade, agilidade: newStats.agilidade, forca: newStats.forca,
            resistencia: newStats.resistencia, coordenacao: newStats.coordenacao, equilibrio: newStats.equilibrio
         },
         notes: newNotes
     };
     await saveTrainingEntry(entry);
     setShowTrainingModal(false);
     setRefreshKey(prev => prev + 1);
  };

  const startEditingEntry = (entry: TrainingEntry) => {
    setEditingEntryId(entry.id);
    setTempStats({ ...entry.technical, ...entry.physical });
    setTempNotes(entry.notes || '');
  };

  const saveEditingEntry = async () => {
     if(!editingEntryId || !tempStats) return;
     const entry = entries.find(e => e.id === editingEntryId);
     if(entry) {
        const updated: TrainingEntry = {
            ...entry,
            technical: {
                controle: tempStats.controle, passe: tempStats.passe, finalizacao: tempStats.finalizacao,
                drible: tempStats.drible, cabeceio: tempStats.cabeceio, posicao: tempStats.posicao
            },
            physical: {
                velocidade: tempStats.velocidade, agilidade: tempStats.agilidade, forca: tempStats.forca,
                resistencia: tempStats.resistencia, coordenacao: tempStats.coordenacao, equilibrio: tempStats.equilibrio
            },
            notes: tempNotes
        };
        await saveTrainingEntry(updated);
        setEditingEntryId(null);
        setTempStats(null);
        setTempNotes('');
        setRefreshKey(prev => prev + 1);
     }
  };

  // Helper to format date string from YYYY-MM-DD to DD/MM/YYYY without UTC conversion issues
  const formatBirthDate = (dateString: string) => {
     if (!dateString) return '';
     // Handle ISO strings (split T)
     const datePart = dateString.split('T')[0];
     const [year, month, day] = datePart.split('-');
     return `${day}/${month}/${year}`;
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!athlete) return <div className="p-8 text-center text-gray-500">Atleta não encontrado</div>;
  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded p-2 focus:outline-none focus:border-blue-500 focus:border-blue-500";

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-4">
         <Link to="/athletes" className="text-gray-500 hover:text-blue-600">
             <ArrowLeft size={24} />
         </Link>
         <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><User className="text-blue-600"/> Perfil do Atleta</h2>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
              {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" alt="" />
              ) : (
                 <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600">
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
                <div className="mt-2 text-sm text-gray-500">
                    <p>Responsável: {athlete.responsibleName}</p>
                    <p>Contato: {athlete.responsiblePhone}</p>
                </div>
              </div>
            </div>

            {/* Right Side: Score & Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto justify-between md:justify-end mt-4 md:mt-0">
                 {/* Score Highlight */}
                 <div className="text-center px-6 py-2 bg-gray-50 rounded-xl border border-gray-100 min-w-[140px]">
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Score Atual</span>
                    <span className={`block text-5xl font-black ${latestScore >= 8 ? 'text-[#4ade80]' : latestScore >= 4 ? 'text-gray-500' : 'text-red-500'}`}>
                        {latestScore > 0 ? latestScore.toFixed(1) : '--'}
                    </span>
                 </div>

                 {/* Actions Group */}
                 <div className="flex flex-col gap-2 w-full sm:w-auto">
                    <button onClick={openTrainingModal} className="bg-[#4ade80] hover:bg-green-500 text-white px-6 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm w-full">
                        <ClipboardList size={18} /> Novo Treino
                    </button>
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setShowEditModal(true)} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1">
                            <Edit size={16} /> Editar
                        </button>
                        <button onClick={handleDelete} className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar Charts */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4">Perfil Técnico (Média Recente)</h3>
              <div className="h-[300px]">
                 {currentStats ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={currentStats.technical}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} />
                        <Radar name="Técnico" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.4} />
                        <RechartsTooltip />
                      </RadarChart>
                   </ResponsiveContainer>
                 ) : <div className="h-full flex items-center justify-center text-gray-400">Sem dados</div>}
              </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4">Perfil Físico (Média Recente)</h3>
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

      {/* Evolution Line Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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

      {/* History List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
             <h3 className="font-bold text-gray-800">Histórico de Treinos</h3>
          </div>
          <div className="divide-y divide-gray-100">
              {historyData.map((item) => (
                  <div 
                    key={item!.id} 
                    className={`p-4 hover:bg-gray-50 transition-colors ${editingEntryId === item!.id ? 'bg-gray-50' : ''}`}
                  >
                      {editingEntryId === item!.id ? (
                          <div className="p-2 rounded-lg">
                              <h4 className="font-bold text-blue-600 mb-4">Editando: {item!.date}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {Object.keys(tempStats).map(key => (
                                      <div key={key}>
                                          <label className="text-xs uppercase font-bold text-gray-500">{key}</label>
                                          <input 
                                            type="number" 
                                            min="0" max="10" step="0.5"
                                            value={tempStats[key]}
                                            onChange={(e) => setTempStats({...tempStats, [key]: parseFloat(e.target.value)})}
                                            className="w-full border rounded p-1"
                                          />
                                      </div>
                                  ))}
                                  <div className="md:col-span-2">
                                    <label className="text-xs uppercase font-bold text-gray-500">Observações</label>
                                    <textarea 
                                        className="w-full border rounded p-2" 
                                        value={tempNotes}
                                        onChange={(e) => setTempNotes(e.target.value)}
                                    />
                                  </div>
                              </div>
                              <div className="mt-4 flex gap-2">
                                  <button onClick={saveEditingEntry} className="bg-green-500 text-white px-4 py-2 rounded text-sm font-bold">Salvar</button>
                                  <button onClick={() => setEditingEntryId(null)} className="bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-bold">Cancelar</button>
                              </div>
                          </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 cursor-pointer" onClick={() => setViewingEntry(item)}>
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-gray-800">{item!.date}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${item!.score >= 8 ? 'bg-green-100 text-green-800' : item!.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                                        Score: {item!.score.toFixed(1)}
                                    </span>
                                </div>
                                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                    <span>Técnica: {calculateTotalScore(item!.technical, {velocidade:0,agilidade:0,forca:0,resistencia:0,coordenacao:0,equilibrio:0} as any).toFixed(1)}</span>
                                    <span>Físico: {calculateTotalScore({controle:0,passe:0,finalizacao:0,drible:0,cabeceio:0,posicao:0} as any, item!.physical).toFixed(1)}</span>
                                </div>
                                {item!.entry.notes && (
                                   <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                                       <FileText size={12} /> <span className="truncate max-w-[200px]">{item!.entry.notes}</span>
                                   </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); startEditingEntry(item!.entry); }}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
                                  title="Editar Avaliação"
                                >
                                    <Edit size={16} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteEntry(item!.entry.id); }}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-full"
                                  title="Excluir Avaliação"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <button
                                   onClick={(e) => { e.stopPropagation(); setViewingEntry(item); }}
                                   className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"
                                >
                                    <Eye size={16} />
                                </button>
                            </div>
                        </div>
                      )}
                  </div>
              ))}
          </div>
      </div>

      {/* View Detail Modal */}
      {viewingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto relative animate-fade-in">
                 <button 
                   onClick={() => setViewingEntry(null)} 
                   className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                 >
                    <X size={24} />
                 </button>
                 
                 <div className="flex items-center gap-3 mb-6 border-b pb-4">
                     <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                         <ClipboardList size={24} />
                     </div>
                     <div>
                         <h3 className="font-bold text-xl text-gray-800">Detalhes do Treino</h3>
                         <p className="text-sm text-gray-500">{viewingEntry.date}</p>
                     </div>
                     <div className="ml-auto">
                        <span className={`text-lg font-bold px-3 py-1 rounded-lg ${viewingEntry.score >= 8 ? 'bg-green-100 text-green-800' : viewingEntry.score >= 4 ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                           {viewingEntry.score.toFixed(1)}
                        </span>
                     </div>
                 </div>

                 {viewingEntry.entry.notes && (
                     <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 mb-6">
                        <h4 className="text-xs font-bold text-yellow-700 uppercase mb-1 flex items-center gap-1">
                            <FileText size={12} /> Observações
                        </h4>
                        <p className="text-sm text-gray-700 italic">{viewingEntry.entry.notes}</p>
                     </div>
                 )}

                 <div className="grid grid-cols-2 gap-8">
                     <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase border-b pb-1 mb-3">Técnica</h4>
                        <ul className="space-y-2 text-sm">
                           {Object.entries(viewingEntry.technical).map(([key, val]: any) => (
                               <li key={key} className="flex justify-between">
                                   <span className="capitalize text-gray-600">{key}</span>
                                   <span className={`font-bold ${val < 4 ? 'text-red-500' : val < 8 ? 'text-gray-500' : 'text-green-500'}`}>{val}</span>
                               </li>
                           ))}
                        </ul>
                     </div>
                     <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase border-b pb-1 mb-3">Físico</h4>
                        <ul className="space-y-2 text-sm">
                           {Object.entries(viewingEntry.physical).map(([key, val]: any) => (
                               <li key={key} className="flex justify-between">
                                   <span className="capitalize text-gray-600">{key}</span>
                                   <span className={`font-bold ${val < 4 ? 'text-red-500' : val < 8 ? 'text-gray-500' : 'text-green-500'}`}>{val}</span>
                               </li>
                           ))}
                        </ul>
                     </div>
                 </div>
             </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg">Editar Atleta</h3>
                    <button onClick={() => setShowEditModal(false)}><X className="text-gray-400" /></button>
                </div>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="flex flex-col items-center mb-4">
                         {editFormData.photoUrl && <img src={editFormData.photoUrl} className="w-20 h-20 rounded-full object-cover mb-2" />}
                         <label className="text-sm text-blue-600 font-bold cursor-pointer">
                             Alterar Foto
                             <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                 if (e.target.files?.[0]) {
                                     const url = await processImageUpload(e.target.files[0]);
                                     setEditFormData({...editFormData, photoUrl: url});
                                 }
                             }} />
                         </label>
                    </div>
                    <input type="text" placeholder="Nome" className={inputClass} value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
                    
                    {/* Date Input with fixed value handling */}
                    <input 
                      type="date" 
                      className={inputClass} 
                      value={editFormData.birthDate ? editFormData.birthDate.split('T')[0] : ''} 
                      onChange={handleEditDateChange} 
                    />

                    <select className={inputClass} value={editFormData.categoryId} onChange={e => setEditFormData({...editFormData, categoryId: e.target.value})}>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select className={inputClass} value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value as Position})}>
                        {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input type="text" placeholder="Responsável" className={inputClass} value={editFormData.responsibleName} onChange={e => setEditFormData({...editFormData, responsibleName: e.target.value})} />
                    <input type="text" placeholder="Telefone" className={inputClass} value={editFormData.responsiblePhone} onChange={e => setEditFormData({...editFormData, responsiblePhone: e.target.value})} />
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700">Salvar Alterações</button>
                </form>
            </div>
        </div>
      )}

      {/* Quick Training Modal */}
      {showTrainingModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg">Novo Treino Rápido</h3>
                      <button onClick={() => setShowTrainingModal(false)}><X className="text-gray-400" /></button>
                  </div>
                  <div className="mb-4">
                      <label className="block text-sm font-bold text-gray-700 mb-1">Data do Treino</label>
                      <input type="date" className={inputClass} value={trainingDate} onChange={e => setTrainingDate(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-xs uppercase font-bold text-gray-500 mb-2 border-b">Técnica</h4>
                        <StatSlider label="Controle" value={newStats.controle} onChange={v => setNewStats({...newStats, controle: v})} />
                        <StatSlider label="Passe" value={newStats.passe} onChange={v => setNewStats({...newStats, passe: v})} />
                        <StatSlider label="Finalização" value={newStats.finalizacao} onChange={v => setNewStats({...newStats, finalizacao: v})} />
                        <StatSlider label="Drible" value={newStats.drible} onChange={v => setNewStats({...newStats, drible: v})} />
                        <StatSlider label="Cabeceio" value={newStats.cabeceio} onChange={v => setNewStats({...newStats, cabeceio: v})} />
                        <StatSlider label="Posição" value={newStats.posicao} onChange={v => setNewStats({...newStats, posicao: v})} />
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-bold text-gray-500 mb-2 border-b">Físico</h4>
                        <StatSlider label="Velocidade" value={newStats.velocidade} onChange={v => setNewStats({...newStats, velocidade: v})} />
                        <StatSlider label="Agilidade" value={newStats.agilidade} onChange={v => setNewStats({...newStats, agilidade: v})} />
                        <StatSlider label="Força" value={newStats.forca} onChange={v => setNewStats({...newStats, forca: v})} />
                        <StatSlider label="Resistência" value={newStats.resistencia} onChange={v => setNewStats({...newStats, resistencia: v})} />
                        <StatSlider label="Coordenação" value={newStats.coordenacao} onChange={v => setNewStats({...newStats, coordenacao: v})} />
                        <StatSlider label="Equilíbrio" value={newStats.equilibrio} onChange={v => setNewStats({...newStats, equilibrio: v})} />
                      </div>
                  </div>
                  
                  <div className="mt-4">
                      <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Observações</label>
                      <textarea 
                        className={inputClass} 
                        rows={2}
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                      ></textarea>
                  </div>

                  <div className="mt-6 pt-4 border-t">
                      <button onClick={handleQuickTraining} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg">Salvar Treino</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default AthleteProfile;