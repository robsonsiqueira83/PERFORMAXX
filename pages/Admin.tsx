
import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory
} from '../services/storageService';
import { Team, Category, UserRole, canEditData, normalizeCategoryName } from '../types';
import { v4 as uuidv4 } from 'uuid';
// Added Target to the lucide-react imports
import { Trash2, Edit, Plus, Settings, Loader2, Link as LinkIcon, Copy, X, CheckCircle, Info, AlertCircle, Shirt, ExternalLink, Globe, Target } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

type ModalType = 'none' | 'delete_confirm_simple' | 'edit_team' | 'edit_category' | 'delete_category_confirm' | 'alert_error' | 'alert_success';

const Admin: React.FC<AdminProps> = ({ userRole, currentTeamId }) => {
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>(() => {
    const savedTab = localStorage.getItem('admin_active_tab');
    return (savedTab === 'teams' || savedTab === 'categories') ? savedTab : 'teams';
  });

  const [loading, setLoading] = useState(false);
  const [ownedTeams, setOwnedTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalType, setModalType] = useState<ModalType>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>(''); 
  const [formData, setFormData] = useState<{ name: string, logoUrl?: string }>({ name: '', logoUrl: '' });

  const currentTeam = ownedTeams.find(t => t.id === currentTeamId);
  const publicLink = currentTeamId ? `${window.location.origin}/#/p/team/${currentTeamId}` : null;

  const refreshData = async () => {
    setLoading(true);
    try {
        const allTeams = await getTeams();
        const userStr = localStorage.getItem('performax_current_user');
        const ctxId = localStorage.getItem('performax_context_id');
        const u = userStr ? JSON.parse(userStr) : null;
        
        if (ctxId) setOwnedTeams(allTeams.filter(t => t.ownerId === ctxId));
        
        const c = await getCategories();
        setCategories(c.filter(item => item.teamId === currentTeamId));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [currentTeamId]);

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setModalType('alert_success');
      setModalMessage('Link público copiado com sucesso!');
  };

  const handleSaveTeam = async () => {
    if (!formData.name) return;
    const ctxId = localStorage.getItem('performax_context_id');
    setLoading(true);
    try {
        await saveTeam({ id: targetId || uuidv4(), name: formData.name, ownerId: ctxId || '' });
        setModalType('alert_success');
        setModalMessage('Time salvo!');
        refreshData();
    } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
    finally { setLoading(false); }
  };

  const handleSaveCategory = async () => {
    if (!formData.name || !currentTeamId) return;
    setLoading(true);
    try {
        const name = normalizeCategoryName(formData.name);
        await saveCategory({ id: targetId || uuidv4(), name, teamId: currentTeamId });
        setModalType('alert_success');
        setModalMessage('Categoria salva!');
        refreshData();
    } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
         <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><Settings size={20}/></div>
         <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Administração de Equipe</h2>
      </div>
      
      {/* SEÇÃO LINK PÚBLICO */}
      {currentTeam && (
          <div className="p-6 bg-indigo-50/30 border-b border-indigo-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-3">
                      <div className="bg-indigo-100 p-2.5 rounded-2xl text-indigo-600"><Globe size={20}/></div>
                      <div>
                          <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Painel Público de Desempenho</h4>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Compartilhe o progresso com pais e atletas</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                      <div className="flex-1 bg-white border border-indigo-200 px-4 py-2.5 rounded-xl font-mono text-[10px] text-indigo-800 truncate shadow-inner">
                          {publicLink}
                      </div>
                      <button onClick={() => publicLink && copyToClipboard(publicLink)} className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95"><Copy size={18}/></button>
                      <a href={publicLink || '#'} target="_blank" className="bg-white border border-indigo-200 text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-50 transition-all"><ExternalLink size={18}/></a>
                  </div>
              </div>
          </div>
      )}

      <div className="flex border-b border-gray-100 bg-white">
         <button onClick={() => setActiveTab('teams')} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'teams' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Times</button>
         <button onClick={() => setActiveTab('categories')} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'categories' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Categorias</button>
      </div>

      <div className="p-8">
        {activeTab === 'teams' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Shirt size={16} className="text-indigo-500"/> Meus Times</h3>
                    <button onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_team'); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg"><Plus size={16}/> Novo Time</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ownedTeams.map(team => (
                        <div key={team.id} className="p-5 border border-gray-100 rounded-2xl flex justify-between items-center bg-white shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center gap-4">
                                {team.logoUrl ? <img src={team.logoUrl} className="w-10 h-10 object-contain" /> : <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-black">{team.name.charAt(0)}</div>}
                                <div>
                                    <span className="font-black text-gray-800 text-sm uppercase tracking-tighter">{team.name}</span>
                                    <span className="block text-[8px] text-gray-400 font-mono">ID: {team.id.substring(0,8)}...</span>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => { setTargetId(team.id); setFormData({name: team.name}); setModalType('edit_team'); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit size={16}/></button>
                                <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'categories' && (
            <div className="space-y-6">
                 <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Target size={16} className="text-emerald-500"/> Categorias do Time</h3>
                    <button disabled={!currentTeamId} onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_category'); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-50"><Plus size={16}/> Nova Categoria</button>
                </div>
                {!currentTeamId && <div className="bg-indigo-50 p-4 rounded-xl text-indigo-600 text-[10px] font-black uppercase text-center border border-indigo-100 tracking-widest">Selecione um time no topo para gerenciar categorias</div>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {categories.map(cat => (
                        <div key={cat.id} className="p-4 border border-gray-100 rounded-2xl flex justify-between items-center bg-white shadow-sm">
                            <span className="font-black text-gray-700 text-xs uppercase tracking-widest">{cat.name}</span>
                            <div className="flex gap-1">
                                <button onClick={() => { setTargetId(cat.id); setFormData({name: cat.name}); setModalType('edit_category'); }} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Edit size={14}/></button>
                                <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>

      {/* MODAL EDIÇÃO */}
      {(modalType === 'edit_team' || modalType === 'edit_category') && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
              <h3 className="text-xl font-black text-gray-800 mb-6 uppercase tracking-tighter">{targetId ? 'Editar' : 'Criar'} {modalType === 'edit_team' ? 'Time' : 'Categoria'}</h3>
              <input autoFocus type="text" className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 font-black text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 mb-6" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: PerformaXX FC" />
              <div className="flex gap-3">
                  <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                  <button onClick={modalType === 'edit_team' ? handleSaveTeam : handleSaveCategory} className="flex-2 bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Salvar Alterações</button>
              </div>
           </div>
        </div>
      )}

      {/* FEEDBACK */}
      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'alert_success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {modalType === 'alert_success' ? <CheckCircle className="text-emerald-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tighter">{modalType === 'alert_success' ? 'Sucesso!' : 'Erro'}</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className="text-white font-black py-3 px-8 rounded-2xl transition-all w-full mt-6 shadow-lg uppercase tracking-widest text-[10px] bg-indigo-600">OK</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default Admin;
