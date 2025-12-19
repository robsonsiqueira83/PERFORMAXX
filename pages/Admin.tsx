
import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory,
  getUsers, saveUser, deleteUser
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Team, Category, UserRole, User, normalizeCategoryName } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Settings, Loader2, Copy, X, CheckCircle, AlertCircle, Shirt, ExternalLink, Globe, Target, Upload, Users, Briefcase, UserCog, UserMinus, LogOut, User as UserIcon, Link as LinkIcon, UserPlus, Search, AlertTriangle, Inbox } from 'lucide-react';

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
  const [pendingInvites, setPendingInvites] = useState<Team[]>([]);
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
                const pendingTeamIds = teamIds.filter(id => id.startsWith('pending:')).map(id => id.replace('pending:', ''));
                
                setInvitedTeams(allTeams.filter(t => activeTeamIds.includes(t.id) && t.ownerId !== ctxId));
                setPendingInvites(allTeams.filter(t => pendingTeamIds.includes(t.id)));
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
          if (!found) throw new Error("Usuário não encontrado.");
          const currentIds = found.teamIds || [];
          if (currentIds.includes(targetId) || currentIds.includes(`pending:${targetId}`)) throw new Error("Acesso já concedido ou pendente.");
          await saveUser({ ...found, teamIds: [...currentIds, `pending:${targetId}`] });
          setModalType('alert_success');
          setModalMessage(`Convite enviado para ${found.name}!`);
          setInviteStaffUserId('');
          refreshData();
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); } 
      finally { setLoading(false); }
  };

  const handleAcceptInvite = async (team: Team) => {
      if (!currentUser) return;
      setLoading(true);
      try {
          const newTeamIds = (currentUser.teamIds || []).map(id => id === `pending:${team.id}` ? team.id : id);
          const updatedUser = { ...currentUser, teamIds: newTeamIds };
          await saveUser(updatedUser);
          localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
          setModalType('alert_success');
          setModalMessage(`Você entrou na equipe ${team.name}!`);
          refreshData();
          window.location.reload(); // Recarregar para atualizar contexto
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
      finally { setLoading(false); }
  };

  const handleDeclineInvite = async (team: Team) => {
      if (!currentUser) return;
      setLoading(true);
      try {
          const newTeamIds = (currentUser.teamIds || []).filter(id => id !== `pending:${team.id}`);
          const updatedUser = { ...currentUser, teamIds: newTeamIds };
          await saveUser(updatedUser);
          localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
          setModalType('alert_success');
          setModalMessage(`Convite de ${team.name} recusado.`);
          refreshData();
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
      finally { setLoading(false); }
  };

  const handleSaveProfile = async () => {
      if (!profileData.name || !currentUser) return;
      setLoading(true);
      try {
          const updatedUser = { ...currentUser, name: profileData.name, avatarUrl: profileData.avatarUrl };
          await saveUser(updatedUser);
          localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
          setModalType('alert_success');
          setModalMessage('Perfil atualizado!');
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
        setModalMessage('Categoria salva!');
        refreshData();
    } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
    finally { setLoading(false); }
  };

  const handleUpdateStaffRole = async (newRole: UserRole) => {
      if (!selectedStaff) return;
      setLoading(true);
      try {
          await saveUser({ ...selectedStaff, role: newRole });
          setModalType('alert_success');
          setModalMessage(`Cargo de ${selectedStaff.name} alterado.`);
          refreshData();
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); }
      finally { setLoading(false); setSelectedStaff(null); }
  };

  const executeDeletion = async () => {
      setLoading(true);
      try {
          if (deleteType === 'team' && targetId) await deleteTeam(targetId);
          else if (deleteType === 'category' && targetId) await deleteCategory(targetId);
          else if (deleteType === 'self' && currentUser) {
              await deleteUser(currentUser.id);
              localStorage.removeItem('performax_current_user');
              window.location.hash = '/login';
              window.location.reload();
              return;
          } else if (deleteType === 'staff' && selectedStaff && selectedTeamForStaff) {
              const updatedTeamIds = (selectedStaff.teamIds || []).filter(id => id !== selectedTeamForStaff && id !== `pending:${selectedTeamForStaff}`);
              await saveUser({ ...selectedStaff, teamIds: updatedTeamIds });
          }
          setModalType('alert_success');
          setModalMessage('Operação concluída com sucesso.');
          refreshData();
      } catch (err: any) { setModalType('alert_error'); setModalMessage(err.message); } 
      finally { setLoading(false); setTargetId(null); setSelectedStaff(null); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'team' | 'profile') => {
      const file = e.target.files?.[0];
      if (file) {
          setUploading(true);
          try {
              const url = await processImageUpload(file);
              if (type === 'team') setFormData(prev => ({ ...prev, logoUrl: url }));
              else setProfileData(prev => ({ ...prev, avatarUrl: url }));
          } catch (err) { setModalType('alert_error'); setModalMessage("Erro no upload."); } 
          finally { setUploading(false); }
      }
  };

  const renderTeamCard = (team: Team, isOwner: boolean) => {
    const members = allUsers.filter(u => u.teamIds?.some(tid => tid === team.id || tid === `pending:${team.id}`));
    const publicUrl = `${window.location.origin}/#/p/team/${team.id}`;
    
    return (
        <div key={team.id} className="p-6 border border-gray-100 dark:border-darkBorder rounded-3xl bg-white dark:bg-darkCard shadow-sm hover:shadow-md transition-all space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-5">
                    {team.logoUrl ? <img src={team.logoUrl} className="w-16 h-16 object-contain rounded-2xl border border-gray-100 dark:border-darkBorder" /> : <div className="w-16 h-16 bg-indigo-50 dark:bg-darkInput rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl">{team.name.charAt(0)}</div>}
                    <div>
                        <span className="font-black text-gray-800 dark:text-gray-100 text-lg uppercase tracking-tighter leading-none">{team.name}</span>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">ID: {team.id.substring(0,8)}</span>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter flex items-center gap-1"><Users size={12}/> {members.length} Staff</span>
                        </div>
                    </div>
                </div>
                {isOwner ? (
                    <div className="flex gap-2 w-full md:w-auto flex-wrap">
                        <button onClick={() => { setTargetId(team.id); setFormData({name: team.name, logoUrl: team.logoUrl}); setModalType('edit_team'); }} className="flex-1 md:flex-none bg-gray-50 dark:bg-darkInput text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 p-3 rounded-xl border border-gray-100 dark:border-darkBorder transition-all font-black text-[10px] uppercase flex items-center justify-center gap-2"><Edit size={16}/> Editar</button>
                        <button onClick={() => { setTargetId(team.id); setModalType('invite_staff'); }} className="flex-1 md:flex-none bg-indigo-600 text-white hover:bg-indigo-700 p-3 rounded-xl transition-all font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg"><UserPlus size={16}/> Convidar</button>
                        <button onClick={() => { setTargetId(team.id); setDeleteType('team'); setModalMessage(`Excluir equipe "${team.name}"?`); setModalType('confirm_delete'); }} className="bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 hover:bg-red-100 p-3 rounded-xl border border-red-100 dark:border-red-900/30 transition-all"><Trash2 size={16}/></button>
                    </div>
                ) : (
                    <button onClick={() => { if (currentUser) { setSelectedStaff(currentUser); setSelectedTeamForStaff(team.id); setDeleteType('staff'); setModalMessage(`Sair da equipe "${team.name}"?`); setModalType('confirm_delete'); } }} className="flex-1 md:flex-none bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 hover:bg-red-100 p-3 rounded-xl border border-red-100 dark:border-red-900/30 font-black text-[10px] uppercase flex items-center justify-center gap-2"><LogOut size={16}/> Sair</button>
                )}
            </div>

            {isOwner && (
                <div className="p-4 bg-indigo-50/50 dark:bg-darkInput/50 rounded-2xl border border-indigo-100 dark:border-darkBorder space-y-3">
                    <div className="flex justify-between items-center border-b dark:border-darkBorder pb-3">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">ID da Equipe (UUID)</span>
                            <span className="text-[9px] font-mono font-bold text-gray-500 select-all truncate max-w-[200px]">{team.id}</span>
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(team.id)} className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-darkCard rounded-lg transition-all"><Copy size={14}/></button>
                    </div>
                    <div className="pt-1 flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"><Globe size={10}/> Link Público</span>
                            <span className="text-[9px] font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">{publicUrl}</span>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => navigator.clipboard.writeText(publicUrl)} className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-darkCard rounded-lg transition-all"><LinkIcon size={14}/></button>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-darkCard rounded-lg transition-all"><ExternalLink size={14}/></a>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block border-b dark:border-darkBorder pb-1">Comissão Técnica</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {members.map(u => {
                        const isPending = u.teamIds?.includes(`pending:${team.id}`);
                        return (
                        <div key={u.id} className={`flex items-center justify-between border px-3 py-2 rounded-2xl transition-all ${isPending ? 'bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/30 italic' : 'bg-gray-50 dark:bg-darkInput border-gray-100 dark:border-darkBorder'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                {u.avatarUrl ? <img src={u.avatarUrl} className={`w-6 h-6 rounded-full object-cover ${isPending ? 'grayscale' : ''}`} /> : <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold ${isPending ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>{u.name.charAt(0)}</div>}
                                <div className="truncate">
                                    <p className={`text-[10px] font-black leading-tight truncate ${isPending ? 'text-yellow-700 dark:text-yellow-500' : 'text-gray-700 dark:text-gray-300'}`}>{u.name.split(' ')[0]} {isPending && '(Pendente)'}</p>
                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">{u.role}</span>
                                </div>
                            </div>
                            {isOwner && u.id !== currentUser?.id && (
                                <div className="flex gap-1">
                                    <button onClick={() => { setSelectedStaff(u); setModalType('edit_staff_role'); }} className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Trocar Cargo"><UserCog size={12}/></button>
                                    <button onClick={() => { setSelectedStaff(u); setSelectedTeamForStaff(team.id); setDeleteType('staff'); setModalMessage(`Remover acesso de ${u.name}?`); setModalType('confirm_delete'); }} className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Remover Acesso"><UserMinus size={12}/></button>
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
    <div className="space-y-8 animate-fade-in transition-colors duration-300">
      <div className="bg-white dark:bg-darkCard rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-indigo-50 dark:bg-darkInput rounded-full flex items-center justify-center border-4 border-white dark:border-darkBorder shadow-lg overflow-hidden shrink-0">
                  {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon size={40} className="text-indigo-200 dark:text-indigo-900" />}
              </div>
              <div>
                  <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">Meu Cadastro</span>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter mt-1">{currentUser?.name}</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">{currentUser?.email} • {currentUser?.role}</p>
                  <p className="text-[9px] text-gray-300 dark:text-gray-700 font-mono mt-1">ID: {currentUser?.id}</p>
              </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
              <button onClick={() => { if(currentUser){ setProfileData({name: currentUser.name, avatarUrl: currentUser.avatarUrl}); setModalType('edit_my_profile'); } }} className="flex-1 md:flex-none bg-gray-50 dark:bg-darkInput text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-xl border border-gray-100 dark:border-darkBorder font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"><Edit size={16}/> Editar Perfil</button>
              <button onClick={() => { setDeleteType('self'); setModalMessage("Excluir conta permanentemente?"); setModalType('confirm_delete'); }} className="flex-1 md:flex-none bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 px-6 py-3 rounded-xl border border-red-100 dark:border-red-900/30 font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"><Trash2 size={16}/> Excluir Conta</button>
          </div>
      </div>

      <div className="bg-white dark:bg-darkCard rounded-3xl shadow-sm border border-gray-100 dark:border-darkBorder overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-darkBorder flex items-center gap-3 bg-gray-50/50 dark:bg-darkInput/30">
           <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><Settings size={20}/></div>
           <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Administração Central</h2>
        </div>

        <div className="flex border-b border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard">
           <button onClick={() => {setActiveTab('teams'); localStorage.setItem('admin_active_tab', 'teams');}} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'teams' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/20 dark:bg-indigo-900/10' : 'border-transparent text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'}`}>Equipes & Staff</button>
           <button onClick={() => {setActiveTab('categories'); localStorage.setItem('admin_active_tab', 'categories');}} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'categories' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/20 dark:bg-indigo-900/10' : 'border-transparent text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'}`}>Categorias</button>
        </div>

        <div className="p-8">
            {activeTab === 'teams' && (
                <div className="space-y-12">
                    
                    {/* CONVITES PENDENTES */}
                    {pendingInvites.length > 0 && (
                        <div className="space-y-4 mb-8 bg-amber-50 dark:bg-amber-900/10 p-6 rounded-3xl border border-amber-100 dark:border-amber-900/30">
                            <h3 className="text-sm font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2"><Inbox size={16} /> Convites Pendentes</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pendingInvites.map(team => (
                                    <div key={team.id} className="p-4 bg-white dark:bg-darkCard rounded-2xl border border-amber-100 dark:border-amber-900/30 shadow-sm flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            {team.logoUrl ? <img src={team.logoUrl} className="w-10 h-10 rounded-xl object-contain border" /> : <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 font-black">{team.name.charAt(0)}</div>}
                                            <div>
                                                <span className="font-black text-gray-800 dark:text-gray-100 uppercase text-xs">{team.name}</span>
                                                <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">Solicitação de Acesso</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAcceptInvite(team)} className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-md"><CheckCircle size={16}/></button>
                                            <button onClick={() => handleDeclineInvite(team)} className="bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-900/30"><X size={16}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest flex items-center gap-2"><Shirt size={16} className="text-indigo-500"/> Minhas Equipes</h3>
                            <button onClick={() => { setTargetId(null); setFormData({name:'', logoUrl:''}); setModalType('edit_team'); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all"><Plus size={16}/> Nova Equipe</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ownedTeams.map(team => renderTeamCard(team, true))}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest flex items-center gap-2"><Briefcase size={16} className="text-emerald-500"/> Equipes Externas</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {invitedTeams.map(team => renderTeamCard(team, false))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest flex items-center gap-2"><Target size={16} className="text-emerald-500"/> Categorias do Time</h3>
                        <button disabled={!currentTeamId} onClick={() => { setTargetId(null); setFormData({name:''}); setModalType('edit_category'); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg disabled:opacity-50"><Plus size={16}/> Nova Categoria</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {categories.map(cat => (
                            <div key={cat.id} className="p-5 border border-gray-100 dark:border-darkBorder rounded-2xl flex justify-between items-center bg-white dark:bg-darkCard shadow-sm hover:border-emerald-200 transition-all group">
                                <span className="font-black text-gray-700 dark:text-gray-300 text-xs uppercase tracking-widest">{cat.name}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setTargetId(cat.id); setFormData({name: cat.name}); setModalType('edit_category'); }} className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg"><Edit size={14}/></button>
                                    <button onClick={() => { setTargetId(cat.id); setDeleteType('category'); setModalMessage(`Excluir categoria "${cat.name}"?`); setModalType('confirm_delete'); }} className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={14}/></button>
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
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-8 border-b dark:border-darkBorder pb-4">
                <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">
                    {modalType === 'edit_my_profile' ? 'Editar Perfil' : (targetId ? 'Editar' : 'Criar')}
                </h3>
                <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"><X className="text-gray-300 hover:text-red-500"/></button>
              </div>
              <div className="space-y-6">
                    {modalType === 'edit_team' || modalType === 'edit_my_profile' ? (
                        <div className="flex flex-col items-center gap-4 mb-4">
                            <div className="w-24 h-24 bg-gray-50 dark:bg-darkInput rounded-full flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-darkBorder overflow-hidden relative shadow-inner">
                                {uploading ? <Loader2 className="animate-spin text-indigo-600"/> : (modalType === 'edit_team' ? (formData.logoUrl ? <img src={formData.logoUrl} className="w-full h-full object-contain" /> : <Shirt size={32} className="text-gray-300"/>) : (profileData.avatarUrl ? <img src={profileData.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon size={32} className="text-gray-300"/>))}
                            </div>
                            <label className={`cursor-pointer text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${uploading ? 'opacity-50' : ''}`}>
                                 <Upload size={12}/> {uploading ? 'Enviando...' : 'Carregar Foto'}
                                 <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={(e) => handleImageUpload(e, modalType === 'edit_team' ? 'team' : 'profile')} />
                            </label>
                        </div>
                    ) : null}
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome</label>
                        <input type="text" className="w-full bg-gray-50 dark:bg-darkInput dark:text-gray-100 border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-black outline-none focus:ring-2 focus:ring-indigo-500" value={modalType === 'edit_my_profile' ? profileData.name : formData.name} onChange={e => modalType === 'edit_my_profile' ? setProfileData({...profileData, name: e.target.value}) : setFormData({...formData, name: e.target.value})} />
                    </div>
              </div>
              <div className="flex gap-3 mt-8 pt-4 border-t dark:border-darkBorder">
                  <button onClick={() => setModalType('none')} className="flex-1 bg-gray-50 dark:bg-darkInput text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px]">Cancelar</button>
                  <button onClick={modalType === 'edit_my_profile' ? handleSaveProfile : (modalType === 'edit_team' ? handleSaveTeam : handleSaveCategory)} disabled={uploading} className="flex-[2] bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 disabled:opacity-50">Confirmar</button>
              </div>
           </div>
        </div>
      )}

      {modalType === 'invite_staff' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
                  <div className="flex justify-between items-center mb-6 border-b dark:border-darkBorder pb-4">
                      <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter flex items-center gap-2"><UserPlus className="text-indigo-600" /> Convidar Staff</h3>
                      <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"><X className="text-gray-300 hover:text-red-500"/></button>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest mb-6 leading-relaxed">Informe o ID único (UUID) do profissional que deseja convidar para esta equipe.</p>
                  <div className="space-y-4">
                      <input 
                          type="text" 
                          className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder dark:text-gray-100 rounded-2xl p-4 text-center font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500" 
                          placeholder="Cole o ID do usuário..." 
                          value={inviteStaffUserId}
                          onChange={e => setInviteStaffUserId(e.target.value)}
                      />
                      <button onClick={handleInviteStaff} disabled={loading || !inviteStaffUserId} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">Enviar Convite</button>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'edit_staff_role' && selectedStaff && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-3xl w-full max-w-md p-8 shadow-2xl animate-slide-up">
                  <div className="flex justify-between items-center mb-8 border-b dark:border-darkBorder pb-4">
                      <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Alterar Cargo</h3>
                      <button onClick={() => setModalType('none')} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"><X className="text-gray-300 hover:text-red-500"/></button>
                  </div>
                  <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Escolha a função de <span className="text-indigo-600 dark:text-indigo-400">{selectedStaff.name}</span>:</p>
                      <div className="grid grid-cols-1 gap-2">
                        {[UserRole.TECNICO, UserRole.AUXILIAR, UserRole.SCOUT, UserRole.PREPARADOR, UserRole.MASSAGISTA].map(role => (
                            <button 
                                key={role} 
                                onClick={() => handleUpdateStaffRole(role)}
                                className={`w-full p-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all text-left flex items-center justify-between group
                                    ${selectedStaff.role === role 
                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' 
                                        : 'bg-gray-50 dark:bg-darkInput text-gray-600 dark:text-gray-400 border-gray-100 dark:border-darkBorder hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}
                            >
                                {role}
                                {selectedStaff.role === role && <CheckCircle size={14} />}
                            </button>
                        ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {modalType === 'confirm_delete' && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-sm p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 dark:text-red-400 shadow-inner">
                      <AlertTriangle size={40} />
                  </div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Confirmar Exclusão</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-8 font-bold uppercase tracking-widest leading-relaxed">
                      {modalMessage}
                  </p>
                  <div className="space-y-3">
                      <button onClick={executeDeletion} disabled={loading} className="w-full bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-xl uppercase tracking-widest text-[11px] active:scale-95 border-b-4 border-red-900">
                         {loading ? <Loader2 className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                         Confirmar
                      </button>
                      <button onClick={() => setModalType('none')} className="w-full bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl hover:bg-gray-100 transition-all uppercase tracking-widest text-[11px]">
                         Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {(modalType === 'alert_success' || modalType === 'alert_error') && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner ${modalType === 'alert_success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {modalType === 'alert_success' ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">{modalType === 'alert_success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mb-8">{modalMessage}</p>
                 <button onClick={() => setModalType('none')} className={`text-white font-black py-4 px-12 rounded-2xl transition-all w-full shadow-lg uppercase tracking-widest text-[11px] active:scale-95 ${modalType === 'alert_success' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}>Entendido</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default Admin;
