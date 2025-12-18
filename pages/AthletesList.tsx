
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
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allSystemAthletes, setAllSystemAthletes] = useState<Athlete[]>([]);
  const [transferRequestsReceived, setTransferRequestsReceived] = useState<Athlete[]>([]);
  const [transferRequestsSent, setTransferRequestsSent] = useState<Athlete[]>([]);
  const [teams, setTeams] = useState<Team[]>([]); 
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortBy, setSortBy] = useState('registration'); 
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [transferModal, setTransferModal] = useState<{ isOpen: boolean; athlete: Athlete | null }>({ isOpen: false, athlete: null });
  const [isMigrating, setIsMigrating] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullRgInput, setPullRgInput] = useState('');
  const [foundAthleteToPull, setFoundAthleteToPull] = useState<Athlete | null>(null);
  const [pullSearchError, setPullSearchError] = useState('');
  const [duplicateConflict, setDuplicateConflict] = useState<{ athlete: Athlete, teamName: string } | null>(null);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState<'team_and_category' | 'category_only'>('team_and_category');
  const [setupData, setSetupData] = useState({ teamName: '', categoryName: 'Sub-15' });
  const [pendingAction, setPendingAction] = useState<'create' | 'import' | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: ''
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
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
        
        const athletesMissingRg = a.filter(ath => !ath.rg || ath.rg.trim() === '');
        let updatedAllAthletes = [...a];

        if (athletesMissingRg.length > 0) {
            const existingRgs = new Set(a.map(ath => ath.rg).filter(Boolean) as string[]);
            for (const ath of athletesMissingRg) {
                let newId = '';
                let isUnique = false;
                while (!isUnique) {
                    newId = `PROV-${uuidv4().substring(0, 6).toUpperCase()}`;
                    if (!existingRgs.has(newId)) {
                        isUnique = true;
                        existingRgs.add(newId);
                    }
                }
                await saveAthlete({ ...ath, rg: newId });
                const index = updatedAllAthletes.findIndex(u => u.id === ath.id);
                if (index !== -1) updatedAllAthletes[index] = { ...updatedAllAthletes[index], rg: newId };
            }
        }

        setAllSystemAthletes(updatedAllAthletes);
        setAthletes(updatedAllAthletes.filter(item => item.teamId === teamId));
        setTransferRequestsReceived(updatedAllAthletes.filter(item => item.teamId === teamId && item.pendingTransferTeamId && item.pendingTransferTeamId !== teamId));
        setTransferRequestsSent(updatedAllAthletes.filter(item => item.teamId !== teamId && item.pendingTransferTeamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setEntries(e);
        setTeams(t);
        setLoading(false);
    };
    load();
  }, [teamId, showModal, refreshKey]);

  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const athleteEntries = entries.filter(e => e.athleteId === athlete.id);
        let averageScore = 0;
        if (athleteEntries.length > 0) {
            const total = athleteEntries.reduce((acc, curr) => acc + calculateTotalScore(curr.technical, curr.physical, curr.tactical), 0);
            averageScore = total / athleteEntries.length;
        }
        return { ...athlete, averageScore };
    });
  }, [athletes, entries]);

  const filtered = athletesWithMeta.filter(a => {
    const matchesName = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? a.categoryId === categoryFilter : true;
    const matchesPosition = positionFilter ? a.position === positionFilter : true;
    return matchesName && matchesCategory && matchesPosition;
  });

  const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
          case 'score': return b.averageScore - a.averageScore;
          case 'age': return new Date(b.birthDate).getTime() - new Date(a.birthDate).getTime();
          case 'alpha': return a.name.localeCompare(b.name);
          default: return 0; 
      }
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        e.target.value = '';
        const url = await processImageUpload(file);
        setPreviewUrl(url);
      } catch (error) {
        setFeedback({ type: 'error', message: 'Erro ao processar imagem' });
      } finally {
        setUploading(false);
      }
    }
  };

  const handleActionClick = (action: 'create' | 'import') => {
      const myTeams = teams.filter(t => t.ownerId === currentUser?.id || currentUser?.teamIds?.includes(t.id));
      const hasCategory = categories.length > 0;

      if (myTeams.length === 0) {
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
      setLoading(true);
      try {
          let targetTeamId = teamId;
          if (setupStep === 'team_and_category' && currentUser) {
              targetTeamId = uuidv4();
              await saveTeam({ id: targetTeamId, name: setupData.teamName, ownerId: currentUser.id });
          }
          const newCatId = uuidv4();
          await saveCategory({ id: newCatId, name: normalizeCategoryName(setupData.categoryName), teamId: targetTeamId });
          
          setShowSetupModal(false);
          setSetupData({ teamName: '', categoryName: '' });
          
          // Forçar atualização do contexto global
          if (setupStep === 'team_and_category') {
              localStorage.setItem('performax_context_id', currentUser?.id || '');
              window.location.reload();
          } else {
              setRefreshKey(prev => prev + 1);
              setFeedback({ type: 'success', message: 'Configuração salva! Pode prosseguir.' });
              if (pendingAction === 'create') setTimeout(() => setShowModal(true), 500);
              if (pendingAction === 'import') setTimeout(() => setShowPullModal(true), 500);
          }
      } catch (error: any) {
          console.error("Erro no setup:", error);
          setFeedback({ type: 'error', message: `Erro ao salvar: ${error.message || 'Falha de conexão'}` });
      } finally {
          setLoading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) return;
    setLoading(true);
    try {
        let finalRg = formData.rg ? formData.rg.trim() : `PROV-${uuidv4().substring(0, 6).toUpperCase()}`;
        const newAthlete: Athlete = {
          id: uuidv4(), teamId, rg: finalRg, name: formData.name, categoryId: formData.categoryId,
          position: formData.position as Position, photoUrl: previewUrl, birthDate: formData.birthDate || new Date().toISOString().split('T')[0],
          responsibleName: formData.responsibleName || '', responsiblePhone: formData.responsiblePhone || ''
        };
        await saveAthlete(newAthlete);
        setShowModal(false);
        setFormData({ name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: '' });
        setPreviewUrl('');
        setFeedback({ type: 'success', message: 'Atleta cadastrado!' });
        setRefreshKey(prev => prev + 1);
    } catch (err: any) {
        setFeedback({ type: 'error', message: err.message });
    } finally {
        setLoading(false);
    }
  };

  if (loading && !showSetupModal) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  const inputClass = "w-full bg-gray-100 border border-gray-300 rounded p-2 text-black focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-6 relative">
      {/* Cabeçalho da Lista */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Users className="text-blue-600" /> Atletas</h2>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <input type="text" placeholder="Buscar atleta..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full bg-gray-100 text-black" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {currentUser && canEditData(currentUser.role) && (
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => handleActionClick('import')} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-lg font-bold flex items-center justify-center transition-colors border border-blue-200" title="Importar por RG"><Download size={18} /></button>
                <button onClick={() => handleActionClick('create')} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 whitespace-nowrap flex-1 md:flex-none"><Plus size={18} /> Novo Atleta</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {sorted.map(athlete => (
           <Link to={`/athletes/${athlete.id}`} key={athlete.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center hover:shadow-md transition-shadow group relative">
               <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full border ${athlete.averageScore >= 8 ? 'bg-green-100 text-green-800 border-green-200' : athlete.averageScore >= 4 ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                   {athlete.averageScore > 0 ? athlete.averageScore.toFixed(1) : '-'}
               </div>
               {athlete.photoUrl ? <img src={athlete.photoUrl} className="w-24 h-24 rounded-full object-cover mb-3" /> : <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-gray-400 mb-3">{athlete.name.charAt(0)}</div>}
               <h3 className="font-bold text-gray-800 text-center">{athlete.name}</h3>
               <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 font-semibold">{athlete.position}</span>
               <div className="flex flex-col items-center gap-1 mt-2">
                   <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-100">{getCalculatedCategory(athlete.birthDate)}</span>
                   {athlete.rg && <span className="text-[10px] text-gray-400 font-mono">RG: {athlete.rg}</span>}
               </div>
           </Link>
         ))}
      </div>

      {/* MODAL DE CONFIGURAÇÃO RÁPIDA (QUANDO NÃO HÁ DADOS) */}
      {showSetupModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl relative text-center">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6"><Rocket className="text-blue-600" size={40} /></div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Primeira Configuração</h2>
                  <p className="text-sm text-gray-500 mb-6">Para cadastrar atletas, precisamos definir seu time e pelo menos uma categoria.</p>
                  <form onSubmit={handleQuickSetupSubmit} className="text-left space-y-4">
                      {setupStep === 'team_and_category' && (
                          <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nome do seu Time</label>
                              <input autoFocus type="text" className={inputClass} placeholder="Ex: Escola de Futebol PerformaXX" value={setupData.teamName} onChange={(e) => setSetupData({...setupData, teamName: e.target.value})} required />
                          </div>
                      )}
                      <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nome da Categoria</label>
                          <input type="text" className={inputClass} placeholder="Ex: Sub-15" value={setupData.categoryName} onChange={(e) => setSetupData({...setupData, categoryName: e.target.value})} required />
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg disabled:opacity-50">
                          {loading ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />}
                          {loading ? 'Salvando...' : 'Confirmar e Criar'}
                      </button>
                  </form>
                  <button onClick={() => setShowSetupModal(false)} className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline">Cancelar</button>
              </div>
          </div>
      )}

      {/* MODAL DE NOVO ATLETA (PADRÃO) */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h3 className="text-xl font-bold flex items-center gap-2"><Plus className="text-green-500"/> Cadastrar Atleta</h3>
                <button onClick={() => setShowModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="flex flex-col items-center mb-4">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden border-2 border-dashed border-gray-300">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Users size={32} className="text-gray-400" />)}
                    </div>
                    <label className={`cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800 ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Enviando...' : <><Upload size={14} /> Carregar Foto</>}
                       <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleImageChange} />
                    </label>
                 </div>
                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
                   <input required type="text" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Data Nasc.</label>
                      <input type="date" className={inputClass} value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Categoria</label>
                      <select required className={inputClass} value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                         <option value="">Selecione...</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                 </div>
                 <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {loading ? 'Processando...' : 'Cadastrar Atleta'}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* FEEDBACK POPUP */}
      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${feedback.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="text-green-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{feedback.type === 'success' ? 'Sucesso!' : 'Erro'}</h3>
                 <p className="text-gray-500 text-center mb-6">{feedback.message}</p>
                 <button onClick={() => setFeedback(null)} className={`text-white font-bold py-2 px-6 rounded-lg transition-colors w-full ${feedback.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>OK</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AthletesList;
