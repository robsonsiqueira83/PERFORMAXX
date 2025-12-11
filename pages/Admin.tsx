import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory,
  getAthletes, getUsers, saveAthlete, saveUser, getTrainingSessions, saveTrainingSession
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Team, Category, UserRole, Athlete, User, TrainingSession, canEditData, canDeleteData } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Settings, Loader2, ExternalLink, Link as LinkIcon, Copy, AlertTriangle, X, ArrowRightLeft, CheckCircle, Info, Save, Upload, AlertCircle, Hash } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

// Modal types
type ModalType = 'none' | 'delete_confirm_simple' | 'delete_migrate_warn' | 'edit_team' | 'edit_category' | 'delete_category_confirm' | 'alert_error' | 'alert_success';

const Admin: React.FC<AdminProps> = ({ userRole, currentTeamId }) => {
  // Initialize tab from localStorage to persist state after reload
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>(() => {
    const savedTab = localStorage.getItem('admin_active_tab');
    return (savedTab === 'teams' || savedTab === 'categories') ? savedTab : 'teams';
  });

  const handleTabChange = (tab: 'teams' | 'categories') => {
    setActiveTab(tab);
    localStorage.setItem('admin_active_tab', tab);
  };

  const [loading, setLoading] = useState(false);
  const [viewingContextId, setViewingContextId] = useState<string>('');
  
  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Modal State
  const [modalType, setModalType] = useState<ModalType>('none');
  const [targetId, setTargetId] = useState<string | null>(null); // ID of item being acted upon
  const [targetName, setTargetName] = useState<string>(''); // Name for display
  const [modalMessage, setModalMessage] = useState<string>(''); // For generic alerts
  
  // Migration State
  const [dependencyCounts, setDependencyCounts] = useState({ athletes: 0, users: 0, categories: 0, sessions: 0 });
  const [migrationDestTeamId, setMigrationDestTeamId] = useState<string>('');
  const [newTeamName, setNewTeamName] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  // Edit Form State (for Team/Category)
  const [formData, setFormData] = useState<{ name: string, logoUrl?: string }>({ name: '', logoUrl: '' });

  // Use helper functions from types.ts where applicable or define local scope
  const canEdit = canEditData(userRole);
  const canDelete = canDeleteData(userRole);

  useEffect(() => {
    // Get context ID from local storage to ensure new teams are assigned to the correct Master/Panel
    const ctxId = localStorage.getItem('performax_context_id');
    if (ctxId) setViewingContextId(ctxId);

    refreshData(ctxId);
  }, [currentTeamId]);

  const refreshData = async (ctxId?: string | null) => {
    setLoading(true);
    const allTeams = await getTeams();
    // Filter teams displayed in Admin to only those owned by the current Context
    // This prevents seeing teams from other contexts even if invited
    const contextId = ctxId || viewingContextId;
    if (contextId) {
        setTeams(allTeams.filter(t => t.ownerId === contextId));
    } else {
        setTeams(allTeams); // Fallback
    }
    
    const c = await getCategories();
    setCategories(c.filter(item => item.teamId === currentTeamId));
    setLoading(false);
  };

  const closeModal = () => {
    setModalType('none');
    setTargetId(null);
    setTargetName('');
    setFormData({ name: '', logoUrl: '' });
    setMigrationDestTeamId('');
    setNewTeamName('');
    setIsMigrating(false);
    setModalMessage('');
  };

  const showAlert = (type: 'alert_success' | 'alert_error', message: string) => {
      setModalType(type);
      setModalMessage(message);
  };

  // --- TEAM MANAGEMENT LOGIC ---

  const openNewTeamModal = () => {
    setModalType('edit_team');
    setFormData({ name: '', logoUrl: '' });
    setTargetId(null); // null means new
  };

  const openEditTeamModal = (team: Team) => {
    setModalType('edit_team');
    setFormData({ name: team.name, logoUrl: team.logoUrl || '' });
    setTargetId(team.id);
  };

  const handleTeamLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const url = await processImageUpload(e.target.files[0]);
        setFormData({ ...formData, logoUrl: url });
      } catch (error) {
        showAlert('alert_error', 'Erro ao processar imagem');
      }
    }
  };

  const handleSaveTeam = async () => {
    if (!formData.name) return;
    
    // Save with current Viewing Context ID as owner
    await saveTeam({ 
        id: targetId || uuidv4(), 
        name: formData.name, 
        logoUrl: formData.logoUrl,
        ownerId: viewingContextId 
    });
    closeModal();
    // Force reload to update Layout context (header selector) and lists
    window.location.reload();
  };

  const handleDeleteTeamClick = async (team: Team) => {
    setTargetId(team.id);
    setTargetName(team.name);
    setLoading(true);

    // Check dependencies
    const [allAthletes, allUsers, allCategories, allSessions] = await Promise.all([
        getAthletes(), getUsers(), getCategories(), getTrainingSessions()
    ]);

    const counts = {
        athletes: allAthletes.filter(a => a.teamId === team.id).length,
        users: allUsers.filter(u => u.teamIds?.includes(team.id)).length,
        categories: allCategories.filter(c => c.teamId === team.id).length,
        sessions: allSessions.filter(s => s.teamId === team.id).length
    };

    setDependencyCounts(counts);
    setLoading(false);

    const hasData = counts.athletes > 0 || counts.users > 0 || counts.categories > 0 || counts.sessions > 0;

    if (hasData) {
        setModalType('delete_migrate_warn');
        // Pre-select first available other team if exists
        const otherTeams = teams.filter(t => t.id !== team.id);
        if (otherTeams.length > 0) setMigrationDestTeamId(otherTeams[0].id);
    } else {
        setModalType('delete_confirm_simple');
    }
  };

  const handleMigrationAndDeletion = async () => {
    if (!targetId) return;
    setIsMigrating(true);

    try {
        let destinationId = migrationDestTeamId;

        // 1. If creating a new team during migration
        if (!destinationId && newTeamName) {
            destinationId = uuidv4();
            await saveTeam({ id: destinationId, name: newTeamName, ownerId: viewingContextId });
        }

        if (!destinationId) {
            showAlert('alert_error', "Selecione um time de destino ou crie um novo.");
            setIsMigrating(false);
            return;
        }

        // 2. Perform Migration
        const [allAthletes, allUsers, allCategories, allSessions] = await Promise.all([
            getAthletes(), getUsers(), getCategories(), getTrainingSessions()
        ]);

        // Migrate Categories (Must happen before athletes technically, but ID remains same so order allows parallel)
        const teamCategories = allCategories.filter(c => c.teamId === targetId);
        for (const cat of teamCategories) {
            await saveCategory({ ...cat, teamId: destinationId });
        }

        // Migrate Athletes
        const teamAthletes = allAthletes.filter(a => a.teamId === targetId);
        for (const ath of teamAthletes) {
            await saveAthlete({ ...ath, teamId: destinationId });
        }

        // Migrate Sessions
        const teamSessions = allSessions.filter(s => s.teamId === targetId);
        for (const ses of teamSessions) {
            await saveTrainingSession({ ...ses, teamId: destinationId });
        }

        // Update Users (Access List)
        const teamUsers = allUsers.filter(u => u.teamIds?.includes(targetId));
        for (const usr of teamUsers) {
            const newTeamIds = (usr.teamIds || []).filter(id => id !== targetId);
            if (!newTeamIds.includes(destinationId)) {
                newTeamIds.push(destinationId);
            }
            await saveUser({ ...usr, teamIds: newTeamIds });
        }

        // 3. Delete Old Team
        await deleteTeam(targetId);

        closeModal();
        window.location.reload();

    } catch (error) {
        console.error("Migration failed", error);
        showAlert('alert_error', "Erro ao migrar dados. Tente novamente.");
    } finally {
        setIsMigrating(false);
    }
  };

  const handleSimpleDeletion = async () => {
      if (targetId) {
          await deleteTeam(targetId);
          closeModal();
          window.location.reload();
      }
  };


  // --- CATEGORY MANAGEMENT LOGIC ---

  const openNewCategoryModal = () => {
      setModalType('edit_category');
      setFormData({ name: '', logoUrl: '' });
      setTargetId(null);
  };

  const openEditCategoryModal = (cat: Category) => {
      setModalType('edit_category');
      setFormData({ name: cat.name });
      setTargetId(cat.id);
  };

  const handleSaveCategory = async () => {
    if (!formData.name) return;
    await saveCategory({ 
        id: targetId || uuidv4(), 
        name: formData.name, 
        teamId: currentTeamId 
    });
    closeModal();
    // Force reload to ensure category is available in dropdowns throughout the app
    window.location.reload();
  };

  const handleDeleteCategoryClick = (id: string, name: string) => {
      setTargetId(id);
      setTargetName(name);
      setModalType('delete_category_confirm');
  };
  
  const confirmDeleteCategory = async () => {
      if (targetId) {
          await deleteCategory(targetId);
          window.location.reload();
      }
  };


  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && teams.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
      <div className="p-6 border-b border-gray-100 flex items-center gap-2">
         <Settings className="text-blue-600" />
         <h2 className="text-2xl font-bold text-gray-800">Administração</h2>
      </div>
      
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
         <button onClick={() => handleTabChange('teams')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'teams' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>Times</button>
         <button onClick={() => handleTabChange('categories')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'categories' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>Categorias</button>
      </div>

      <div className="p-6">
        
        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <div>
            <div className="mb-6 flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">Gerenciar Times (Painel Atual)</h3>
               {canEdit && (
                   <button onClick={openNewTeamModal} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                       <Plus size={16}/> Novo Time
                   </button>
               )}
            </div>
            
            <div className="space-y-3">
               {teams.map(team => {
                 const publicLink = `https://performaxx.vercel.app/#/p/team/${team.id}`;
                 
                 return (
                    <div key={team.id} className="flex flex-col md:flex-row justify-between items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors gap-4 bg-white shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-1 w-full">
                            <div className="flex items-center gap-3">
                                {team.logoUrl ? (
                                    <img src={team.logoUrl} className="w-10 h-10 object-contain rounded bg-gray-100 p-1" />
                                ) : (
                                    <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center text-blue-600 font-bold">{team.name.charAt(0)}</div>
                                )}
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-800 whitespace-nowrap text-lg">{team.name}</span>
                                    
                                    {/* TEAM ID DISPLAY */}
                                    <div className="flex items-center gap-2 mt-1">
                                         <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-xs text-gray-500 font-mono" title="ID do Time">
                                             <Hash size={10} /> {team.id}
                                         </div>
                                         <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(team.id);
                                                showAlert('alert_success', 'ID do time copiado!');
                                            }}
                                            className="text-gray-400 hover:text-blue-600 p-0.5"
                                            title="Copiar ID"
                                         >
                                             <Copy size={12} />
                                         </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Public Link Box */}
                            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-full sm:max-w-md">
                                <LinkIcon size={14} className="text-gray-400 flex-shrink-0" />
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={publicLink} 
                                    className="text-xs text-gray-500 bg-transparent border-none focus:outline-none flex-1 min-w-0 font-mono"
                                    onClick={(e) => e.currentTarget.select()}
                                />
                                <div className="flex items-center border-l border-gray-200 pl-1 ml-1 gap-1 flex-shrink-0">
                                    <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(publicLink);
                                          showAlert('alert_success', 'Link copiado!');
                                        }}
                                        className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                                        title="Copiar Link"
                                    >
                                        <Copy size={14} />
                                    </button>
                                    <a 
                                        href={publicLink} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                                        title="Abrir em nova aba"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto justify-end">
                            {canEdit && (
                                <button onClick={() => openEditTeamModal(team)} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg transition-colors">
                                    <Edit size={18}/>
                                </button>
                            )}
                            {canDelete && (
                                <button onClick={() => handleDeleteTeamClick(team)} className="text-red-600 bg-red-50 p-2 hover:bg-red-100 rounded-lg transition-colors">
                                    <Trash2 size={18}/>
                                </button>
                            )}
                        </div>
                    </div>
                 );
               })}
               {teams.length === 0 && <div className="text-gray-400 text-center py-4 italic">Nenhum time criado neste painel.</div>}
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
           <div>
             <div className="mb-6 flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">Categorias ({teams.find(t => t.id === currentTeamId)?.name})</h3>
               {canEdit && (
                   <button onClick={openNewCategoryModal} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                       <Plus size={16}/> Nova Categoria
                   </button>
               )}
            </div>

            <div className="space-y-2">
               {categories.map(cat => (
                 <div key={cat.id} className="flex justify-between items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors bg-white shadow-sm">
                    <span className="font-medium text-gray-800">{cat.name}</span>
                    <div className="flex gap-2">
                       {canEdit && <button onClick={() => openEditCategoryModal(cat)} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg"><Edit size={16}/></button>}
                       {canDelete && <button onClick={() => handleDeleteCategoryClick(cat.id, cat.name)} className="text-red-600 bg-red-50 p-2 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>}
                    </div>
                 </div>
               ))}
               {categories.length === 0 && <div className="text-gray-400 text-center py-4 italic">Nenhuma categoria encontrada para o time selecionado.</div>}
            </div>
           </div>
        )}
      </div>

      {/* --- MODALS --- */}
      {/* ... (Existing modals logic same as before, no changes needed inside modals, just the triggers above are gated by canEdit/canDelete) ... */}

      {/* 1. EDIT TEAM MODAL */}
      {modalType === 'edit_team' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-gray-800">{targetId ? 'Editar Time' : 'Novo Time'}</h3>
                 <button onClick={closeModal}><X className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              
              <div className="flex flex-col items-center mb-6">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                    {formData.logoUrl ? (
                        <img src={formData.logoUrl} className="w-full h-full object-contain p-1" alt="Logo" />
                    ) : (
                        <div className="text-gray-400 font-bold text-2xl">{formData.name ? formData.name.charAt(0).toUpperCase() : '?'}</div>
                    )}
                </div>
                <label className="cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800 transition-colors">
                    <Upload size={14} /> Carregar Escudo
                    <input type="file" className="hidden" accept="image/*" onChange={handleTeamLogoUpload} />
                </label>
                <span className="text-xs text-gray-400 mt-1">Max: 150x150px, 200kb</span>
              </div>

              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Time</label>
                      <input 
                        autoFocus
                        type="text" 
                        className={inputClass} 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        placeholder="Ex: PerformaXX FC"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">URL do Logo (Opcional/Manual)</label>
                      <input 
                        type="text" 
                        className={inputClass} 
                        value={formData.logoUrl} 
                        onChange={e => setFormData({...formData, logoUrl: e.target.value})} 
                        placeholder="https://..."
                      />
                  </div>
                  <button onClick={handleSaveTeam} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 mt-2">
                      <Save size={18} /> Salvar
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* 2. EDIT CATEGORY MODAL */}
      {modalType === 'edit_category' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-gray-800">{targetId ? 'Editar Categoria' : 'Nova Categoria'}</h3>
                 <button onClick={closeModal}><X className="text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Categoria</label>
                      <input 
                        autoFocus
                        type="text" 
                        className={inputClass} 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        placeholder="Ex: Sub-15"
                      />
                  </div>
                  <button onClick={handleSaveCategory} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 mt-2">
                      <Save size={18} /> Salvar
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* 3. CONFIRM DELETE TEAM SIMPLE */}
      {modalType === 'delete_confirm_simple' && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Time?</h3>
                 <p className="text-gray-500 mb-6">Tem certeza que deseja excluir <strong>{targetName}</strong>? Esta ação não pode ser desfeita.</p>
                 <div className="flex gap-3">
                     <button onClick={closeModal} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={handleSimpleDeletion} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700">Excluir</button>
                 </div>
             </div>
         </div>
      )}

      {/* 4. MIGRATION WARNING MODAL */}
      {modalType === 'delete_migrate_warn' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl relative">
                 <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>
                 
                 <div className="flex items-start gap-4 mb-6">
                     <div className="bg-orange-100 p-3 rounded-full shrink-0">
                         <AlertTriangle className="text-orange-600" size={24} />
                     </div>
                     <div>
                         <h3 className="text-xl font-bold text-gray-800">Atenção: Dados Vinculados</h3>
                         <p className="text-sm text-gray-600 mt-1">
                             O time <strong>{targetName}</strong> possui dados que não podem ser perdidos. Para excluí-lo, você deve transferir estes dados para outro time.
                         </p>
                     </div>
                 </div>

                 <div className="bg-gray-50 p-4 rounded-xl mb-6 grid grid-cols-2 gap-4 border border-gray-100">
                     <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
                         <span className="text-2xl font-bold text-blue-600">{dependencyCounts.athletes}</span>
                         <span className="text-xs text-gray-500 font-bold uppercase">Atletas</span>
                     </div>
                     <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
                         <span className="text-2xl font-bold text-blue-600">{dependencyCounts.users}</span>
                         <span className="text-xs text-gray-500 font-bold uppercase">Usuários</span>
                     </div>
                     <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
                         <span className="text-2xl font-bold text-blue-600">{dependencyCounts.categories}</span>
                         <span className="text-xs text-gray-500 font-bold uppercase">Categorias</span>
                     </div>
                     <div className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm">
                         <span className="text-2xl font-bold text-blue-600">{dependencyCounts.sessions}</span>
                         <span className="text-xs text-gray-500 font-bold uppercase">Treinos</span>
                     </div>
                 </div>

                 <div className="mb-6">
                     <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                         <ArrowRightLeft size={16} /> Migrar dados para:
                     </label>
                     
                     {teams.length > 1 ? (
                        <select 
                            className={inputClass}
                            value={migrationDestTeamId}
                            onChange={(e) => {
                                setMigrationDestTeamId(e.target.value);
                                setNewTeamName('');
                            }}
                        >
                            {teams.filter(t => t.id !== targetId).map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                            <option value="">+ Criar Novo Time</option>
                        </select>
                     ) : (
                        <div className="text-sm text-gray-500 italic mb-2">Não existem outros times cadastrados.</div>
                     )}

                     {/* Create New Team Inline */}
                     {(!migrationDestTeamId || teams.length <= 1) && (
                         <div className="mt-3 animate-fade-in bg-blue-50 p-3 rounded-lg border border-blue-100">
                             <label className="block text-xs font-bold text-blue-700 mb-1">Nome do Novo Time de Destino</label>
                             <input 
                                type="text"
                                className="w-full border border-blue-200 rounded p-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                                placeholder="Digite o nome para criar..."
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                             />
                         </div>
                     )}
                 </div>

                 <div className="flex gap-3 pt-4 border-t border-gray-100">
                     <button onClick={closeModal} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition-colors">
                         Cancelar
                     </button>
                     <button 
                        onClick={handleMigrationAndDeletion}
                        disabled={isMigrating || (!migrationDestTeamId && !newTeamName)}
                        className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200"
                     >
                         {isMigrating ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                         {isMigrating ? 'Processando...' : 'Migrar Dados & Excluir Time'}
                     </button>
                 </div>
             </div>
          </div>
      )}

      {/* 5. DELETE CATEGORY CONFIRM */}
      {modalType === 'delete_category_confirm' && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Trash2 className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Categoria?</h3>
                 <p className="text-gray-500 mb-6">Tem certeza que deseja excluir <strong>{targetName}</strong>?</p>
                 <div className="flex gap-3">
                     <button onClick={closeModal} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={confirmDeleteCategory} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700">Excluir</button>
                 </div>
             </div>
         </div>
      )}

      {/* 6. GENERIC ALERTS (Success/Error) */}
      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full relative">
                 <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20}/></button>
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'alert_success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {modalType === 'alert_success' ? <CheckCircle className="text-green-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{modalType === 'alert_success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-gray-500 text-center mb-6">{modalMessage}</p>
                 <button onClick={closeModal} className={`text-white font-bold py-2 px-6 rounded-lg transition-colors w-full ${modalType === 'alert_success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                     OK
                 </button>
             </div>
         </div>
      )}

    </div>
  );
};

export default Admin;