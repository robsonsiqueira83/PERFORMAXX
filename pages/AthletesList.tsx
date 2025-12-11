import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  getAthletes, 
  getCategories, 
  saveAthlete, 
  getTrainingEntries, 
  getTeams, 
  getTrainingSessions, 
  saveTrainingSession, 
  saveTrainingEntry, 
  deleteTrainingEntry, 
  saveCategory 
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, calculateTotalScore, User, canEditData, Team } from '../types';
import { Plus, Search, Upload, X, Users, Filter, ArrowUpDown, Loader2, Share2, AlertCircle, CheckCircle, Copy, ArrowRight, UserCheck, XCircle, ArrowRightLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<Athlete[]>([]); // New state for transfers
  const [teams, setTeams] = useState<Team[]>([]); // For displaying origin team name and selection
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<any[]>([]); // To calc scores
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortBy, setSortBy] = useState('registration'); // registration, score, age, alpha
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Transfer Modal State
  const [transferModal, setTransferModal] = useState<{ isOpen: boolean; athlete: Athlete | null }>({ isOpen: false, athlete: null });
  const [targetTransferTeamId, setTargetTransferTeamId] = useState<string>('');
  const [isMigrating, setIsMigrating] = useState(false);

  // User State for Permissions
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: ''
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Get current user for permission check
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));

    const load = async () => {
        setLoading(true);
        const [a, c, e, t] = await Promise.all([
            getAthletes(),
            getCategories(),
            getTrainingEntries(),
            getTeams()
        ]);
        
        // 1. Regular Athletes
        setAthletes(a.filter(item => item.teamId === teamId));
        
        // 2. Incoming Transfers (Targeting this team OR generally assigned to current user context logic if improved later)
        // Currently checks if pendingTransferTeamId matches current view
        setIncomingTransfers(a.filter(item => item.pendingTransferTeamId === teamId));

        setCategories(c.filter(item => item.teamId === teamId));
        setEntries(e);
        setTeams(t);
        setLoading(false);
    };
    load();
  }, [teamId, showModal, refreshKey]);

  // 1. Attach Meta Data (Score) to Athletes
  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const athleteEntries = entries.filter(e => e.athleteId === athlete.id);
        let averageScore = 0;
        
        if (athleteEntries.length > 0) {
            // Added curr.tactical to ensure correct average calculation
            const total = athleteEntries.reduce((acc, curr) => acc + calculateTotalScore(curr.technical, curr.physical, curr.tactical), 0);
            averageScore = total / athleteEntries.length;
        }

        return {
            ...athlete,
            averageScore
        };
    });
  }, [athletes, entries]);

  // 2. Filter
  const filtered = athletesWithMeta.filter(a => {
    const matchesName = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? a.categoryId === categoryFilter : true;
    const matchesPosition = positionFilter ? a.position === positionFilter : true;
    return matchesName && matchesCategory && matchesPosition;
  });

  // 3. Sort
  const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
          case 'score':
              return b.averageScore - a.averageScore; // Descending
          case 'age':
              return new Date(b.birthDate).getTime() - new Date(a.birthDate).getTime();
          case 'alpha':
              return a.name.localeCompare(b.name);
          case 'registration':
          default:
               return 0; 
      }
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const url = await processImageUpload(e.target.files[0]);
        setPreviewUrl(url);
      } catch (error) {
        setFeedback({ type: 'error', message: 'Erro ao processar imagem' });
      }
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    // Update state synchronously to allow typing
    setFormData(prev => ({ ...prev, birthDate: newDate }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) return;

    // Use current date (YYYY-MM-DD) if none selected
    const dateToSave = formData.birthDate || new Date().toISOString().split('T')[0];

    const newAthlete: Athlete = {
      id: uuidv4(),
      teamId,
      name: formData.name,
      categoryId: formData.categoryId,
      position: formData.position as Position,
      photoUrl: previewUrl,
      birthDate: dateToSave,
      responsibleName: formData.responsibleName || '',
      responsiblePhone: formData.responsiblePhone || ''
    };
    
    await saveAthlete(newAthlete);
    setShowModal(false);
    setFormData({ name: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: '' });
    setPreviewUrl('');
    setFeedback({ type: 'success', message: 'Atleta cadastrado com sucesso!' });
  };

  // --- TRANSFER HANDLING ---
  
  const openTransferModal = (athlete: Athlete) => {
      // Default to current teamId if available in the list
      setTargetTransferTeamId(teamId);
      setTransferModal({ isOpen: true, athlete });
  };

  const confirmTransfer = async () => {
      const { athlete } = transferModal;
      if (!athlete || !targetTransferTeamId) return;

      setIsMigrating(true);

      try {
          // --- 1. DATA MIGRATION LOGIC ---
          // Fetch necessary data
          const allEntries = await getTrainingEntries();
          const allSessions = await getTrainingSessions();
          const allCategories = await getCategories();

          // Filter entries for this athlete
          const athleteEntries = allEntries.filter(e => e.athleteId === athlete.id);
          
          // Get Target Team Categories
          const targetTeamCategories = allCategories.filter(c => c.teamId === targetTransferTeamId);
          // Get Target Team Sessions
          const targetTeamSessions = allSessions.filter(s => s.teamId === targetTransferTeamId);

          for (const entry of athleteEntries) {
              const oldSession = allSessions.find(s => s.id === entry.sessionId);
              if (!oldSession) continue; // Skip if orphan

              // A. Map Category
              const oldCategory = allCategories.find(c => c.id === oldSession.categoryId);
              let newCategoryId = '';

              if (oldCategory) {
                  // Try to find same category name in new team
                  const matchingCat = targetTeamCategories.find(c => c.name === oldCategory.name);
                  if (matchingCat) {
                      newCategoryId = matchingCat.id;
                  } else {
                      // Create new category in target team
                      newCategoryId = uuidv4();
                      await saveCategory({
                          id: newCategoryId,
                          name: oldCategory.name,
                          teamId: targetTransferTeamId
                      });
                      // Update local cache for next iteration
                      targetTeamCategories.push({ id: newCategoryId, name: oldCategory.name, teamId: targetTransferTeamId });
                  }
              }

              if (!newCategoryId) continue; // Safety skip

              // B. Map Session (Find matching date/category in target team)
              let targetSession = targetTeamSessions.find(s => 
                  s.date === oldSession.date && 
                  s.categoryId === newCategoryId
              );

              let targetSessionId = targetSession?.id;

              if (!targetSessionId) {
                  // Create new session in target team
                  targetSessionId = uuidv4();
                  const newSessionData = {
                      id: targetSessionId,
                      teamId: targetTransferTeamId,
                      categoryId: newCategoryId,
                      date: oldSession.date,
                      description: (oldSession.description || 'Treino') + ' (Migrado)'
                  };
                  await saveTrainingSession(newSessionData);
                  // Update local cache
                  targetTeamSessions.push(newSessionData);
              }

              // C. Re-create Entry pointing to New Session
              await saveTrainingEntry({
                  ...entry,
                  id: uuidv4(), // New ID for the entry
                  sessionId: targetSessionId
              });

              // D. Delete Old Entry (Clean up from old team)
              // NOTE: This might fail due to RLS if the new owner doesn't have permission on the old team.
              // We wrap in try catch to allow the transfer to proceed even if cleanup fails
              try {
                await deleteTrainingEntry(entry.id);
              } catch (e) {
                console.warn("Could not delete old entry (likely RLS permission):", e);
              }
          }

          // --- 2. ATHLETE UPDATE ---
          // Explicitly nullify pendingTransferTeamId
          const updatedAthlete = {
              ...athlete,
              teamId: targetTransferTeamId,
              pendingTransferTeamId: null, // explicit null
              categoryId: '' // reset category
          };
          
          // @ts-ignore - bypassing strict type check for null vs undefined, service handles it.
          const { error } = await saveAthlete(updatedAthlete);
          
          if (error) {
              console.error("Failed to update athlete team:", error);
              setFeedback({ 
                  type: 'error', 
                  message: 'Erro ao transferir atleta. Verifique as permissões de SQL (RLS).' 
              });
              setIsMigrating(false);
              return;
          }
          
          setTransferModal({ isOpen: false, athlete: null });
          setFeedback({ type: 'success', message: `${athlete.name} transferido e dados históricos migrados com sucesso!` });
          setRefreshKey(prev => prev + 1);

      } catch (err) {
          console.error("Erro na migração", err);
          setFeedback({ type: 'error', message: 'Erro crítico ao processar transferência.' });
      } finally {
          setIsMigrating(false);
      }
  };

  const handleRejectTransfer = async (athlete: Athlete) => {
      // Just clear the pending field, athlete stays in old team
      const updatedAthlete = {
          ...athlete,
          pendingTransferTeamId: null // Force null to clear
      };
      
      // @ts-ignore
      const { error } = await saveAthlete(updatedAthlete);

      if (error) {
           setFeedback({ type: 'error', message: 'Erro ao recusar (Permissão SQL).' });
           return;
      }

      setFeedback({ type: 'success', message: `Transferência de ${athlete.name} recusada.` });
      setRefreshKey(prev => prev + 1);
  };

  const copyPublicLink = (e: React.MouseEvent, athleteId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const link = `https://performaxx.vercel.app/#/p/athlete/${athleteId}`;
      navigator.clipboard.writeText(link);
      setFeedback({ type: 'success', message: 'Link público copiado!' });
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 rounded p-2 text-black focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  // Filter teams available for the current user to transfer INTO
  const myAvailableTeams = useMemo(() => {
      if (!currentUser) return [];
      return teams.filter(t => 
          t.ownerId === currentUser.id || // Owned
          currentUser.teamIds?.includes(t.id) // Member
      );
  }, [teams, currentUser]);

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6 relative">
      
      {/* INCOMING TRANSFERS SECTION */}
      {incomingTransfers.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6 shadow-sm animate-fade-in">
              <h3 className="text-lg font-bold text-yellow-800 flex items-center gap-2 mb-4">
                  <ArrowRight className="text-yellow-600" /> Solicitações de Transferência ({incomingTransfers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {incomingTransfers.map(athlete => {
                      const originTeam = teams.find(t => t.id === athlete.teamId);
                      return (
                          <div key={athlete.id} className="bg-white p-4 rounded-lg shadow-sm border border-yellow-100 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                  {athlete.photoUrl ? (
                                      <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover" />
                                  ) : (
                                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500">{athlete.name.charAt(0)}</div>
                                  )}
                                  <div>
                                      <h4 className="font-bold text-gray-900">{athlete.name}</h4>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                          Origem: <span className="font-bold">{originTeam?.name || 'Desconhecido'}</span>
                                      </p>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button 
                                    onClick={() => openTransferModal(athlete)}
                                    className="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1 text-sm font-bold"
                                    title="Aceitar"
                                  >
                                      <UserCheck size={18} /> <span className="hidden sm:inline">Aceitar</span>
                                  </button>
                                  <button 
                                    onClick={() => handleRejectTransfer(athlete)}
                                    className="bg-red-100 text-red-700 p-2 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1 text-sm font-bold"
                                    title="Recusar"
                                  >
                                      <XCircle size={18} /> <span className="hidden sm:inline">Recusar</span>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-blue-600" /> Atletas
        </h2>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto flex-wrap">
          
          {/* Category Filter */}
          <div className="relative w-full md:w-auto">
             <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <select 
               className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full md:w-40 bg-gray-100 text-black appearance-none"
               value={categoryFilter}
               onChange={(e) => setCategoryFilter(e.target.value)}
             >
               <option value="">Categoria (Todas)</option>
               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
             </select>
          </div>

          {/* Position Filter */}
          <div className="relative w-full md:w-auto">
             <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <select 
               className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full md:w-40 bg-gray-100 text-black appearance-none"
               value={positionFilter}
               onChange={(e) => setPositionFilter(e.target.value)}
             >
               <option value="">Posição (Todas)</option>
               {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
             </select>
          </div>

          {/* Sort Select */}
          <div className="relative w-full md:w-auto">
             <ArrowUpDown className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <select 
               className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full md:w-40 bg-gray-100 text-black appearance-none"
               value={sortBy}
               onChange={(e) => setSortBy(e.target.value)}
             >
               <option value="registration">Cadastro (Recente)</option>
               <option value="score">Melhor Score</option>
               <option value="age">Idade (Jovem-Velho)</option>
               <option value="alpha">Alfabética (A-Z)</option>
             </select>
          </div>

          {/* Name Search */}
          <div className="relative flex-1 min-w-[200px]">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Buscar atleta..." 
               className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full bg-gray-100 text-black"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
          </div>

          {currentUser && canEditData(currentUser.role) && (
            <button 
                onClick={() => setShowModal(true)}
                className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 whitespace-nowrap w-full md:w-auto"
            >
                <Plus size={18} /> Novo Atleta
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {sorted.map(athlete => (
           <Link to={`/athletes/${athlete.id}`} key={athlete.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center hover:shadow-md transition-shadow group relative">
               
               {/* Share Button (New) */}
               <button 
                 onClick={(e) => copyPublicLink(e, athlete.id)}
                 className="absolute top-3 left-3 text-gray-400 hover:text-blue-600 p-1 bg-white/80 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
                 title="Copiar Link Público"
               >
                   <Share2 size={16} />
               </button>

               {/* Score Badge */}
               <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full border ${
                   athlete.averageScore >= 8 ? 'bg-green-100 text-green-800 border-green-200' :
                   athlete.averageScore >= 4 ? 'bg-gray-100 text-gray-600 border-gray-200' :
                   athlete.averageScore > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-100'
               }`}>
                   {athlete.averageScore > 0 ? athlete.averageScore.toFixed(1) : '-'}
               </div>

               {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} alt={athlete.name} className="w-24 h-24 rounded-full object-cover mb-3 group-hover:scale-105 transition-transform" />
               ) : (
                 <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-gray-400 mb-3 group-hover:scale-105 transition-transform">
                    {athlete.name.charAt(0)}
                 </div>
               )}
               <h3 className="font-bold text-gray-800 text-center">{athlete.name}</h3>
               <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 font-semibold">{athlete.position}</span>
               
               <div className="flex gap-1 mt-2">
                   <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-100">
                       {getCalculatedCategory(athlete.birthDate)}
                   </span>
               </div>
               
               {/* Pending Transfer Badge */}
               {athlete.pendingTransferTeamId && (
                   <div className="mt-2 text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200 font-bold">
                       Transferência Solicitada
                   </div>
               )}
           </Link>
         ))}
         {sorted.length === 0 && (
             <div className="col-span-full text-center py-10 text-gray-500">
                 Nenhum atleta encontrado com os filtros selecionados.
             </div>
         )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h3 className="text-xl font-bold flex items-center gap-2"><Plus className="text-green-500"/> Cadastrar Atleta</h3>
                <button onClick={() => setShowModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="flex flex-col items-center mb-4">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                       {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Users size={32} className="text-gray-400" />}
                    </div>
                    <label className="cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800">
                       <Upload size={14} /> Carregar Foto
                       <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                    <span className="text-xs text-gray-400 mt-1">Max: 150x150px, 200kb</span>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
                   <input required type="text" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Data Nasc.</label>
                      <input type="date" className={inputClass} value={formData.birthDate} onChange={handleDateChange} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1 flex justify-between items-center">
                          Categoria 
                          {formData.birthDate && (
                              <span className="text-xs text-blue-600 font-bold bg-blue-50 px-1 rounded">
                                  Sug: {getCalculatedCategory(formData.birthDate)}
                              </span>
                          )}
                      </label>
                      <select required className={inputClass} value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                         <option value="">Selecione...</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Posição</label>
                   <select className={inputClass} value={formData.position} onChange={e => setFormData({...formData, position: e.target.value as Position})}>
                      {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                   </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Responsável</label>
                     <input type="text" className={inputClass} value={formData.responsibleName} onChange={e => setFormData({...formData, responsibleName: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                     <input type="text" className={inputClass} value={formData.responsiblePhone} onChange={e => setFormData({...formData, responsiblePhone: e.target.value})} />
                   </div>
                 </div>

                 <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 hover:bg-blue-700 transition-colors">
                    Cadastrar
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* ACCEPT TRANSFER MODAL */}
      {transferModal.isOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                         <ArrowRightLeft className="text-blue-600" /> Aceitar Transferência
                     </h3>
                     <button onClick={() => setTransferModal({isOpen: false, athlete: null})}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                 </div>
                 
                 <p className="text-sm text-gray-600 mb-6">
                     Selecione o time de destino para o atleta <strong>{transferModal.athlete?.name}</strong>. Todos os dados históricos serão migrados automaticamente.
                 </p>

                 <div className="mb-6">
                     <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Time de Destino</label>
                     <select 
                        className={inputClass}
                        value={targetTransferTeamId}
                        onChange={(e) => setTargetTransferTeamId(e.target.value)}
                     >
                         <option value="">Selecione um time...</option>
                         {myAvailableTeams.map(t => (
                             <option key={t.id} value={t.id}>{t.name}</option>
                         ))}
                     </select>
                 </div>

                 <div className="flex gap-3">
                     <button onClick={() => setTransferModal({isOpen: false, athlete: null})} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button 
                        onClick={confirmTransfer} 
                        disabled={!targetTransferTeamId || isMigrating}
                        className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                         {isMigrating ? <Loader2 className="animate-spin" size={16} /> : null}
                         {isMigrating ? 'Migrando...' : 'Confirmar'}
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* FEEDBACK MODAL (Toast style but centered/modal as requested) */}
      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full relative">
                 <button onClick={() => setFeedback(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${feedback.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="text-green-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{feedback.type === 'success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-gray-500 text-center mb-6">{feedback.message}</p>
                 <button onClick={() => setFeedback(null)} className={`text-white font-bold py-2 px-6 rounded-lg transition-colors w-full ${feedback.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                     OK
                 </button>
             </div>
         </div>
      )}

    </div>
  );
};

export default AthletesList;