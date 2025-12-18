
import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory,
  getUsers, saveUser
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Team, Category, UserRole, User, normalizeCategoryName } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Settings, Loader2, Copy, X, CheckCircle, AlertCircle, Shirt, ExternalLink, Globe, Target, Upload, Users, Briefcase, UserCog, UserMinus, LogOut } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

type ModalType = 'none' | 'edit_team' | 'edit_category' | 'alert_error' | 'alert_success' | 'edit_staff_role' | 'confirm_delete';

const Admin: React.FC<AdminProps> = ({ userRole, currentTeamId }) => {
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>(() => {
    const savedTab = localStorage.getItem('admin_active_tab');
    return (savedTab === 'teams' || savedTab === 'categories') ? savedTab : 'teams';
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ownedTeams, setOwnedTeams] = useState<Team[]>([]);
  const [invitedTeams, setInvitedTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [modalType, setModalType] = useState<ModalType>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'team' | 'category' | 'staff' | 'leave'>('team');
  
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [selectedTeamForStaff, setSelectedTeamForStaff] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string>(''); 
  const [formData, setFormData] = useState<{ name: string, logoUrl?: string }>({ name: '', logoUrl: '' });

  const refreshData = async () => {
    setLoading(true);
    try {
        const allTeams = await getTeams();
        const userStr = localStorage.getItem('performax_current_user');
        const currentUser: User = userStr ? JSON.parse(userStr) : null;
        const ctxId = localStorage.getItem('performax_context_id');

        if (ctxId) {
            setOwnedTeams(allTeams.filter(t => t.ownerId === ctxId));
            if (currentUser) {
                const teamIds = currentUser.teamIds || [];
                setInvitedTeams(allTeams.filter(t => teamIds.includes(t.id) && t.ownerId !== currentUser.id));
            }
        }
        
        const c = await getCategories();
        setCategories(c.filter(item => item.teamId === currentTeamId));

        const u = await getUsers();
        setAllUsers(u);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [currentTeamId]);

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setModalType('alert_success');
      setModalMessage('Link público copiado com sucesso!');
      setTimeout(() => setModalType('none'), 1500);
  };

  const handleSaveTeam = async () => {
    if (!formData.name) return;
    const ctxId = localStorage.getItem('performax_context_id');
    setLoading(true);
    try {
        await saveTeam({ id: targetId || uuidv4(), name: formData.name, logoUrl: formData.logoUrl, ownerId: ctxId || '' });
        setModalType('alert_success');
        setModalMessage('Dados da equipe salvos!');
        refreshData();
    } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
    finally { setLoading(false); }
  };

  const handleSaveCategory = async () => {
    if (!formData.name || !currentTeamId) return;
    setLoading(true);
    try {
        await saveCategory({ id: targetId || uuidv4(), name: formData.name, teamId: currentTeamId });
        setModalType('alert_success');
        setModalMessage('Categoria salva com sucesso!');
        refreshData();
    } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message || 'Erro ao salvar categoria'); }
    finally { setLoading(false); }
  };

  const handleUpdateStaffRole = async (newRole: UserRole) => {
      if (!selectedStaff) return;
      setLoading(true);
      try {
          await saveUser({ ...selectedStaff, role: newRole });
          setModalType('alert_success');
          setModalMessage('Função do colaborador atualizada!');
          refreshData();
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
      finally { setLoading(false); }
  };

  const executeDeletion = async () => {
      setLoading(true);
      try {
          if (deleteType === 'team' && targetId) {
              await deleteTeam(targetId);
              setModalMessage('Equipe removida do sistema.');
          } else if (deleteType === 'category' && targetId) {
              await deleteCategory(targetId);
              setModalMessage('Categoria removida.');
          } else if (deleteType === 'staff' && selectedStaff && selectedTeamForStaff) {
              const updatedTeamIds = (selectedStaff.teamIds || []).filter(id => id !== selectedTeamForStaff);
              await saveUser({ ...selectedStaff, teamIds: updatedTeamIds });
              setModalMessage('Colaborador removido da equipe.');
          } else if (deleteType === 'leave' && selectedTeamForStaff) {
              const userStr = localStorage.getItem('performax_current_user');
              const currentUser: User = userStr ? JSON.parse(userStr) : null;
              if (currentUser) {
                  const updatedTeamIds = (currentUser.teamIds || []).filter(id => id !== selectedTeamForStaff);
                  await saveUser({ ...currentUser, teamIds: updatedTeamIds });
                  setModalMessage('Você saiu do clube selecionado.');
                  localStorage.setItem('performax_current_user', JSON.stringify({ ...currentUser, teamIds: updatedTeamIds }));
              }
          }
          setModalType('alert_success');
          refreshData();
      } catch (err: any) {
          setModalType('alert_error');
          setModalMessage(err.message || 'Erro na operação.');
      } finally {
          setLoading(false);
          setTargetId(null);
          setSelectedStaff(null);
      }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setUploading(true);
          try {
              const url = await processImageUpload(file);
              setFormData(prev => ({ ...prev, logoUrl: url }));
          } catch (err) { 
              setModalType('alert_error');
              setModalMessage("Erro ao carregar imagem.");
          } finally { setUploading(false); }
      }
  };

  const renderTeamCard = (team: Team, isOwner: boolean) => {
    const members = allUsers.filter(u => u.teamIds?.some(tid => tid === team.id || tid === `pending:${team.id}`));
    const pubLink = `${window.location.origin}/#/p/team/${team.id}`;
    
    return (
        <div key={team.id} className="p-6 border border-gray-100 rounded-3xl bg-white shadow-sm hover:shadow-md transition-all space-y-6 relative group/card">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-5">
                    {team.logoUrl ? <img src={team.logoUrl} className="w-16 h-16 object-contain rounded-2xl border border-gray-100" /> : <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xl">{team.name.charAt(0)}</div>}
                    <div>
                        <span className="font-black text-gray-800 text-lg uppercase tracking-tighter leading-none">{team.name}</span>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">ID: {team.id.substring(0,8)}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter flex items-center gap-1"><Users size={12}/> {members.length} Staff</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    {isOwner ? (
                        <>
                            <button onClick={() => { setTargetId(team.id); setFormData({name: team.name, logoUrl: team.logoUrl}); setModalType('edit_team'); }} className="flex-1 md:flex-none bg-gray-50 text-indigo-600 hover:bg-indigo-50 p-3 rounded-xl border border-gray-100 transition-all font-black text-[10px] uppercase flex items-center justify-center gap-2"><Edit size={16}/> Editar</button>
                            <button onClick={() => { setTargetId(team.id); setDeleteType('team'); setModalMessage(`Deseja realmente excluir a equipe "${team.name}"?`); setModalType('confirm_delete'); }} className="bg-red-50 text-red-500 hover:bg-red-100 p-3 rounded-xl border border-red-100 transition-all"><Trash2 size={16}/></button>
                        </>
                    ) : (
                        <button onClick={() => { setSelectedTeamForStaff(team.id); setDeleteType('leave'); setModalMessage(`Deseja sair do staff do clube "${team.name}"?`); setModalType('confirm_delete'); }} className="bg-orange-50 text-orange-600 hover:bg-orange-100 p-3 rounded-xl border border-orange-100 transition-all flex items-center gap-2 font-black text-[10px] uppercase"><LogOut size={16}/> Sair do Clube</button>
                    )}
                </div>
            </div>
            
            {isOwner && (
                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-50 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="bg-white p-2 rounded-xl text-indigo-600 shadow-sm shrink-0"><Globe size={16}/></div>
                        <div className="text-[10px] font-black uppercase text-indigo-800 tracking-widest truncate">Painel Público: <span className="text-indigo-400 font-mono text-[9px]">{pubLink}</span></div>
                    </div>
                    <button onClick={() => copyToClipboard(pubLink)} className="bg-white text-indigo-600 p-2 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-all shadow-sm shrink-0"><Copy size={14}/></button>
                </div>
            )}

            <div className="space-y-3">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block border-b pb-1">Comissão Técnica / Staff</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {members.map(u => (
                        <div key={u.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 px-3 py-2 rounded-2xl group/staff">
                            <div className="flex items-center gap-2 min-w-0">
                                {u.avatarUrl ? <img src={u.avatarUrl} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600">{u.name.charAt(0)}</div>}
                                <div className="truncate">
                                    <p className="text-[10px] font-black text-gray-700 leading-tight truncate">{u.name.split(' ')[0]}</p>
                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">{u.role}</span>
                                </div>
                            </div>
                            {isOwner && u.role !== UserRole.MASTER && (
                                <div className="flex gap-1 opacity-0 group-hover/staff:opacity-100 transition-opacity">
                                    <button onClick={() => { setSelectedStaff(u); setModalType('edit_staff_role'); }} className="p-1.5 text-indigo-600 hover:bg-white rounded-lg transition-colors" title="Mudar Cargo"><UserCog size={14}/></button>
                                    <button onClick={() => { setSelectedStaff(u); setSelectedTeamForStaff(team.id); setDeleteType('staff'); setModalType('confirm_delete'); setModalMessage(`Remover ${u.name} da equipe?`); }} className="p-1.5 text-red-500 hover:bg-white rounded-lg transition-colors" title="Remover"><UserMinus size={14}/></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {members.length === 0 && <span className="text-[10px] text-gray-300 italic">Nenhum colaborador atribuído.</span>}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
         <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><Settings size={20}/></div>
         <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Administração Central</h2>
      </div>

      <div className="flex border-b border-gray-100 bg-white">
         <button onClick={() => { setActiveTab('teams'); localStorage.setItem('admin_active_tab', 'teams'); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'teams' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Equipes & Staff</button>
         <button onClick={() => { setActiveTab('categories'); localStorage.setItem('admin_active_tab', 'categories'); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'categories' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Categorias do Time</button>
      </div>

      <div className="p-8">
        {activeTab === 'teams' && (
            <div className="space-y-12">
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Shirt size={16} className="text-indigo-500"/> Minhas Equipes (Proprietário)</h3>
                        <button onClick={() => { setTargetId(null); setFormData({name:'', logoUrl:''}); setModalType('edit_team'); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"><Plus size={16}/> Nova Equipe</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ownedTeams.map(team => renderTeamCard(team, true))}
                        {ownedTeams.length === 0 && (
                            <div className="col-span-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-10 text-center">
                                <Shirt className="mx-auto text-gray-300 mb-4" size={48}/>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Você ainda não criou nenhuma equipe.</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-6">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Briefcase size={16} className="text-emerald-500"/> Equipes onde Atuo (Colaborador)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {invitedTeams.map(team => renderTeamCard(team, false))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'categories' && (
            <div className="space-y-6">
                 <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Target size={16} className="text-emerald-500"/> Categorias da Equipe Selecionada</h3>
                    <button disabled={!currentTeamId} onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_category'); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-50"><Plus size={16}/> Nova Categoria</button>
                </div>
                {!currentTeamId && <div className="bg-indigo-50 p-10 rounded-3xl text-indigo-600 text-xs font-black uppercase text-center border border-indigo-100 tracking-widest flex flex-col items-center gap-4"><Shirt size={48} className="opacity-20"/> Selecione um time no topo do site para gerenciar categorias</div>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {categories.map(cat => (
                        <div key={cat.id} className="p-5 border border-gray-100 rounded-2xl flex justify-between items-center bg-white shadow-sm hover:border-emerald-200 transition-all group">
                            <span className="font-black text-gray-700 text-xs uppercase tracking-widest">{cat.name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setTargetId(cat.id); setFormData({name: cat.name}); setModalType('edit_category'); }} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Edit size={14}/></button>
                                <button onClick={() => { setTargetId(cat.id); setDeleteType('category'); setModalMessage(`Excluir a categoria "${cat.name}"?`); setModalType('confirm_delete'); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>

      {/* MODAIS PADRONIZADOS */}
      {(modalType === 'edit_team' || modalType === 'edit_category') && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">{targetId ? 'Editar' : 'Criar'} {modalType === 'edit_team' ? 'Equipe' : 'Categoria'}</h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 rounded-full transition-colors"><X className="text-gray-300 hover:text-red-500"/></button>
              </div>
              <div className="space-y-6">
                  {modalType === 'edit_team' && (
                      <div className="flex flex-col items-center gap-4 mb-4">
                          <div className="w-24 h-24 bg-gray-50 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200 overflow-hidden relative shadow-inner">
                              {uploading ? <Loader2 className="animate-spin text-indigo-600"/> : (formData.logoUrl ? <img src={formData.logoUrl} className="w-full h-full object-contain" /> : <Shirt size={32} className="text-gray-300"/>)}
                          </div>
                          <label className={`cursor-pointer text-indigo-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 ${uploading ? 'opacity-50' : ''}`}>
                               <Upload size={12}/> {uploading ? 'Enviando...' : 'Carregar Logo'}
                               <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleLogoUpload} />
                          </label>
                      </div>
                  )}
                  <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome</label>
                      <input autoFocus type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Master FC" />
                  </div>
              </div>
              <div className="flex gap-3 mt-8 pt-4 border-t border-gray-50">
                  <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                  <button onClick={modalType === 'edit_team' ? handleSaveTeam : handleSaveCategory} disabled={uploading || !formData.name} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 disabled:opacity-50">Salvar Dados</button>
              </div>
           </div>
        </div>
      )}

      {modalType === 'edit_staff_role' && selectedStaff && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-slide-up text-center">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600"><UserCog size={32}/></div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-2">Mudar Cargo</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">Selecione a nova função para {selectedStaff.name}</p>
                  <div className="grid grid-cols-1 gap-2 mb-8 text-left">
                      {[UserRole.TECNICO, UserRole.AUXILIAR, UserRole.SCOUT, UserRole.PREPARADOR, UserRole.MASSAGISTA].map(role => (
                          <button key={role} onClick={() => handleUpdateStaffRole(role)} className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${selectedStaff.role === role ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-indigo-50'}`}>
                              {role}
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setModalType('none')} className="text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-slide-up text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><AlertCircle size={32}/></div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-4">Atenção!</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">{modalMessage}</p>
                  <div className="flex gap-3">
                      <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                      <button onClick={executeDeletion} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all">Confirmar</button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'alert_success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {modalType === 'alert_success' ? <CheckCircle className="text-emerald-600" size={32} /> : <AlertCircle className="text-red-600" size={32} />}
                 </div>
                 <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tighter">{modalType === 'alert_success' ? 'Sucesso!' : 'Erro'}</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className="text-white font-black py-3 px-8 rounded-2xl transition-all w-full mt-6 shadow-lg uppercase tracking-widest text-[10px] bg-indigo-600 hover:bg-indigo-700">OK</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default Admin;
