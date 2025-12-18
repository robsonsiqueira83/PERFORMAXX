
import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory,
  getAthletes, getUsers, saveAthlete, saveUser, getTrainingSessions, saveTrainingSession
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Team, Category, UserRole, Athlete, User, TrainingSession, canEditData, canDeleteData, normalizeCategoryName } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Settings, Loader2, ExternalLink, Link as LinkIcon, Copy, AlertTriangle, X, ArrowRightLeft, CheckCircle, Info, Save, Upload, AlertCircle, Hash, LogOut, Mail, UserCheck, RefreshCw } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

type ModalType = 'none' | 'delete_confirm_simple' | 'delete_migrate_warn' | 'edit_team' | 'edit_category' | 'delete_category_confirm' | 'alert_error' | 'alert_success' | 'leave_team_confirm';

const Admin: React.FC<AdminProps> = ({ userRole, currentTeamId }) => {
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>(() => {
    const savedTab = localStorage.getItem('admin_active_tab');
    return (savedTab === 'teams' || savedTab === 'categories') ? savedTab : 'teams';
  });

  const handleTabChange = (tab: 'teams' | 'categories') => {
    setActiveTab(tab);
    localStorage.setItem('admin_active_tab', tab);
  };

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingContextId, setViewingContextId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [ownedTeams, setOwnedTeams] = useState<Team[]>([]);
  const [activeGuestTeams, setActiveGuestTeams] = useState<Team[]>([]);
  const [pendingGuestTeams, setPendingGuestTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [modalType, setModalType] = useState<ModalType>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>(''); 
  
  const [dependencyCounts, setDependencyCounts] = useState({ athletes: 0, users: 0, categories: 0, sessions: 0 });
  const [migrationDestTeamId, setMigrationDestTeamId] = useState<string>('');
  const [newTeamName, setNewTeamName] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  const [formData, setFormData] = useState<{ name: string, logoUrl?: string }>({ name: '', logoUrl: '' });

  const canEdit = canEditData(userRole);
  const canDelete = canDeleteData(userRole);

  useEffect(() => {
    const ctxId = localStorage.getItem('performax_context_id');
    const userStr = localStorage.getItem('performax_current_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
    if (ctxId) setViewingContextId(ctxId);
    refreshData(ctxId);
  }, [currentTeamId]);

  const refreshData = async (ctxId?: string | null) => {
    setLoading(true);
    try {
        const allTeams = await getTeams();
        const userStr = localStorage.getItem('performax_current_user');
        const u: User | null = userStr ? JSON.parse(userStr) : null;
        const contextId = ctxId || viewingContextId;
        const isOwnerOrGlobal = u && (u.id === contextId || u.role === UserRole.GLOBAL);

        if (contextId && isOwnerOrGlobal) setOwnedTeams(allTeams.filter(t => t.ownerId === contextId));
        else setOwnedTeams([]);

        if (u) {
            const teamIds = u.teamIds || [];
            const pendingIds = teamIds.filter(id => id.startsWith('pending:')).map(id => id.replace('pending:', ''));
            setPendingGuestTeams(allTeams.filter(t => pendingIds.includes(t.id)));
            const activeIds = teamIds.filter(id => !id.startsWith('pending:'));
            let myActiveTeams = allTeams.filter(t => activeIds.includes(t.id) && t.ownerId !== u.id);
            if (contextId && !isOwnerOrGlobal) myActiveTeams = myActiveTeams.filter(t => t.ownerId === contextId);
            setActiveGuestTeams(myActiveTeams);
        }
        
        const c = await getCategories();
        setCategories(c.filter(item => item.teamId === currentTeamId));
    } catch (err) { console.error(err); }
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

  const handleSaveTeam = async () => {
    if (!formData.name) return;
    setLoading(true);
    try {
        await saveTeam({ 
            id: targetId || uuidv4(), 
            name: formData.name, 
            logoUrl: formData.logoUrl,
            ownerId: viewingContextId 
        });
        closeModal();
        await refreshData(viewingContextId);
        showAlert('alert_success', 'Time salvo com sucesso!');
    } catch (err: any) {
        showAlert('alert_error', `Erro ao salvar: ${err.message || 'Falha de rede'}`);
    } finally { setLoading(false); }
  };

  const handleSaveCategory = async () => {
    if (!formData.name) return;
    setLoading(true);
    try {
        const standardizedName = normalizeCategoryName(formData.name);
        const exists = categories.find(c => c.name === standardizedName && c.id !== targetId);
        if (exists) {
            showAlert('alert_error', `A categoria "${standardizedName}" já existe neste time.`);
            return;
        }
        await saveCategory({ id: targetId || uuidv4(), name: standardizedName, teamId: currentTeamId });
        closeModal();
        await refreshData(viewingContextId);
        showAlert('alert_success', 'Categoria salva!');
    } catch (err: any) {
        showAlert('alert_error', `Erro ao salvar: ${err.message}`);
    } finally { setLoading(false); }
  };

  if (loading && ownedTeams.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

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
        {activeTab === 'teams' && (
          <div className="space-y-8">
            <div>
                <div className="mb-4 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">Gerenciar Meus Times</h3>
                    {canEdit && (
                        <button onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_team'); }} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors shadow-sm">
                            <Plus size={16}/> Novo Time
                        </button>
                    )}
                </div>
                <div className="space-y-4">
                    {ownedTeams.map(team => (
                        <div key={team.id} className="p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm hover:bg-gray-50 transition-all">
                            <div className="flex items-center gap-3">
                                {team.logoUrl ? <img src={team.logoUrl} className="w-10 h-10 object-contain" /> : <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center text-blue-600 font-bold">{team.name.charAt(0)}</div>}
                                <span className="font-bold text-gray-800">{team.name}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setTargetId(team.id); setFormData({name: team.name, logoUrl: team.logoUrl}); setModalType('edit_team'); }} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Edit size={16}/></button>
                                <button onClick={() => { setTargetId(team.id); setTargetName(team.name); setModalType('delete_confirm_simple'); }} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
           <div>
             <div className="mb-6 flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">Categorias</h3>
               {canEdit && (
                   <button onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_category'); }} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                       <Plus size={16}/> Nova Categoria
                   </button>
               )}
            </div>
            <div className="space-y-2">
               {categories.map(cat => (
                 <div key={cat.id} className="flex justify-between items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors bg-white shadow-sm">
                    <span className="font-medium text-gray-800">{cat.name}</span>
                    <div className="flex gap-2">
                       <button onClick={() => { setTargetId(cat.id); setFormData({name: cat.name}); setModalType('edit_category'); }} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg"><Edit size={16}/></button>
                       <button onClick={() => { setTargetId(cat.id); setTargetName(cat.name); setModalType('delete_category_confirm'); }} className="text-red-600 bg-red-50 p-2 hover:bg-red-100 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                 </div>
               ))}
            </div>
           </div>
        )}
      </div>

      {/* MODAL EDIÇÃO TIME */}
      {modalType === 'edit_team' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <h3 className="text-xl font-bold mb-6">{targetId ? 'Editar Time' : 'Novo Time'}</h3>
              <input type="text" className="w-full bg-gray-50 border rounded p-3 mb-4 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Nome do Time" />
              <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 bg-gray-100 font-bold py-3 rounded-lg">Cancelar</button>
                  <button onClick={handleSaveTeam} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg">Salvar</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL EDIÇÃO CATEGORIA */}
      {modalType === 'edit_category' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <h3 className="text-xl font-bold mb-6">{targetId ? 'Editar Categoria' : 'Nova Categoria'}</h3>
              <input type="text" className="w-full bg-gray-50 border rounded p-3 mb-4 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Sub-15" />
              <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 bg-gray-100 font-bold py-3 rounded-lg">Cancelar</button>
                  <button onClick={handleSaveCategory} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg">Salvar</button>
              </div>
           </div>
        </div>
      )}

      {/* ALERTA FEEDBACK */}
      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'alert_success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {modalType === 'alert_success' ? <CheckCircle className="text-green-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{modalType === 'alert_success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-gray-500 text-center mb-6">{modalMessage}</p>
                 <button onClick={closeModal} className={`text-white font-bold py-2 px-6 rounded-lg w-full ${modalType === 'alert_success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>OK</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default Admin;
