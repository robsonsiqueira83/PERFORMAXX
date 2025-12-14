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
  saveCategory,
  saveTeam, 
  deleteTrainingEntry
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, calculateTotalScore, User, canEditData, Team, normalizeCategoryName, UserRole } from '../types';
import { Plus, Search, Upload, X, Users, Filter, ArrowUpDown, Loader2, Share2, AlertCircle, CheckCircle, ArrowRight, UserCheck, XCircle, ArrowRightLeft, Download, Rocket, PlayCircle, LogOut, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]); // Current team athletes
  const [allSystemAthletes, setAllSystemAthletes] = useState<Athlete[]>([]); // For outgoing requests check
  
  const [transferRequestsReceived, setTransferRequestsReceived] = useState<Athlete[]>([]); // Requests to take MY players
  const [transferRequestsSent, setTransferRequestsSent] = useState<Athlete[]>([]); // Requests I sent to others

  const [teams, setTeams] = useState<Team[]>([]); 
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<any[]>([]); // To calc scores
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortBy, setSortBy] = useState('registration'); 
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Transfer Modal State (For Approval/Release)
  const [transferModal, setTransferModal] = useState<{ isOpen: boolean; athlete: Athlete | null }>({ isOpen: false, athlete: null });
  const [isMigrating, setIsMigrating] = useState(false);

  // Pull Athlete Modal (Solicitação de Transferência por RG)
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullRgInput, setPullRgInput] = useState('');
  const [foundAthleteToPull, setFoundAthleteToPull] = useState<Athlete | null>(null);
  const [pullSearchError, setPullSearchError] = useState('');

  // Duplicate Conflict Modal State
  const [duplicateConflict, setDuplicateConflict] = useState<{ athlete: Athlete, teamName: string } | null>(null);

  // Quick Setup Modal State
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState<'team_and_category' | 'category_only'>('team_and_category');
  const [setupData, setSetupData] = useState({ teamName: '', categoryName: 'Sub-15' });
  const [pendingAction, setPendingAction] = useState<'create' | 'import' | null>(null);

  // User State for Permissions
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: ''
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
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
        
        // --- 1. BACKFILL CHECK: Verify if any athlete is missing an ID and fix it ---
        const athletesMissingRg = a.filter(ath => !ath.rg || ath.rg.trim() === '');
        let updatedAllAthletes = [...a];

        if (athletesMissingRg.length > 0) {
            // Create a Set of existing RGs for fast lookup during generation
            const existingRgs = new Set(a.map(ath => ath.rg).filter(Boolean) as string[]);
            
            for (const ath of athletesMissingRg) {
                let newId = '';
                let isUnique = false;
                
                // Generate Unique ID Loop
                while (!isUnique) {
                    newId = `PROV-${uuidv4().substring(0, 6).toUpperCase()}`;
                    if (!existingRgs.has(newId)) {
                        isUnique = true;
                        existingRgs.add(newId);
                    }
                }
                
                // Save update
                await saveAthlete({ ...ath, rg: newId });
                
                // Update local array to reflect change immediately without re-fetch
                const index = updatedAllAthletes.findIndex(u => u.id === ath.id);
                if (index !== -1) {
                    updatedAllAthletes[index] = { ...updatedAllAthletes[index], rg: newId };
                }
            }
        }
        // --------------------------------------------------------------------------

        setAllSystemAthletes(updatedAllAthletes);

        // 1. My Athletes
        const myAthletes = updatedAllAthletes.filter(item => item.teamId === teamId);
        setAthletes(myAthletes);
        
        // 2. Incoming Requests (Someone wants MY player)
        setTransferRequestsReceived(myAthletes.filter(item => item.pendingTransferTeamId && item.pendingTransferTeamId !== teamId));

        // 3. Outgoing Requests (I want someone else's player)
        setTransferRequestsSent(updatedAllAthletes.filter(item => item.teamId !== teamId && item.pendingTransferTeamId === teamId));

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
    setFormData(prev => ({ ...prev, birthDate: newDate }));
  };

  // --- QUICK SETUP CHECK LOGIC ---
  const handleActionClick = (action: 'create' | 'import') => {
      const myTeams = currentUser?.role === UserRole.GLOBAL 
          ? teams 
          : teams.filter(t => t.ownerId === currentUser?.id || currentUser?.teamIds?.includes(t.id));

      const hasTeam = myTeams.length > 0;
      const hasCategory = categories.length > 0;

      if (!hasTeam) {
          setSetupStep('team_and_category');
          setPendingAction(action);
          setShowSetupModal(true);
      } else if (!hasCategory) {
          setSetupStep('category_only');
          setPendingAction(action);
          setShowSetupModal(true);
      } else {
          if (action === 'create') setShowModal(true);
          if (action === 'import') setShowPullModal(true);
      }
  };

  const handleQuickSetupSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!setupData.teamName && setupStep === 'team_and_category') return;
      if (!setupData.categoryName) return;

      try {
          let newTeamId = teamId;

          if (setupStep === 'team_and_category' && currentUser) {
              newTeamId = uuidv4();
              await saveTeam({
                  id: newTeamId,
                  name: setupData.teamName,
                  ownerId: currentUser.id
              });
          }

          const newCatId = uuidv4();
          await saveCategory({
              id: newCatId,
              name: normalizeCategoryName(setupData.categoryName),
              teamId: newTeamId
          });

          setShowSetupModal(false);
          setSetupData({ teamName: '', categoryName: '' });

          if (setupStep === 'team_and_category') {
              window.location.reload();
          } else {
              setRefreshKey(prev => prev + 1);
              setFeedback({ type: 'success', message: 'Configuração concluída! Agora você pode prosseguir.' });
              setTimeout(() => {
                  if (pendingAction === 'create') setShowModal(true);
                  if (pendingAction === 'import') setShowPullModal(true);
                  setPendingAction(null);
              }, 500);
          }

      } catch (error) {
          console.error("Setup error", error);
          setFeedback({ type: 'error', message: 'Erro ao configurar ambiente inicial.' });
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) return;

    const dateToSave = formData.birthDate || new Date().toISOString().split('T')[0];
    let finalRg = formData.rg ? formData.rg.trim() : '';

    // --- RG VALIDATION & UNIQUENESS CHECK ---
    if (finalRg) {
        // 1. Validate Format
        const rgRegex = /^[0-9xX.-]{5,20}$/;
        if (!rgRegex.test(finalRg)) {
             setFeedback({ type: 'error', message: 'RG inválido. Insira apenas números, pontos e traços (mínimo 5 caracteres).' });
             return;
        }

        // 2. Check Uniqueness & Trigger Conflict Flow
        const existingAthlete = allSystemAthletes.find(a => a.rg === finalRg);
        if (existingAthlete) {
             if (existingAthlete.teamId === teamId) {
                 setFeedback({ type: 'error', message: 'Este atleta já está cadastrado no seu time.' });
             } else {
                 // Found in ANOTHER team -> Trigger Transfer Logic
                 const ownerTeam = teams.find(t => t.id === existingAthlete.teamId);
                 setDuplicateConflict({
                     athlete: existingAthlete,
                     teamName: ownerTeam?.name || 'Time Desconhecido'
                 });
                 setShowModal(false); // Close create form
             }
             return;
        }
    } else {
        // 3. Generate Unique ID (Auto)
        let isUnique = false;
        while (!isUnique) {
            finalRg = `PROV-${uuidv4().substring(0, 6).toUpperCase()}`;
            const exists = allSystemAthletes.some(a => a.rg === finalRg);
            if (!exists) isUnique = true;
        }
    }

    const newAthlete: Athlete = {
      id: uuidv4(),
      teamId,
      rg: finalRg,
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
    setFormData({ name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: '' });
    setPreviewUrl('');
    setFeedback({ type: 'success', message: 'Atleta cadastrado com sucesso!' });
    setRefreshKey(prev => prev + 1);
  };

  // --- PULL ATHLETE HANDLING ---
  const handleSearchAthleteByRg = async () => {
    setPullSearchError('');
    setFoundAthleteToPull(null);
    if (!pullRgInput) return;

    const allAthletes = await getAthletes();
    const found = allAthletes.find(a => a.rg === pullRgInput);

    if (found) {
        if (found.teamId === teamId) {
            setPullSearchError('Este atleta já está no seu time.');
        } else {
            setFoundAthleteToPull(found);
        }
    } else {
        setPullSearchError('Nenhum atleta encontrado com este RG.');
    }
  };

  const handleRequestPull = async () => {
      if (!foundAthleteToPull) return;
      const updatedAthlete = {
          ...foundAthleteToPull,
          pendingTransferTeamId: teamId
      };
      // @ts-ignore
      await saveAthlete(updatedAthlete);
      setShowPullModal(false);
      setPullRgInput('');
      setFoundAthleteToPull(null);
      setFeedback({ type: 'success', message: 'Solicitação enviada! O time atual deve aprovar a liberação.' });
      setRefreshKey(prev => prev + 1);
  };

  const handleRequestTransferFromConflict = async () => {
      if (!duplicateConflict) return;
      
      const updatedAthlete = {
          ...duplicateConflict.athlete,
          pendingTransferTeamId: teamId
      };
      
      // @ts-ignore
      await saveAthlete(updatedAthlete);
      setDuplicateConflict(null);
      setFeedback({ type: 'success', message: 'Solicitação enviada! Aguarde a aprovação do time atual.' });
      setRefreshKey(prev => prev + 1);
  };

  const handleCancelRequest = async (athlete: Athlete) => {
      const updatedAthlete = { ...athlete, pendingTransferTeamId: null };
      // @ts-ignore
      await saveAthlete(updatedAthlete);
      setFeedback({ type: 'success', message: 'Solicitação cancelada.' });
      setRefreshKey(prev => prev + 1);
  };

  // --- APPROVAL / RELEASE HANDLING (Owner Logic) ---
  const openApprovalModal = (athlete: Athlete) => {
      setTransferModal({ isOpen: true, athlete });
  };

  const confirmRelease = async () => {
      const { athlete } = transferModal;
      if (!athlete || !athlete.pendingTransferTeamId) return;

      const targetTeamId = athlete.pendingTransferTeamId; // Pre-set by requester
      setIsMigrating(true);

      try {
          const allEntries = await getTrainingEntries();
          const allSessions = await getTrainingSessions();
          const allCategories = await getCategories();

          // A. RESOLVE MAIN ATHLETE CATEGORY (Target Team)
          let newMainCategoryId = '';
          
          if (athlete.categoryId) {
              const currentCatObj = allCategories.find(c => c.id === athlete.categoryId);
              if (currentCatObj) {
                  const standardName = normalizeCategoryName(currentCatObj.name);
                  const match = allCategories.find(c => c.teamId === targetTeamId && normalizeCategoryName(c.name) === standardName);
                  
                  if (match) {
                      newMainCategoryId = match.id;
                  } else {
                      newMainCategoryId = uuidv4();
                      const newCat = { 
                          id: newMainCategoryId, 
                          name: standardName, 
                          teamId: targetTeamId 
                      };
                      await saveCategory(newCat);
                      allCategories.push(newCat); 
                  }
              }
          }

          // B. DATA MIGRATION LOGIC (History)
          const athleteEntries = allEntries.filter(e => e.athleteId === athlete.id);
          
          if (athleteEntries.length > 0) {
              const targetTeamSessions = allSessions.filter(s => s.teamId === targetTeamId);

              for (const entry of athleteEntries) {
                  const oldSession = allSessions.find(s => s.id === entry.sessionId);
                  if (!oldSession) continue;

                  const oldCategory = allCategories.find(c => c.id === oldSession.categoryId);
                  let sessionNewCategoryId = '';

                  if (oldCategory) {
                      const oldStandardName = normalizeCategoryName(oldCategory.name);
                      const matchingCat = allCategories.find(c => c.teamId === targetTeamId && normalizeCategoryName(c.name) === oldStandardName);
                      
                      if (matchingCat) {
                          sessionNewCategoryId = matchingCat.id;
                      } else {
                          sessionNewCategoryId = uuidv4();
                          const newCat = {
                              id: sessionNewCategoryId,
                              name: oldStandardName,
                              teamId: targetTeamId
                          };
                          await saveCategory(newCat);
                          allCategories.push(newCat);
                      }
                  }

                  if (!sessionNewCategoryId) continue;

                  let targetSession = targetTeamSessions.find(s => 
                      s.date === oldSession.date && 
                      s.categoryId === sessionNewCategoryId
                  );

                  let targetSessionId = targetSession?.id;

                  if (!targetSessionId) {
                      targetSessionId = uuidv4();
                      const newSessionData = {
                          id: targetSessionId,
                          teamId: targetTeamId,
                          categoryId: sessionNewCategoryId,
                          date: oldSession.date,
                          description: (oldSession.description || 'Treino') + ' (Migrado)'
                      };
                      await saveTrainingSession(newSessionData);
                      targetTeamSessions.push(newSessionData);
                  }

                  await saveTrainingEntry({
                      ...entry,
                      id: uuidv4(), 
                      sessionId: targetSessionId
                  });
              }
          }

          // C. ATHLETE UPDATE (Move to new team, clear pending)
          const updatedAthlete = {
              ...athlete,
              teamId: targetTeamId,
              pendingTransferTeamId: null, 
              categoryId: newMainCategoryId || '' 
          };
          
          // @ts-ignore
          const { error } = await saveAthlete(updatedAthlete);
          
          if (error) {
              setFeedback({ type: 'error', message: `Erro na transferência: ${error.message}` });
              setIsMigrating(false);
              return;
          }
          
          setTransferModal({ isOpen: false, athlete: null });
          setFeedback({ type: 'success', message: `Atleta ${athlete.name} liberado com sucesso!` });
          setRefreshKey(prev => prev + 1);

      } catch (err: any) {
          console.error("Erro na migração", err);
          setFeedback({ type: 'error', message: `Erro crítico: ${err.message}` });
      } finally {
          setIsMigrating(false);
      }
  };

  const handleRejectRelease = async (athlete: Athlete) => {
      const updatedAthlete = { ...athlete, pendingTransferTeamId: null };
      // @ts-ignore
      const { error } = await saveAthlete(updatedAthlete);
      if (error) {
           setFeedback({ type: 'error', message: 'Erro ao recusar.' });
           return;
      }
      setFeedback({ type: 'success', message: `Solicitação recusada.` });
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

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6 relative">
      
      {/* 1. REQUESTS RECEIVED (OWNER PANEL - APPROVAL FLOW) */}
      {transferRequestsReceived.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6 shadow-sm animate-fade-in">
              <h3 className="text-lg font-bold text-orange-800 flex items-center gap-2 mb-4">
                  <LogOut className="text-orange-600" /> Solicitações de Liberação ({transferRequestsReceived.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {transferRequestsReceived.map(athlete => {
                      const destTeam = teams.find(t => t.id === athlete.pendingTransferTeamId);
                      return (
                          <div key={athlete.id} className="bg-white p-4 rounded-lg shadow-sm border border-orange-100 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                  {athlete.photoUrl ? (
                                      <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover" />
                                  ) : (
                                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500">{athlete.name.charAt(0)}</div>
                                  )}
                                  <div>
                                      <h4 className="font-bold text-gray-900">{athlete.name}</h4>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                          Destino: <span className="font-bold">{destTeam?.name || 'ID: ' + athlete.pendingTransferTeamId}</span>
                                      </p>
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button 
                                    onClick={() => openApprovalModal(athlete)}
                                    className="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1 text-sm font-bold"
                                    title="Aprovar Liberação"
                                  >
                                      <UserCheck size={18} /> <span className="hidden sm:inline">Liberar</span>
                                  </button>
                                  <button 
                                    onClick={() => handleRejectRelease(athlete)}
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

      {/* 2. REQUESTS SENT (REQUESTER PANEL - PENDING STATUS) */}
      {transferRequestsSent.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6 shadow-sm animate-fade-in">
              <h3 className="text-lg font-bold text-blue-800 flex items-center gap-2 mb-4">
                  <ArrowRightLeft className="text-blue-600" /> Minhas Solicitações Enviadas ({transferRequestsSent.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {transferRequestsSent.map(athlete => {
                      const currentOwnerTeam = teams.find(t => t.id === athlete.teamId);
                      return (
                          <div key={athlete.id} className="bg-white p-4 rounded-lg shadow-sm border border-blue-100 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                  {athlete.photoUrl ? (
                                      <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover grayscale opacity-70" />
                                  ) : (
                                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500">{athlete.name.charAt(0)}</div>
                                  )}
                                  <div>
                                      <h4 className="font-bold text-gray-900">{athlete.name}</h4>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                          Origem: <span className="font-bold">{currentOwnerTeam?.name || 'Outro Time'}</span>
                                      </p>
                                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">Aguardando Aprovação</span>
                                  </div>
                              </div>
                              <button 
                                onClick={() => handleCancelRequest(athlete)}
                                className="text-gray-400 hover:text-red-500 p-2 rounded-lg transition-colors"
                                title="Cancelar Solicitação"
                              >
                                  <XCircle size={18} />
                              </button>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* 3. MAIN LIST */}
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
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={() => handleActionClick('import')}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-lg font-bold flex items-center justify-center transition-colors border border-blue-200"
                    title="Solicitar Atleta de outro Time (via RG)"
                >
                    <Download size={18} />
                </button>
                <button 
                    onClick={() => handleActionClick('create')}
                    className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 whitespace-nowrap flex-1 md:flex-none"
                >
                    <Plus size={18} /> Novo Atleta
                </button>
            </div>
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
               
               <div className="flex flex-col items-center gap-1 mt-2">
                   <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-100">
                       {getCalculatedCategory(athlete.birthDate)}
                   </span>
                   {athlete.rg && (
                       <span className="text-[10px] text-gray-400 font-mono">
                           RG: {athlete.rg}
                       </span>
                   )}
               </div>
               
               {/* Pending Transfer Badge (If requesting my own player - weird but possible if glitch) */}
               {athlete.pendingTransferTeamId && (
                   <div className="mt-2 text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded border border-orange-200 font-bold">
                       Solicitação de Saída Pendente
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

      {/* QUICK SETUP MODAL (For First Time Users) */}
      {showSetupModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl relative text-center">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Rocket className="text-blue-600" size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Vamos começar!</h2>
                  <p className="text-gray-500 mb-6">
                      Para cadastrar atletas, você precisa configurar seu ambiente inicial.
                  </p>

                  <form onSubmit={handleQuickSetupSubmit} className="text-left space-y-4">
                      {setupStep === 'team_and_category' && (
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Nome do seu Time</label>
                              <input 
                                  autoFocus
                                  type="text" 
                                  className={inputClass}
                                  placeholder="Ex: Escolinha Craque do Futuro"
                                  value={setupData.teamName}
                                  onChange={(e) => setSetupData({...setupData, teamName: e.target.value})}
                                  required
                              />
                          </div>
                      )}
                      
                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Primeira Categoria</label>
                          <input 
                              type="text" 
                              className={inputClass}
                              placeholder="Ex: Sub-15"
                              value={setupData.categoryName}
                              onChange={(e) => setSetupData({...setupData, categoryName: e.target.value})}
                              required
                          />
                          <p className="text-xs text-gray-400 mt-1">Você poderá adicionar mais categorias depois.</p>
                      </div>

                      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg">
                          <PlayCircle size={20} />
                          {setupStep === 'team_and_category' ? 'Criar Time e Começar' : 'Criar Categoria e Prosseguir'}
                      </button>
                  </form>
                  
                  <button onClick={() => setShowSetupModal(false)} className="mt-4 text-sm text-gray-400 hover:text-gray-600 underline">
                      Cancelar e voltar
                  </button>
              </div>
          </div>
      )}

      {/* NEW ATHLETE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
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

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1 flex justify-between">
                       RG / Identificador 
                       <span className="text-[10px] text-gray-400 font-normal">Opcional (Gerado auto. se vazio)</span>
                   </label>
                   <input 
                       type="text" 
                       className={inputClass} 
                       value={formData.rg} 
                       onChange={e => setFormData({...formData, rg: e.target.value})} 
                       placeholder="Ex: 12.345.678-9 ou deixe vazio"
                   />
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

      {/* DUPLICATE RG CONFLICT MODAL */}
      {duplicateConflict && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center border-2 border-yellow-400">
                 <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-yellow-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Atleta Já Cadastrado!</h3>
                 <p className="text-sm text-gray-600 mb-4">
                     O atleta <strong>{duplicateConflict.athlete.name}</strong> (RG: {duplicateConflict.athlete.rg}) já faz parte do time:
                 </p>
                 <div className="bg-gray-100 p-3 rounded-lg mb-6 font-bold text-gray-800 border border-gray-200">
                     {duplicateConflict.teamName}
                 </div>
                 
                 <div className="flex flex-col gap-2">
                     <button 
                        onClick={handleRequestTransferFromConflict}
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                     >
                         <ArrowRightLeft size={18} /> Solicitar Transferência
                     </button>
                     <button 
                        onClick={() => setDuplicateConflict(null)}
                        className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-200"
                     >
                         Cancelar
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* PULL ATHLETE MODAL (Solicitar por RG) */}
      {showPullModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl relative">
                 <button onClick={() => setShowPullModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                 
                 <div className="text-center mb-6">
                     <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                         <Download className="text-blue-600" size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-gray-800">Solicitar Atleta</h3>
                     <p className="text-sm text-gray-500 mt-1">Busque um atleta pelo RG para solicitar transferência para o seu time.</p>
                 </div>

                 <div className="mb-4">
                     <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">RG do Atleta</label>
                     <div className="flex gap-2">
                        <input 
                            type="text" 
                            className="flex-1 bg-gray-100 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="Digite o RG exato..."
                            value={pullRgInput}
                            onChange={(e) => setPullRgInput(e.target.value)}
                        />
                        <button 
                            onClick={handleSearchAthleteByRg}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 rounded font-bold"
                        >
                            <Search size={18} />
                        </button>
                     </div>
                     {pullSearchError && <p className="text-xs text-red-500 mt-1 font-bold">{pullSearchError}</p>}
                 </div>

                 {foundAthleteToPull && (
                     <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-3">
                         {foundAthleteToPull.photoUrl ? (
                             <img src={foundAthleteToPull.photoUrl} className="w-10 h-10 rounded-full object-cover" />
                         ) : (
                             <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 text-xs">{foundAthleteToPull.name.charAt(0)}</div>
                         )}
                         <div className="flex-1 min-w-0">
                             <p className="font-bold text-gray-800 text-sm truncate">{foundAthleteToPull.name}</p>
                             <p className="text-xs text-gray-500">
                                 {teams.find(t => t.id === foundAthleteToPull.teamId)?.name || 'Time Desconhecido'}
                             </p>
                         </div>
                     </div>
                 )}

                 <button 
                    onClick={handleRequestPull}
                    disabled={!foundAthleteToPull}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                     Solicitar Transferência
                 </button>
             </div>
          </div>
      )}

      {/* APPROVAL MODAL (OWNER) */}
      {transferModal.isOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckCircle className="text-green-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Liberar Atleta?</h3>
                 <p className="text-gray-600 text-sm mb-6">
                     Você confirma a transferência de <strong>{transferModal.athlete?.name}</strong> para o time solicitante? 
                     <br/><br/>
                     <span className="text-xs text-gray-500 italic">O histórico de treinos será migrado junto com o atleta.</span>
                 </p>

                 <div className="flex gap-3">
                     <button onClick={() => setTransferModal({isOpen: false, athlete: null})} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button 
                        onClick={confirmRelease} 
                        disabled={isMigrating}
                        className="flex-1 bg-green-600 text-white font-bold py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                         {isMigrating ? <Loader2 className="animate-spin" size={16} /> : null}
                         {isMigrating ? 'Processando...' : 'Confirmar'}
                     </button>
                 </div>
             </div>
         </div>
      )}

      {/* FEEDBACK MODAL */}
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