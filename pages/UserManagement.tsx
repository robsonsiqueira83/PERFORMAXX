import React, { useState, useEffect } from 'react';
import { getUsers, getUserById, saveUser, deleteUser, getTeams } from '../services/storageService';
import { User, UserRole, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, ShieldCheck, Loader2, CheckSquare, Square, AlertCircle, CheckCircle, Lock, Eye, Database, X, Globe, Mail, UserCheck, Briefcase, UserMinus, UserX, Copy, Search, Building, Clock, RefreshCw } from 'lucide-react';
import { processImageUpload } from '../services/imageService';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentContextId, setCurrentContextId] = useState<string>('');

  // Modal States
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, isGuestMaster: boolean } | null>(null);
  
  // Invite Modal State
  const [inviteModal, setInviteModal] = useState<{ isOpen: boolean, user: User | null, newTeams: string[] }>({ isOpen: false, user: null, newTeams: [] });
  // Invite By ID State
  const [inviteByIdModal, setInviteByIdModal] = useState(false);
  const [guestIdInput, setGuestIdInput] = useState('');
  const [guestIdError, setGuestIdError] = useState('');
  const [searchingId, setSearchingId] = useState(false);

  // Selected Role for Invite
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.TECNICO);

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    const storedContext = localStorage.getItem('performax_context_id');
    
    if (storedUser) {
        const u = JSON.parse(storedUser);
        setCurrentUser(u);
        // Determine context: Use stored context ID, fallback to user ID (if master), fallback to empty
        const ctx = storedContext || u.id;
        setCurrentContextId(ctx);
        loadData(ctx, u);
    }
  }, []);

  const loadData = async (contextId: string, loggedUser: User) => {
      setLoading(true);
      const [allUsers, allTeams] = await Promise.all([getUsers(), getTeams()]);
      setAllSystemUsers(allUsers);
      
      // 1. Filter Teams: Only show teams owned by the current Context (Master)
      const panelTeams = allTeams.filter(t => t.ownerId === contextId);
      setTeams(panelTeams);
      const panelTeamIds = panelTeams.map(t => t.id);

      // 2. Filter Users: Strict Multi-tenancy Rules
      const filteredUsers = allUsers.filter(u => {
          // Rule A: Never show Global Users in a Master Panel list (unless viewing self)
          if (u.role === UserRole.GLOBAL) {
              if (loggedUser.role === UserRole.GLOBAL && contextId === loggedUser.id) return true;
              return false;
          }

          // Rule B: Show the Master of this panel
          if (u.role === UserRole.MASTER && u.id === contextId) return true;

          // Rule C: GUEST MASTERS - Show Masters who are NOT the owner but have access to teams in this panel
          if (u.role === UserRole.MASTER && u.id !== contextId) {
              // FIX: Check ALL ids (normalized), ensuring pending invites also show up
              const allUserTeamIds = (u.teamIds || []).map(id => id.replace('pending:', ''));
              const hasAccessToPanelTeam = allUserTeamIds.some(tid => panelTeamIds.includes(tid));
              if (hasAccessToPanelTeam) return true;
              return false;
          }

          // Rule D: For Staff/Collaborators
          // Show if they are assigned to at least one team in this panel (INCLUDING PENDING)
          if (u.teamIds && u.teamIds.length > 0) {
              const hasAccessOrInvite = u.teamIds.some(tid => {
                  const cleanId = tid.replace('pending:', '');
                  return panelTeamIds.includes(cleanId);
              });
              return hasAccessOrInvite;
          }

          return false;
      });

      setUsers(filteredUsers);
      setLoading(false);
  };

  const handleManualRefresh = () => {
      if (currentUser) loadData(currentContextId, currentUser);
  };

  const handleRoleChange = (newRole: UserRole) => {
    if (!editingUser) return;
    const isSuper = newRole === UserRole.MASTER || newRole === UserRole.GLOBAL;
    setEditingUser({
        ...editingUser,
        role: newRole,
        teamIds: isSuper ? [] : (editingUser.teamIds || [])
    });
  };

  const handleSave = async () => {
    try {
        setError(null);
        if (!editingUser?.name || !editingUser?.email || !editingUser.role) {
            setError("Preencha todos os campos obrigatórios.");
            return;
        }

        // Check if email already exists in system (Global check)
        const existingUser = allSystemUsers.find(u => u.email === editingUser.email && u.id !== editingUser.id);
        
        if (existingUser) {
             processExistingUserInvite(existingUser);
             return;
        }

        // Security Check: Non-MASTER/GLOBAL users MUST have at least one team
        if (editingUser.role !== UserRole.MASTER && editingUser.role !== UserRole.GLOBAL && (!editingUser.teamIds || editingUser.teamIds.length === 0)) {
            setError("Para usuários com permissão restrita, é obrigatório selecionar pelo menos um time.");
            return;
        }

        setSaving(true);
        const roleToSave = editingUser.role as UserRole;

        const user: User = {
            id: editingUser.id || uuidv4(),
            name: editingUser.name,
            email: editingUser.email,
            role: roleToSave,
            password: editingUser.password || '123456', 
            avatarUrl: editingUser.avatarUrl,
            teamIds: (roleToSave === UserRole.MASTER || roleToSave === UserRole.GLOBAL) ? [] : (editingUser.teamIds || [])
        };
        
        const { error: saveError } = await saveUser(user);

        if (saveError) throw saveError;

        if (currentUser) await loadData(currentContextId, currentUser);
        
        setEditingUser(null);
        setSuccessMessage("Usuário salvo com sucesso!");

    } catch (err: any) {
        console.error("Erro ao salvar usuário:", err);
        setError(err.message || "Erro desconhecido ao salvar.");
    } finally {
        setSaving(false);
    }
  };

  // Helper to handle existing user logic (used by Email check)
  const processExistingUserInvite = (existingUser: User) => {
     // INVITE FLOW
     if (editingUser?.role && editingUser.role !== UserRole.MASTER && editingUser.role !== UserRole.GLOBAL) {
         const selectedTeams = editingUser.teamIds || [];
         const newTeamsToInvite = selectedTeams.filter(tId => !existingUser.teamIds?.includes(tId) && !existingUser.teamIds?.includes(`pending:${tId}`));
         
         // If we are coming from the Create User form and found a match
         setInviteRole(editingUser.role as UserRole); 
         setInviteModal({ isOpen: true, user: existingUser, newTeams: newTeamsToInvite });
         setEditingUser(null); 
     } else {
         setError("Este email/ID já pertence a um usuário do sistema.");
     }
  };

  const handleSearchGuestById = async () => {
      setGuestIdError('');
      if (!guestIdInput) return;
      setSearchingId(true);

      const term = guestIdInput.trim();

      // 1. Try finding in loaded list (Faster)
      let foundUser = allSystemUsers.find(u => u.id === term);

      // 2. If not found, try finding directly in DB (Reliable)
      if (!foundUser) {
          try {
              const freshUser = await getUserById(term);
              if (freshUser) foundUser = freshUser;
          } catch (err) {
              console.error(err);
          }
      }

      setSearchingId(false);

      if (foundUser) {
          // Found! Directly open invite modal without "Create" context
          setInviteByIdModal(false);
          setGuestIdInput('');
          
          // Default role for new invite
          setInviteRole(UserRole.TECNICO);
          
          // Open modal with empty newTeams to force selection
          setInviteModal({ isOpen: true, user: foundUser, newTeams: [] });
      } else {
          setGuestIdError('Usuário não encontrado com este ID.');
      }
  };

  // Improved Invite Modal confirmation logic to handle the team selection inside it
  const [inviteSelectedTeams, setInviteSelectedTeams] = useState<string[]>([]);

  useEffect(() => {
      if (inviteModal.isOpen) {
          setInviteSelectedTeams(inviteModal.newTeams);
      }
  }, [inviteModal.isOpen]);

  const handleInviteConfirmWithSelection = async () => {
      if (!inviteModal.user) return;
      
      if (inviteSelectedTeams.length === 0) {
          alert("Selecione ao menos um time para convidar.");
          return;
      }

      const userToUpdate = { ...inviteModal.user };
      const currentTeamIds = userToUpdate.teamIds || [];
      // Always add as pending for existing external users
      const pendingTeamIds = inviteSelectedTeams.map(id => `pending:${id}`);
      
      // Filter out duplicates and existing
      const uniqueNew = pendingTeamIds.filter(pid => !currentTeamIds.includes(pid) && !currentTeamIds.includes(pid.replace('pending:', '')));
      
      userToUpdate.teamIds = [...currentTeamIds, ...uniqueNew];
      
      // Only update role if it's not a Master/Global (preserve hierarchy of invited user if they are high level elsewhere)
      if (userToUpdate.role !== UserRole.MASTER && userToUpdate.role !== UserRole.GLOBAL) {
          userToUpdate.role = inviteRole; 
      }

      await saveUser(userToUpdate);
      
      setInviteModal({ isOpen: false, user: null, newTeams: [] });
      setSuccessMessage("Convite enviado com sucesso!");
      
      // Refresh list to show pending
      if (currentUser) await loadData(currentContextId, currentUser);
  };


  const requestDelete = (user: User) => {
      const isGuestMaster = user.id !== currentContextId;
      setDeleteConfirmation({ id: user.id, isGuestMaster });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation || !currentUser) return;

    if (deleteConfirmation.isGuestMaster) {
        // Just remove access to THIS panel's teams
        const targetUser = users.find(u => u.id === deleteConfirmation.id);
        if (targetUser) {
            const panelTeamIds = teams.map(t => t.id);
            // Keep IDs that do NOT belong to this panel
            const newTeamIds = (targetUser.teamIds || []).filter(tid => {
                const cleanId = tid.replace('pending:', '');
                return !panelTeamIds.includes(cleanId);
            });
            await saveUser({ ...targetUser, teamIds: newTeamIds });
            setSuccessMessage("Colaborador removido deste painel com sucesso!");
        }
    } else {
        // Full delete
        await deleteUser(deleteConfirmation.id);
    }

    await loadData(currentContextId, currentUser);
    setDeleteConfirmation(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && editingUser) {
          const url = await processImageUpload(e.target.files[0]);
          setEditingUser({ ...editingUser, avatarUrl: url });
      }
  };

  const toggleTeamSelection = (teamId: string) => {
      if (!editingUser) return;
      const currentIds = editingUser.teamIds || [];
      if (currentIds.includes(teamId)) {
          setEditingUser({ ...editingUser, teamIds: currentIds.filter(id => id !== teamId) });
      } else {
          setEditingUser({ ...editingUser, teamIds: [...currentIds, teamId] });
      }
  };

  const toggleInviteTeamSelection = (teamId: string) => {
      if (inviteSelectedTeams.includes(teamId)) {
          setInviteSelectedTeams(prev => prev.filter(id => id !== teamId));
      } else {
          setInviteSelectedTeams(prev => [...prev, teamId]);
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  const getPermissionDescription = (role: UserRole) => {
    switch (role) {
        case UserRole.GLOBAL: return { icon: <Globe className="text-purple-600" size={24} />, title: "Super Admin (Global)", desc: "Acesso irrestrito a TODOS os painéis Master.", color: "bg-purple-50 border-purple-200 text-purple-900" };
        case UserRole.MASTER: return { icon: <ShieldCheck className="text-blue-600" size={24} />, title: "Dono do Painel (Master)", desc: "Controle total do seu próprio painel.", color: "bg-blue-50 border-blue-200 text-blue-900" };
        case UserRole.TECNICO:
        case UserRole.AUXILIAR:
        case UserRole.SCOUT: return { icon: <Database className="text-green-600" size={24} />, title: "Gestão de Dados", desc: "Pode cadastrar e editar dados nos times selecionados.", color: "bg-green-50 border-green-200 text-green-900" };
        default: return { icon: <Eye className="text-orange-600" size={24} />, title: "Apenas Visualização", desc: "Acesso somente leitura.", color: "bg-orange-50 border-orange-200 text-orange-900" };
    }
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && users.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  // Helper to check if a user is in Pending state for ALL teams in this panel
  const isUserPending = (u: User) => {
      const panelTeamIds = teams.map(t => t.id);
      const userPanelIds = (u.teamIds || []).filter(tid => panelTeamIds.includes(tid.replace('pending:', '')));
      
      if (userPanelIds.length === 0) return false;
      // Return true if ALL relevant IDs are pending
      return userPanelIds.every(tid => tid.startsWith('pending:'));
  };

  // Organize Lists
  const internalUsers = users.filter(u => u.id === currentContextId);
  const externalCollaborators = users.filter(u => u.id !== currentContextId);
  
  // Split External into Active vs Pending
  const pendingInvites = externalCollaborators.filter(u => isUserPending(u));
  const activeCollaborators = externalCollaborators.filter(u => !isUserPending(u));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
           <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
               <ShieldCheck className="text-blue-600"/> Gestão de Usuários
           </h2>
           <div className="flex gap-2 w-full md:w-auto">
               <button onClick={handleManualRefresh} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-lg transition-colors" title="Atualizar Lista">
                   <RefreshCw size={20} />
               </button>
               <button onClick={() => setInviteByIdModal(true)} className="flex-1 md:flex-none bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-colors border border-blue-200 text-sm">
                   <UserCheck size={18} /> Convidar por ID
               </button>
               <button onClick={() => setEditingUser({role: UserRole.TECNICO, teamIds: []})} className="flex-1 md:flex-none bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-colors text-sm">
                   <Plus size={18} /> Novo Usuário
               </button>
           </div>
       </div>
       
       {teams.length === 0 && (
           <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg mb-6 flex items-center gap-3">
               <AlertCircle size={24} />
               <div>
                   <p className="font-bold">Atenção</p>
                   <p className="text-sm">Você ainda não possui times cadastrados neste painel. Crie times no menu "Admin" antes de adicionar usuários técnicos.</p>
               </div>
           </div>
       )}

       {/* --- INTERNAL USERS LIST (FIRST) --- */}
       <div className="mb-8">
           <h3 className="font-bold text-blue-800 text-sm uppercase tracking-wider mb-3 flex items-center gap-2 pb-2 border-b border-blue-100">
               <Building size={16}/> Usuários do Painel
           </h3>
           {internalUsers.length > 0 ? (
               <div className="grid grid-cols-1 gap-3">
                   {internalUsers.map(u => {
                       return (
                       <div key={u.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors shadow-sm gap-4 bg-white">
                           <div className="flex items-center gap-4 w-full">
                               {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-gray-200" /> : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-lg">{u.name.charAt(0)}</div>}
                               <div className="flex-1 min-w-0">
                                   <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                       <p className="font-bold text-gray-800 text-lg truncate">{u.name}</p>
                                   </div>
                                   <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                       <p className="text-sm text-gray-500">{u.email}</p>
                                       <span className="hidden sm:inline text-gray-300">•</span>
                                       <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${u.role === UserRole.GLOBAL ? 'bg-purple-100 text-purple-800' : u.role === UserRole.MASTER ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{u.role}</span>
                                   </div>
                                   <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                       <span className="font-mono bg-gray-100 px-1 rounded border select-all">{u.id}</span>
                                       <button onClick={() => copyToClipboard(u.id)} className="hover:text-blue-600" title="Copiar ID"><Copy size={12}/></button>
                                   </div>
                               </div>
                           </div>
                           <div className="flex gap-2 self-end md:self-center">
                               <button onClick={() => setEditingUser(u)} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg transition-colors"><Edit size={18} /></button>
                               {u.id !== currentUser?.id && (
                                   <button 
                                       onClick={() => requestDelete(u)} 
                                       className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                                       title="Excluir Usuário"
                                   >
                                       <Trash2 size={18} />
                                   </button>
                               )}
                           </div>
                       </div>
                   )})}
               </div>
           ) : <p className="text-gray-400 italic text-sm">Nenhum usuário interno.</p>}
       </div>

       {/* --- ACTIVE COLLABORATORS LIST (SECOND) --- */}
       <div className="mb-4">
           <h3 className="font-bold text-green-700 text-sm uppercase tracking-wider mb-3 flex items-center gap-2 pb-2 border-b border-green-100">
               <Briefcase size={16}/> Colaboradores Ativos
           </h3>
           {activeCollaborators.length > 0 ? (
               <div className="grid grid-cols-1 gap-3">
                   {activeCollaborators.map(u => {
                       return (
                           <div key={u.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border border-green-200 rounded-xl bg-green-50 shadow-sm gap-4">
                               <div className="flex items-center gap-4 w-full">
                                   {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-green-200" /> : <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center font-bold text-green-700 text-lg">{u.name.charAt(0)}</div>}
                                   <div className="flex-1 min-w-0">
                                       <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                           <p className="font-bold text-gray-800 text-lg truncate">{u.name}</p>
                                           <span className="text-[10px] bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded border border-green-200 truncate flex items-center gap-1">
                                               <CheckCircle size={10} /> Ativo
                                           </span>
                                       </div>
                                       <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                           <p className="text-sm text-gray-500">{u.email}</p>
                                           <span className="hidden sm:inline text-gray-300">•</span>
                                           <span className="text-xs font-bold px-2 py-0.5 rounded uppercase bg-gray-100 text-gray-700">{u.role}</span>
                                       </div>
                                       <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                           <span className="font-mono bg-white/50 px-1 rounded border border-green-200 select-all">{u.id}</span>
                                           <button onClick={() => copyToClipboard(u.id)} className="hover:text-green-600" title="Copiar ID"><Copy size={12}/></button>
                                       </div>
                                   </div>
                               </div>
                               <div className="flex gap-2 self-end md:self-center">
                                   <button 
                                       onClick={() => requestDelete(u)} 
                                       className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors flex items-center gap-1 text-sm font-bold border border-red-100"
                                       title="Remover Colaborador"
                                   >
                                       <UserX size={16} /> <span className="hidden sm:inline">Remover</span>
                                   </button>
                               </div>
                           </div>
                       );
                   })}
               </div>
           ) : <p className="text-gray-400 italic text-sm mb-6">Nenhum colaborador externo ativo.</p>}
       </div>

       {/* --- PENDING INVITES LIST (THIRD) --- */}
       {pendingInvites.length > 0 && (
           <div className="mb-4 animate-fade-in">
               <h3 className="font-bold text-yellow-700 text-sm uppercase tracking-wider mb-3 flex items-center gap-2 pb-2 border-b border-yellow-200">
                   <Mail size={16}/> Convites Enviados (Pendentes)
               </h3>
               <div className="grid grid-cols-1 gap-3">
                   {pendingInvites.map(u => {
                       return (
                           <div key={u.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border border-yellow-200 rounded-xl bg-yellow-50 shadow-sm gap-4">
                               <div className="flex items-center gap-4 w-full">
                                   {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-yellow-200 grayscale" /> : <div className="w-12 h-12 rounded-full bg-yellow-200 flex items-center justify-center font-bold text-yellow-700 text-lg">{u.name.charAt(0)}</div>}
                                   <div className="flex-1 min-w-0">
                                       <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                           <p className="font-bold text-gray-700 text-lg truncate">{u.name}</p>
                                           <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded border border-yellow-300 flex items-center gap-1 animate-pulse">
                                               <Clock size={10} /> Aguardando Aceite
                                           </span>
                                       </div>
                                       <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                           <p className="text-sm text-gray-500">{u.email}</p>
                                           <span className="hidden sm:inline text-gray-300">•</span>
                                           <span className="text-xs font-bold px-2 py-0.5 rounded uppercase bg-white text-gray-500 border border-gray-200">{u.role}</span>
                                       </div>
                                   </div>
                               </div>
                               <div className="flex gap-2 self-end md:self-center">
                                   <button 
                                       onClick={() => requestDelete(u)} 
                                       className="text-red-500 bg-white border border-red-200 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center gap-1 text-sm font-bold"
                                       title="Cancelar Convite"
                                   >
                                       <X size={16} /> <span className="hidden sm:inline">Cancelar</span>
                                   </button>
                               </div>
                           </div>
                       );
                   })}
               </div>
           </div>
       )}

       {/* --- EDIT USER FORM --- */}
       {editingUser && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
               <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-8">
                   <h3 className="font-bold mb-6 text-xl text-gray-800 pb-2 flex justify-between items-center border-b border-gray-100">
                       {editingUser.id ? 'Editar Usuário' : 'Novo Usuário'}
                       <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
                   </h3>
                   
                   <div className="grid grid-cols-1 gap-4">
                       {/* Form Fields ... */}
                       <div className="flex items-center gap-4 mb-2 p-4 bg-gray-50 rounded-lg">
                            {editingUser.avatarUrl ? (
                                <img src={editingUser.avatarUrl} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
                            ) : <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-400">?</div>}
                            <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors shadow-sm">
                                Alterar Foto
                                <input type="file" onChange={handleAvatarUpload} className="hidden" />
                            </label>
                       </div>
                       
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Nome</label>
                           <input 
                              className={inputClass}
                              value={editingUser.name || ''} 
                              onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                           />
                       </div>
                       
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                           <input 
                              className={inputClass}
                              value={editingUser.email || ''} 
                              onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                           />
                       </div>
                       
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Função</label>
                           <select 
                              className={`${inputClass} font-semibold`}
                              value={editingUser.role} 
                              onChange={e => handleRoleChange(e.target.value as UserRole)}
                           >
                               {Object.values(UserRole).map(role => (
                                   (role === UserRole.GLOBAL && currentUser?.role !== UserRole.GLOBAL) ? null :
                                   (role === UserRole.MASTER && currentUser?.role !== UserRole.GLOBAL) ? null :
                                   <option key={role} value={role}>{role}</option>
                               ))}
                           </select>
                       </div>
                       
                       <div>
                           <label className="block text-sm font-bold text-gray-700 mb-1">Senha {editingUser.id && '(Deixe em branco para manter)'}</label>
                           <input 
                              type="password"
                              placeholder="******" 
                              className={inputClass}
                              value={editingUser.password || ''} 
                              onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                           />
                       </div>
                   </div>

                   {/* Permissions Section */}
                   {editingUser.role !== UserRole.MASTER && editingUser.role !== UserRole.GLOBAL && (
                       <div className="mt-6 border-t border-gray-100 pt-4">
                          <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                              <Lock size={16} className="text-gray-500"/> Selecionar Times Permitidos
                          </label>
                          <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                              {teams.map(team => {
                                  const isSelected = editingUser.teamIds?.includes(team.id);
                                  return (
                                      <div key={team.id} 
                                           onClick={() => toggleTeamSelection(team.id)}
                                           className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-blue-50 border-blue-300 shadow-sm' : 'hover:bg-gray-50 border-gray-200'}`}
                                      >
                                          {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-gray-300" />}
                                          <span className={`text-xs ${isSelected ? 'font-bold text-blue-900' : 'text-gray-600'}`}>{team.name}</span>
                                      </div>
                                  );
                              })}
                          </div>
                       </div>
                   )}

                   {error && <div className="mt-4 bg-red-100 text-red-700 p-3 rounded-lg flex items-center gap-2 text-sm font-bold animate-pulse"><AlertCircle size={18} /> {error}</div>}

                   <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                       <button onClick={() => setEditingUser(null)} disabled={saving} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors disabled:opacity-50">Cancelar</button>
                       <button onClick={handleSave} disabled={saving} className="flex-[2] bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                           {saving && <Loader2 className="animate-spin" size={18} />}
                           Salvar Usuário
                       </button>
                   </div>
               </div>
           </div>
       )}

       {/* --- INVITE BY ID MODAL --- */}
       {inviteByIdModal && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-800">Convidar por ID</h3>
                        <button onClick={() => setInviteByIdModal(false)}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                        Insira o ID do usuário que deseja convidar para colaborar em seus times.
                    </p>
                    
                    <div className="mb-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                className={`w-full border rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${guestIdError ? 'border-red-500' : 'border-gray-300'}`}
                                placeholder="Cole o ID aqui..."
                                value={guestIdInput}
                                onChange={(e) => setGuestIdInput(e.target.value)}
                            />
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                        {guestIdError && <p className="text-xs text-red-500 mt-1 font-bold">{guestIdError}</p>}
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setInviteByIdModal(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button 
                            onClick={handleSearchGuestById} 
                            disabled={searchingId}
                            className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {searchingId && <Loader2 className="animate-spin" size={16} />}
                            Buscar & Convidar
                        </button>
                    </div>
                </div>
           </div>
       )}

       {/* --- CONFIRM INVITE MODAL (TEAM SELECTION) --- */}
       {inviteModal.isOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Mail className="text-blue-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-1">Confirmar Convite</h3>
                 <p className="text-gray-600 text-sm mb-4 font-bold">{inviteModal.user?.name}</p>
                 
                 <div className="text-left mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                     <label className="block text-xs font-bold text-gray-700 mb-2">Selecione os Times para Acesso:</label>
                     <div className="max-h-40 overflow-y-auto space-y-2">
                         {teams.map(team => {
                             // Check if user already has this team (active or pending)
                             const alreadyHas = inviteModal.user?.teamIds?.some(tid => tid === team.id || tid === `pending:${team.id}`);
                             if (alreadyHas) return null; // Don't show teams they already have

                             const isSelected = inviteSelectedTeams.includes(team.id);
                             return (
                                 <div key={team.id} 
                                      onClick={() => toggleInviteTeamSelection(team.id)}
                                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-200'}`}
                                 >
                                     {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-gray-300" />}
                                     <span className={`text-xs ${isSelected ? 'font-bold text-blue-900' : 'text-gray-600'}`}>{team.name}</span>
                                 </div>
                             );
                         })}
                         {teams.every(t => inviteModal.user?.teamIds?.some(tid => tid === t.id || tid === `pending:${t.id}`)) && (
                             <p className="text-xs text-gray-400 italic">Usuário já possui acesso a todos os times.</p>
                         )}
                     </div>
                 </div>
                 
                 <div className="mb-6 text-left">
                     <label className="block text-xs font-bold text-gray-700 mb-1">Selecione a Função no Painel</label>
                     <select 
                        className={inputClass}
                        value={inviteRole} 
                        onChange={e => setInviteRole(e.target.value as UserRole)}
                     >
                         <option value={UserRole.TECNICO}>Técnico</option>
                         <option value={UserRole.AUXILIAR}>Auxiliar</option>
                         <option value={UserRole.SCOUT}>Scout</option>
                         <option value={UserRole.PREPARADOR}>Preparador Físico</option>
                         <option value={UserRole.MASSAGISTA}>Massagista</option>
                     </select>
                 </div>

                 <div className="flex gap-3">
                     <button onClick={() => setInviteModal({isOpen: false, user: null, newTeams: []})} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={handleInviteConfirmWithSelection} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700">Enviar Convite</button>
                 </div>
             </div>
         </div>
       )}

       {successMessage && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm w-full">
               <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="text-green-600" size={32} />
               </div>
               <h3 className="text-xl font-bold text-gray-800 mb-2">Sucesso!</h3>
               <p className="text-gray-500 text-center mb-6">{successMessage}</p>
               <button onClick={() => setSuccessMessage(null)} className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 transition-colors w-full">
                   OK
               </button>
            </div>
         </div>
       )}

       {deleteConfirmation && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${deleteConfirmation.isGuestMaster ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                     {deleteConfirmation.isGuestMaster ? <UserMinus size={32} /> : <Trash2 size={32} />}
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">{deleteConfirmation.isGuestMaster ? 'Remover Colaborador?' : 'Excluir Usuário?'}</h3>
                 <p className="text-gray-500 mb-6">
                     {deleteConfirmation.isGuestMaster 
                        ? "O usuário perderá acesso aos times deste painel, mas a conta dele continuará existindo."
                        : "Esta ação não pode ser desfeita. Tem certeza?"}
                 </p>
                 <div className="flex gap-3">
                     <button onClick={() => setDeleteConfirmation(null)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={confirmDelete} className={`flex-1 text-white font-bold py-2 rounded-lg ${deleteConfirmation.isGuestMaster ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'}`}>
                         {deleteConfirmation.isGuestMaster ? 'Remover' : 'Excluir'}
                     </button>
                 </div>
             </div>
         </div>
       )}

    </div>
  );
};

export default UserManagement;