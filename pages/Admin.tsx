
import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory,
  getUsers, saveUser, deleteUser
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Team, Category, UserRole, User, normalizeCategoryName } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Settings, Loader2, Copy, X, CheckCircle, AlertCircle, Shirt, ExternalLink, Globe, Target, Upload, Users, Briefcase, UserCog, UserMinus, LogOut, User as UserIcon, Link as LinkIcon, UserPlus, Search } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

type ModalType = 'none' | 'edit_team' | 'edit_category' | 'edit_my_profile' | 'alert_error' | 'alert_success' | 'edit_staff_role' | 'confirm_delete' | 'invite_staff';

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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [modalType, setModalType] = useState<ModalType>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'team' | 'category' | 'staff' | 'self'>('team');
  
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [selectedTeamForStaff, setSelectedTeamForStaff] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string>(''); 
  const [formData, setFormData] = useState<{ name: string, logoUrl?: string }>({ name: '', logoUrl: '' });
  const [profileData, setProfileData] = useState<{ name: string, avatarUrl?: string }>({ name: '', avatarUrl: '' });
  const [inviteStaffUserId, setInviteStaffUserId] = useState('');

  const refreshData = async () => {
    setLoading(true);
    try {
        const [allTeams, u] = await Promise.all([getTeams(), getUsers()]);
        setAllUsers(u);
        
        const userStr = localStorage.getItem('performax_current_user');
        const localUser: User = userStr ? JSON.parse(userStr) : null;
        
        const loggedUser = u.find(user => user.id === localUser?.id) || localUser;
        setCurrentUser(loggedUser);
        
        if (loggedUser) localStorage.setItem('performax_current_user', JSON.stringify(loggedUser));

        const ctxId = localStorage.getItem('performax_context_id');

        if (ctxId) {
            setOwnedTeams(allTeams.filter(t => t.ownerId === ctxId));
            if (loggedUser) {
                const teamIds = loggedUser.teamIds || [];
                const activeTeamIds = teamIds.filter(id => !id.startsWith('pending:'));
                setInvitedTeams(allTeams.filter(t => activeTeamIds.includes(t.id) && t.ownerId !== ctxId));
            }
        }
        
        const c = await getCategories();
        setCategories(c.filter(item => item.teamId === currentTeamId));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { refreshData(); }, [currentTeamId]);

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

  const handleInviteStaff = async () => {
      if (!inviteStaffUserId || !targetId) return;
      setLoading(true);
      try {
          const found = allUsers.find(u => u.id === inviteStaffUserId.trim());
          if (!found) throw new Error("Usuário não encontrado com este ID.");
          
          const currentIds = found.teamIds || [];
          if (currentIds.includes(targetId) || currentIds.includes(`pending:${targetId}`)) {
              throw new Error("Usuário já possui acesso ou convite para esta equipe.");
          }
          
          await saveUser({ ...found, teamIds: [...currentIds, `pending:${targetId}`] });
          setModalType('alert_success');
          setModalMessage(`Convite enviado para ${found.name}!`);
          setInviteStaffUserId('');
          refreshData();
      } catch (err: any) {
          setModalType('alert_error');
          setModalMessage(err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleSaveProfile = async () => {
      if (!profileData.name || !currentUser) return;
      setLoading(true);
      try {
          const updatedUser = { ...currentUser, name: profileData.name, avatarUrl: profileData.avatarUrl };
          await saveUser(updatedUser);
          localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
          setModalType('alert_success');
          setModalMessage('Seu perfil foi atualizado com sucesso!');
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
          } else if (deleteType === 'self' && currentUser) {
              await deleteUser(currentUser.id);
              localStorage.removeItem('performax_current_user');
              window.location.hash = '/login';
              window.location.reload();
              return;
          } else if (deleteType === 'staff' && selectedStaff && selectedTeamForStaff) {
              const updatedTeamIds = (selectedStaff.teamIds || []).filter(id => id !== selectedTeamForStaff && id !== `pending:${selectedTeamForStaff}`);
              await saveUser({ ...selectedStaff, teamIds: updatedTeamIds });
              setModalMessage('Colaborador removido da equipe.');
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
          setSelectedTeamForStaff(null);
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'team' | 'profile') => {
      const file = e.target.files?.[0];
      if (file) {
          setUploading(true);
          try {
              const url = await processImageUpload(file);
              if (type === 'team') setFormData(prev => ({ ...prev, logoUrl: url }));
              else setProfileData(prev => ({ ...prev, avatarUrl: url }));
          } catch (err) { 
              setModalType('alert_error');
              setModalMessage("Erro ao carregar imagem.");
          } finally { setUploading(false); }
      }
  };

  const copyToClipboard = (text: string, message: string) => {
      navigator.clipboard.writeText(text);
      setModalType('alert_success');
      setModalMessage(message);
  };

  const renderTeamCard = (team: Team, isOwner: boolean) => {
    const members = allUsers.filter(u => u.teamIds?.some(tid => tid === team.id || tid === `pending:${team.id}`));
    const publicUrl = `${window.location.origin}/#/p/team/${team.id}`;
    
    return (
        <div key={team.id} className="p-6 border border-gray-100 rounded-3xl bg-white shadow-sm hover:shadow-md transition-all space-y-6">
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
                {isOwner ? (
                    <div className="flex gap-2 w-full md:w-auto flex-wrap">
                        <button onClick={() => { setTargetId(team.id); setFormData({name: team.name, logoUrl: team.logoUrl}); setModalType('edit_team'); }} className="flex-1 md:flex-none bg-gray-50 text-indigo-600 hover:bg-indigo-50 p-3 rounded-xl border border-gray-100 transition-all font-black text-[10px] uppercase flex items-center justify-center gap-2"><Edit size={16}/> Editar</button>
                        <button onClick={() => { setTargetId(team.id); setModalType('invite_staff'); }} className="flex-1 md:flex-none bg-indigo-600 text-white hover:bg-indigo-700 p-3 rounded-xl transition-all font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg"><UserPlus size={16}/> Convidar Staff</button>
                        <button onClick={() => { setTargetId(team.id); setDeleteType('team'); setModalMessage(`Deseja realmente excluir a equipe "${team.name}"?`); setModalType('confirm_delete'); }} className="bg-red-50 text-red-500 hover:bg-red-100 p-3 rounded-xl border border-red-100 transition-all"><Trash2 size={16}/></button>
                    </div>
                ) : (
                    <button onClick={() => { 
                        if (currentUser) {
                            setSelectedStaff(currentUser);
                            setSelectedTeamForStaff(team.id);
                            setDeleteType('staff');
                            setModalMessage(`Deseja sair da equipe "${team.name}"?`);
                            setModalType('confirm_delete');
                        }
                    }} className="flex-1 md:flex-none bg-red-50 text-red-500 hover:bg-red-100 p-3 rounded-xl border border-red-100 font-black text-[10px] uppercase flex items-center justify-center gap-2"><LogOut size={16}/> Sair</button>
                )}
            </div>

            {isOwner && (
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">ID da Equipe (UUID)</span>
                            <span className="text-[9px] font-mono font-bold text-gray-500 select-all truncate max-w-[200px]">{team.id}</span>
                        </div>
                        <button onClick={() => copyToClipboard(team.id, 'ID do time copiado!')} className="p-2 text-indigo-600 hover:bg-white rounded-lg transition-all" title="Copiar ID"><Copy size={14}/></button>
                    </div>
                    <div className="border-t border-indigo-100 pt-3 flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"><Globe size={10}/> Link do Painel Público</span>
                            <span className="text-[9px] font-mono font-bold text-indigo-600 truncate max-w-[200px]">{publicUrl}</span>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => copyToClipboard(publicUrl, 'Link público copiado!')} className="p-2 text-indigo-600 hover:bg-white rounded-lg transition-all" title="Copiar Link"><LinkIcon size={14}/></button>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 hover:bg-white rounded-lg transition-all" title="Abrir Link"><ExternalLink size={14}/></a>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block border-b pb-1">Comissão Técnica / Staff</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {members.map(u => {
                        const isPending = u.teamIds?.includes(`pending:${team.id}`);
                        return (
                        <div key={u.id} className={`flex items-center justify-between border px-3 py-2 rounded-2xl transition-all ${isPending ? 'bg-yellow-50/50 border-yellow-100 italic' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                {u.avatarUrl ? <img src={u.avatarUrl} className={`w-6 h-6 rounded-full object-cover ${isPending ? 'grayscale' : ''}`} /> : <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold ${isPending ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'}`}>{u.name.charAt(0)}</div>}
                                <div className="truncate">
                                    <p className={`text-[10px] font-black leading-tight truncate ${isPending ? 'text-yellow-700' : 'text-gray-700'}`}>{u.name.split(' ')[0]} {isPending && '(Pendente)'}</p>
                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">{u.role}</span>
                                </div>
                            </div>
                            {isOwner && u.id !== team.ownerId && (
                                <div className="flex gap-1">
                                    {!isPending && <button onClick={() => { setSelectedStaff(u); setModalType('edit_staff_role'); }} className="p-1.5 text-indigo-600 hover:bg-white rounded-lg transition-colors bg-white/50 border border-indigo-50 shadow-sm" title="Editar Cargo"><UserCog size={14}/></button>}
                                    <button onClick={() => { setSelectedStaff(u); setSelectedTeamForStaff(team.id); setDeleteType('staff'); setModalMessage(isPending ? `Cancelar o convite para ${u.name}?` : `Excluir o acesso de ${u.name} a esta equipe?`); setModalType('confirm_delete'); }} className="p-1.5 text-red-500 hover:bg-white rounded-lg transition-colors bg-white/50 border border-red-50 shadow-sm" title="Remover"><Trash2 size={14}/></button>
                                </div>
                            )}
                        </div>
                    )})}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center border-4 border-white shadow-lg overflow-hidden shrink-0">
                  {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon size={40} className="text-indigo-200" />}
              </div>
              <div>
                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">Meu Cadastro</span>
                  <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter mt-1">{currentUser?.name}</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{currentUser?.email} • {currentUser?.role}</p>
                  <div className="flex items-center gap-2 mt-1">
                      <p className="text-[9px] text-gray-300 font-mono select-all">ID: {currentUser?.id}</p>
                      <button 
                        onClick={() => currentUser?.id && copyToClipboard(currentUser.id, 'ID de usuário copiado!')} 
                        className="text-gray-300 hover:text-indigo-500 transition-colors"
                        title="Copiar ID"
                      >
                        <Copy size={12} />
                      </button>
                  </div>
              </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
              <button onClick={() => { if(currentUser){ setProfileData({name: currentUser.name, avatarUrl: currentUser.avatarUrl}); setModalType('edit_my_profile'); } }} className="flex-1 md:flex-none bg-gray-50 text-indigo-600 px-6 py-3 rounded-xl border border-gray-100 font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all"><Edit size={16}/> Editar Perfil</button>
              <button onClick={() => { setDeleteType('self'); setModalMessage("Deseja realmente excluir sua conta permanentemente? Esta ação removerá todos os seus dados."); setModalType('confirm_delete'); }} className="flex-1 md:flex-none bg-red-50 text-red-500 px-6 py-3 rounded-xl border border-red-100 font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-red-100 transition-all"><Trash2 size={16}/> Excluir Conta</button>
          </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
           <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><Settings size={20}/></div>
           <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Administração Central</h2>
        </div>

        <div className="flex border-b border-gray-100 bg-white">
           <button onClick={() => {setActiveTab('teams'); localStorage.setItem('admin_active_tab', 'teams');}} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'teams' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Equipes & Staff</button>
           <button onClick={() => {setActiveTab('categories'); localStorage.setItem('admin_active_tab', 'categories');}} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'categories' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Categorias</button>
        </div>

        <div className="p-8">
            {activeTab === 'teams' && (
                <div className="space-y-12">
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Shirt size={16} className="text-indigo-500"/> Minhas Equipes</h3>
                            <button onClick={() => { setTargetId(null); setFormData({name:'', logoUrl:''}); setModalType('edit_team'); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"><Plus size={16}/> Nova Equipe</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ownedTeams.map(team => renderTeamCard(team, true))}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Briefcase size={16} className="text-emerald-500"/> Equipes onde Atuo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {invitedTeams.map(team => renderTeamCard(team, false))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Target size={16} className="text-emerald-500"/> Categorias do Time</h3>
                        <button disabled={!currentTeamId} onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_category'); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-50"><Plus size={16}/> Nova Categoria</button>
                    </div>
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
      </div>

      {(modalType === 'edit_team' || modalType === 'edit_category' || modalType === 'edit_my_profile') && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">
                    {modalType === 'edit_my_profile' ? 'Editar Perfil' : (targetId ? 'Editar' : 'Criar')}
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 rounded-full transition-colors"><X className="text-gray-300 hover:text-red-500"/></button>
              </div>
              
              {modalType === 'edit_my_profile' ? (
                  <div className="space-y-6">
                      <div className="flex flex-col items-center gap-4 mb-4">
                          <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center border-2 border-dashed border-gray-200 overflow-hidden relative shadow-inner">
                              {uploading ? <Loader2 className="animate-spin text-indigo-600"/> : (profileData.avatarUrl ? <img src={profileData.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon size={32} className="text-gray-300"/>)}
                          </div>
                          <label className={`cursor-pointer text-indigo-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 ${uploading ? 'opacity-50' : ''}`}>
                               <Upload size={12}/> Carregar Foto
                               <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => handleImageUpload(e, 'profile')} />
                          </label>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Seu Nome Completo</label>
                          <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} />
                      </div>
                  </div>
              ) : (
                <div className="space-y-6">
                    {modalType === 'edit_team' && (
                        <div className="flex flex-col items-center gap-4 mb-4">
                            <div className="w-24 h-24 bg-gray-50 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200 overflow-hidden relative shadow-inner">
                                {uploading ? <Loader2 className="animate-spin text-indigo-600"/> : (formData.logoUrl ? <img src={formData.logoUrl} className="w-full h-full object-contain" /> : <Shirt size={32} className="text-gray-300"/>)}
                            </div>
                            <label className={`cursor-pointer text-indigo-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 ${uploading ? 'opacity-50' : ''}`}>
                                 <Upload size={12}/> {uploading ? 'Enviando...' : 'Carregar Logo'}
                                 <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => handleImageUpload(e, 'team')} />
                            </label>
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome</label>
                        <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-black text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                </div>
              )}

              <div className="flex gap-3 mt-8 pt-4 border-t border-gray-50">
                  <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                  <button onClick={modalType === 'edit_my_profile' ? handleSaveProfile : (modalType === 'edit_team' ? handleSaveTeam : handleSaveCategory)} disabled={uploading} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 disabled:opacity-50">Salvar Alterações</button>
              </div>
           </div>
        </div>
      )}

      {modalType === 'invite_staff' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up border border-indigo-50">
                  <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 shadow-inner"><UserPlus size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tighter">Convidar Colaborador</h2>
                  <p className="text-[10px] text-gray-400 mb-8 font-black uppercase tracking-widest leading-relaxed">Insira o ID de Usuário do colaborador para convidá-lo para esta equipe.</p>
                  <div className="space-y-4">
                      <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                          <input autoFocus type="text" className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-4 font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="Cole o ID (UUID) aqui..." value={inviteStaffUserId} onChange={e => setInviteStaffUserId(e.target.value)} />
                      </div>
                      <button onClick={handleInviteStaff} disabled={loading || !inviteStaffUserId} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : 'Enviar Convite'}
                      </button>
                  </div>
                  <button onClick={() => {setModalType('none'); setInviteStaffUserId('');}} className="mt-8 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {modalType === 'edit_staff_role' && selectedStaff && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center">
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-6">Mudar Cargo</h3>
                  <div className="grid grid-cols-1 gap-2 mb-8">
                      {[UserRole.TECNICO, UserRole.AUXILIAR, UserRole.SCOUT, UserRole.PREPARADOR, UserRole.MASSAGISTA].map(role => (
                          <button key={role} onClick={async () => {
                              setLoading(true);
                              await saveUser({ ...selectedStaff, role });
                              setModalType('alert_success');
                              setModalMessage('Cargo atualizado!');
                              refreshData();
                          }} className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${selectedStaff.role === role ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>
                              {role}
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setModalType('none')} className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center animate-slide-up">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><AlertCircle size={32}/></div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter mb-4">Atenção!</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">{modalMessage}</p>
                  <div className="flex gap-3">
                      <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                      <button onClick={executeDeletion} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-red-700">Confirmar</button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${modalType === 'alert_success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {modalType === 'alert_success' ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
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
