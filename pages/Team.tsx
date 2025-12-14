import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirm } from '../contexts/ConfirmationContext'; 
import { UserRole, User } from '../types';
import { Trash2, UserPlus, Shield, Users, Plus, Edit, X, Mail, Briefcase, Check, Bell, Ban, CheckCircle2, AlertTriangle, UserMinus, Copy, LogOut, Clock, ExternalLink } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export const Team: React.FC = () => {
  const { users, teams, inviteUser, cancelInvite, removeUserFromTeam, leaveTeam, respondToInvite, deleteTeam, addTeam, user: currentUser, getTeamName, currentTeamView } = useAuth();
  const { showNotification } = useNotification();
  const { requestConfirmation } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [newUser, setNewUser] = useState({
      name: '', 
      email: '',
      role: UserRole.EDITOR, // Default role as generic member
      teamIds: ['all'] as string[]
  });

  const [newTeamName, setNewTeamName] = useState('');

  // Modal State for New User Link
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');

  const isMaster = currentUser?.role === UserRole.MASTER;

  // Filter owned teams for the "Equipes Cadastradas" list
  const myOwnedTeams = teams.filter(t => t.ownerId === currentUser?.id);

  // --- AUTO REDIRECT TO EDIT PROFILE ---
  useEffect(() => {
      const action = searchParams.get('action');
      if (action === 'edit-profile' && currentUser) {
          // Redirect to the new Edit Page
          navigate(`/team/edit/${currentUser.id}`);
      }
  }, [searchParams, currentUser, navigate]);

  // --- FILTRAGEM E ORDENAÇÃO DE USUÁRIOS ---
  const sortedUsers = useMemo(() => {
      let filtered = users;

      // 1. Filtragem por View
      if (currentTeamView !== 'all') {
          filtered = users.filter(u => {
              const isActiveMember = u.teamIds.includes(currentTeamView) || u.teamIds.includes('all');
              const hasPendingInvite = u.pendingInvites?.some(inv => inv.teamId === currentTeamView);
              return isActiveMember || hasPendingInvite;
          });
      }

      // 2. Ordenação: Master (Eu) Primeiro -> Alfabética
      return filtered.sort((a, b) => {
          if (a.id === currentUser?.id) return -1;
          if (b.id === currentUser?.id) return 1;
          return a.name.localeCompare(b.name);
      });
  }, [users, currentTeamView, currentUser]);

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      let targetTeamIds = newUser.teamIds;
      
      try {
          const result = await inviteUser(newUser, targetTeamIds);
          
          if (result.status === 'new') {
              const link = `https://aprovpost.vercel.app/#/login?email=${encodeURIComponent(result.email)}&action=register`;
              setGeneratedLink(link);
              setInvitedEmail(result.email);
              setShowLinkModal(true);
          } else {
              showNotification('success', 'Convite Enviado', `O usuário ${newUser.email} já possui conta. O convite foi enviado para o painel dele.`);
          }
          
          setNewUser({ name: '', email: '', role: UserRole.EDITOR, teamIds: ['all'] });
      } catch (error) {
          showNotification('error', 'Erro no Convite', 'Não foi possível processar o convite. Tente novamente.');
      }
  };

  const handleCancelInvite = (e: React.MouseEvent, email: string, teamId: string) => {
      e.preventDefault();
      e.stopPropagation();
      requestConfirmation({
          title: "Cancelar Convite",
          message: `Deseja realmente cancelar o convite pendente para ${email}?`,
          onConfirm: async () => {
              await cancelInvite(email, teamId);
              showNotification('info', 'Convite Cancelado', `O convite para ${email} foi removido.`);
          },
          type: 'warning',
          confirmLabel: 'Cancelar Convite'
      });
  };

  const handleRemoveUserFromTeam = (e: React.MouseEvent, userId: string, userName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const targetScope = currentTeamView === 'all' ? 'all' : currentTeamView;
      const scopeName = currentTeamView === 'all' ? 'toda a organização' : `equipe ${getTeamName(targetScope)}`;

      requestConfirmation({
          title: "Remover Acesso",
          message: `Deseja remover o acesso de ${userName} de ${scopeName}?`,
          onConfirm: async () => {
              await removeUserFromTeam(userId, targetScope);
              showNotification('warning', 'Acesso Removido', `${userName} foi removido com sucesso.`);
          },
          type: 'danger',
          confirmLabel: 'Remover Acesso'
      });
  };
  
  const handleLeaveTeam = (e: React.MouseEvent, teamId: string, teamName: string) => {
      e.preventDefault();
      e.stopPropagation();
      requestConfirmation({
          title: "Sair da Equipe",
          message: `Tem certeza que deseja sair da equipe "${teamName}"? Você perderá o acesso aos conteúdos.`,
          onConfirm: async () => {
              await leaveTeam(teamId);
              showNotification('info', 'Saiu da Equipe', `Você deixou a equipe ${teamName}.`);
          },
          type: 'warning',
          confirmLabel: 'Sair da Equipe'
      });
  };

  const handleDeleteTeam = (id: string, name: string) => {
      requestConfirmation({
          title: "Excluir Equipe",
          message: `Tem certeza que deseja excluir a equipe "${name}"? Esta ação não pode ser desfeita e removerá os membros associados a ela.`,
          onConfirm: async () => {
              await deleteTeam(id);
              showNotification('info', 'Equipe Excluída', `Equipe ${name} removida.`);
          },
          type: 'danger',
          confirmLabel: 'Excluir Permanentemente'
      });
  };

  const handleAddTeam = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTeamName.trim()) return;
      addTeam(newTeamName);
      setNewTeamName('');
      showNotification('success', 'Equipe Criada', `A equipe "${newTeamName}" foi adicionada.`);
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      showNotification('success', 'Link Copiado!', 'Link de convite copiado para a área de transferência.');
  };

  const toggleTeamSelection = (targetUser: typeof newUser | User, teamId: string) => {
      let currentTeams = targetUser.teamIds || [];
      let newTeams: string[] = [];

      if (teamId === 'all') {
          if (currentTeams.includes('all')) {
              newTeams = [];
          } else {
              newTeams = ['all'];
          }
      } else {
          if (currentTeams.includes('all')) {
              newTeams = [teamId];
          } else {
              if (currentTeams.includes(teamId)) {
                  newTeams = currentTeams.filter(id => id !== teamId);
              } else {
                  newTeams = [...currentTeams, teamId];
              }
          }
      }
      setNewUser({ ...newUser, teamIds: newTeams });
  };

  const renderTeamSelector = (target: typeof newUser | User) => {
      const currentIds = target.teamIds || [];
      const isAll = currentIds.includes('all');

      return (
          <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-100 rounded-xl p-2 bg-white shadow-inner [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
              <div 
                onClick={() => toggleTeamSelection(target, 'all')}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isAll ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50'}`}
              >
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${isAll ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                      <Check size={14} strokeWidth={3} />
                  </div>
                  <span className={`text-sm font-bold ${isAll ? 'text-indigo-900' : 'text-gray-600'}`}>🌐 Acesso Global (Todas)</span>
              </div>
              
              {teams.map(team => {
                  const isSelected = currentIds.includes(team.id);
                  const isDisabled = isAll; 
                  return (
                    <div 
                        key={team.id}
                        onClick={() => !isDisabled && toggleTeamSelection(target, team.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all border ${isDisabled ? 'opacity-40 cursor-not-allowed border-transparent' : 'cursor-pointer'} ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50'}`}
                    >
                         <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                            <Check size={14} strokeWidth={3} />
                        </div>
                        <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-600'}`}>{team.name}</span>
                    </div>
                  );
              })}
          </div>
      );
  };

  const pendingInvites = currentUser?.pendingInvites || [];
  const myJoinedTeams = teams.filter(t => 
      currentUser?.teamIds.includes(t.id) && t.ownerId !== currentUser?.id
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-10 relative">
        {/* Left Column: Users List */}
        <div className="xl:col-span-2 space-y-8 flex flex-col">
            
            {/* ORDER 0: PENDING INVITES */}
            {pendingInvites.length > 0 && (
                <div className="order-0">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Bell className="text-orange-500 animate-pulse" /> Convites Pendentes
                    </h2>
                    <div className="bg-white rounded-xl shadow-lg border border-orange-200 overflow-hidden">
                        <div className="bg-orange-50 p-4 text-orange-800 text-sm font-medium border-b border-orange-100">
                            Você foi convidado para colaborar nas seguintes equipes:
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {pendingInvites.map((invite, index) => (
                                <li key={index} className="p-6 flex items-center justify-between hover:bg-orange-50/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-orange-100 p-3 rounded-full text-orange-600">
                                            <Briefcase size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-lg">{invite.teamName}</h4>
                                            <p className="text-sm text-gray-500">Convidado por <span className="font-semibold text-gray-700">{invite.inviterName}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button 
                                            type="button"
                                            onClick={() => respondToInvite(invite.teamId, false)}
                                            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-bold text-sm flex items-center gap-2 transition-colors"
                                        >
                                            <Ban size={16} /> Recusar
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => respondToInvite(invite.teamId, true)}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-sm flex items-center gap-2 shadow-sm transition-colors"
                                        >
                                            <CheckCircle2 size={16} /> Aceitar
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            
            {/* ORDER 1: Users Management - Only visible if MASTER */}
            <div className="order-1">
                <div className="flex flex-col-reverse md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0 mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Shield className="text-indigo-600" /> Membros da Equipe
                        {currentTeamView !== 'all' && <span className="text-sm font-normal text-gray-500 ml-2">({getTeamName(currentTeamView)})</span>}
                    </h2>
                    {/* Atalho para editar o próprio perfil */}
                    {currentUser && (
                        <button 
                            onClick={() => navigate(`/team/edit/${currentUser.id}`)}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-bold underline self-end md:self-auto"
                        >
                            Meu Perfil & API Key
                        </button>
                    )}
                </div>

                {isMaster && (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        
                        {/* 1. Header Fixo (Somente Desktop) - GRADE SIMPLIFICADA */}
                        <div className="hidden xl:grid grid-cols-12 gap-4 bg-gray-50/50 p-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 items-center">
                            <div className="col-span-6 text-left">Nome</div>
                            <div className="col-span-2 text-left">Status</div>
                            <div className="col-span-3 text-left">Acesso Liberado</div>
                            <div className="col-span-1 text-right">Ações</div>
                        </div>

                        <div className="divide-y divide-gray-100 bg-white">
                            {sortedUsers.length === 0 && (
                                <div className="p-8 text-center text-gray-400 italic">
                                    Nenhum membro encontrado nesta visualização.
                                </div>
                            )}
                            {sortedUsers.map(u => {
                                const pendingInvite = u.pendingInvites?.find(inv => teams.some(t => t.id === inv.teamId));
                                const isPending = !!pendingInvite;
                                const isPlaceholder = u.isPlaceholder;
                                const myOwnedTeamIds = teams.filter(t => t.ownerId === currentUser?.id).map(t => t.id);
                                const isActive = u.teamIds.some(tid => myOwnedTeamIds.includes(tid));
                                const isMyUser = u.ownerId === currentUser?.id;
                                const isExternal = !isMyUser;
                                const isMe = u.id === currentUser?.id;

                                return (
                                    <div key={u.id} className={`p-4 px-6 xl:grid xl:grid-cols-12 xl:items-center xl:gap-4 transition-colors group ${isPlaceholder ? 'bg-red-50/30' : 'hover:bg-indigo-50/50'} ${isMe ? 'bg-indigo-50/30' : ''}`}>
                                        
                                        {/* COL 1: Nome (6 colunas) */}
                                        <div className="col-span-6 flex items-center gap-3 mb-3 xl:mb-0">
                                            {u.photoUrl ? (
                                                <img src={u.photoUrl} alt={u.name} className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm flex-shrink-0" />
                                            ) : (
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0 ${isPlaceholder ? 'bg-gray-300 text-gray-600' : 'bg-indigo-100 text-indigo-700'}`}>
                                                    {u.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="overflow-hidden">
                                                <div className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                                                    {u.name}
                                                    {isMe && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full uppercase tracking-wide border border-indigo-600 whitespace-nowrap shadow-sm">
                                                            Você (Master)
                                                        </span>
                                                    )}
                                                    {isPlaceholder && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full uppercase tracking-wide border border-red-200 whitespace-nowrap">
                                                            <AlertTriangle size={10} /> Pendente
                                                        </span>
                                                    )}
                                                    {isExternal && isActive && !isPlaceholder && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full uppercase tracking-wide border border-blue-200 whitespace-nowrap" title="Usuário Externo (Convidado)">
                                                            <ExternalLink size={10} /> Convidado
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                            </div>
                                        </div>

                                        {/* COL 2: Status (2 colunas) */}
                                        <div className="col-span-2 flex items-center xl:justify-start mb-2 xl:mb-0">
                                            {isPending && !isActive ? (
                                                <span className="px-3 py-1 inline-flex items-center gap-1.5 text-xs font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                                                    <Clock size={12} /> Aguardando
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 inline-flex items-center gap-1.5 text-xs font-bold rounded-full bg-green-100 text-green-700 border border-green-200">
                                                    <CheckCircle2 size={12} /> Ativo
                                                </span>
                                            )}
                                        </div>

                                        {/* COL 3: Acesso (3 colunas) */}
                                        <div className="col-span-3 flex items-center flex-wrap gap-1 mb-2 xl:mb-0">
                                            {u.teamIds.includes('all') && isMyUser ? (
                                                <span className="px-2 py-1 inline-flex text-xs font-bold rounded bg-gray-100 text-gray-600 border border-gray-200">
                                                    Global
                                                </span>
                                            ) : (
                                                u.teamIds.map(tid => {
                                                    // Filtra para exibir APENAS as equipes que pertencem à organização atual
                                                    const team = teams.find(t => t.id === tid && t.ownerId === currentUser?.id);
                                                    if (!team) return null;
                                                    return (
                                                        <span key={tid} className="px-2 py-0.5 inline-flex text-[10px] font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-100 truncate max-w-[120px]">
                                                            {team.name}
                                                        </span>
                                                    )
                                                })
                                            )}
                                            {isPending && u.pendingInvites?.map(inv => {
                                                if (!teams.some(t => t.id === inv.teamId && t.ownerId === currentUser?.id)) return null;
                                                return (
                                                    <span key={inv.teamId} className="px-2 py-0.5 inline-flex text-[10px] font-bold rounded bg-orange-50 text-orange-700 border border-orange-200 dashed truncate max-w-[120px]">
                                                        {inv.teamName} (Convite)
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* COL 5: Ações (1 coluna) */}
                                        <div className="col-span-1 flex justify-end gap-2">
                                            {(isPending || isPlaceholder) && (
                                                <button 
                                                    type="button"
                                                    onClick={(e) => pendingInvite ? handleCancelInvite(e, u.email, pendingInvite.teamId) : handleCancelInvite(e, u.email, u.pendingInvites?.[0]?.teamId || '')}
                                                    className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-all border border-red-100"
                                                    title="Cancelar Convite"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}

                                            {!isPending && !isPlaceholder && u.id !== currentUser?.id && (
                                                <button 
                                                    type="button"
                                                    onClick={(e) => handleRemoveUserFromTeam(e, u.id, u.name)}
                                                    className="p-1.5 text-orange-500 bg-orange-50 hover:bg-orange-100 rounded-lg transition-all border border-orange-100"
                                                    title="Remover Acesso"
                                                >
                                                    <UserMinus size={16} />
                                                </button>
                                            )}

                                            {(isMyUser || (isMaster && isExternal && !isPlaceholder)) && (
                                                <button 
                                                    type="button"
                                                    onClick={() => navigate(`/team/edit/${u.id}`)}
                                                    className="p-1.5 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all border border-indigo-100"
                                                    title="Editar Usuário / Acessos"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ORDER 2: Teams Management */}
            {isMaster && (
                <div className="order-2">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Users className="text-indigo-600" /> Equipes Cadastradas
                    </h2>
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        <div className="p-6 bg-gray-50/50 border-b border-gray-100">
                            <form onSubmit={handleAddTeam} className="flex gap-3 items-end">
                                <div className="relative group flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Nome da Nova Equipe</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input 
                                            type="text" 
                                            placeholder="Ex: Marketing, Vendas..."
                                            value={newTeamName}
                                            onChange={e => setNewTeamName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                        />
                                    </div>
                                </div>
                                <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all transform active:scale-95 mb-[1px]">
                                    <Plus size={18} /> Criar
                                </button>
                            </form>
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {myOwnedTeams.length === 0 && <li className="p-6 text-gray-400 text-sm text-center italic">Nenhuma equipe cadastrada.</li>}
                            {myOwnedTeams.map(team => (
                                <li key={team.id} className="p-4 px-6 flex justify-between items-center hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                            <Briefcase size={16} />
                                        </div>
                                        <span className="font-bold text-gray-700">{team.name}</span>
                                    </div>
                                    {/* Only show delete button for owned teams (which all here should be) */}
                                    {team.ownerId === currentUser?.id && (
                                        <button onClick={() => handleDeleteTeam(team.id, team.name)} className="text-gray-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg" title="Excluir Equipe">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* ORDER 3: Joined Teams (Visible to all who have joined teams) - RENAMED TO EQUIPES PARCEIRAS */}
            {myJoinedTeams.length > 0 && (
                <div className="order-3">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Briefcase className="text-indigo-600" /> Equipes Parceiras
                    </h2>
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                         <div className="p-4 bg-indigo-50 border-b border-indigo-100 text-indigo-800 text-sm font-medium">
                            Equipes onde você atua como convidado
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {myJoinedTeams.map(team => (
                                <li key={team.id} className="p-4 px-6 flex justify-between items-center hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                            <Users size={18} />
                                        </div>
                                        <div>
                                            <span className="font-bold text-gray-800 block">{team.name}</span>
                                            <span className="text-xs text-gray-500">Convidado</span>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={(e) => handleLeaveTeam(e, team.id, team.name)} 
                                        className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg flex items-center gap-2" 
                                        title="Sair da Equipe"
                                    >
                                        <LogOut size={16} /> <span className="text-xs font-bold">Sair</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>

        {/* Right Column: Invite Form */}
        {isMaster && (
            <div>
                <div className="sticky top-24">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">Convidar Usuário</h2>
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-900 to-indigo-900 p-6 text-white">
                            <p className="text-sm text-indigo-200 mb-1 font-bold uppercase tracking-wider">Novo Acesso</p>
                            <h3 className="text-lg font-bold">Cadastro de Membro</h3>
                        </div>
                        
                        <form onSubmit={handleAddUser} className="p-6 space-y-5">
                            <div className="relative group">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">E-mail Profissional</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                    <input 
                                        required
                                        type="email" 
                                        placeholder="joao@empresa.com"
                                        value={newUser.email}
                                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="relative group">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Permissão de Acesso</label>
                                <div className="relative">
                                    <Briefcase className="absolute left-3 top-3.5 text-gray-400 z-10" size={18} />
                                    <div className="pl-10">
                                        {renderTeamSelector(newUser)}
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform active:scale-95 flex justify-center items-center gap-2 mt-2">
                                <UserPlus size={18} /> Enviar Convite
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        )}

        {/* CUSTOM POPUP FOR INVITE LINK */}
        {showLinkModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/80 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform scale-100 border border-white/20 relative">
                    <button 
                        onClick={() => setShowLinkModal(false)}
                        className="absolute top-4 right-4 text-white/50 hover:text-white z-10 transition-colors"
                    >
                        <X size={24} />
                    </button>

                    <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-8 text-center">
                        <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                            <AlertTriangle className="text-white" size={32} />
                        </div>
                        <h3 className="text-2xl font-black text-white">Usuário Não Encontrado</h3>
                        <p className="text-orange-50 text-sm mt-2 font-medium px-8 leading-relaxed">
                            O e-mail <strong>{invitedEmail}</strong> ainda não possui cadastro no sistema.
                            <br/>Envie o link abaixo para que ele crie a conta e aceite o convite.
                        </p>
                    </div>
                    
                    <div className="p-8">
                        <div className="relative">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Link de Cadastro Exclusivo</label>
                             <div className="flex gap-2">
                                 <input 
                                     readOnly
                                     type="text" 
                                     value={generatedLink}
                                     className="w-full pl-4 pr-4 py-3 border border-gray-200 bg-gray-50 rounded-xl text-gray-600 text-sm outline-none font-medium"
                                 />
                                 <button 
                                     onClick={() => copyToClipboard(generatedLink)}
                                     className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center shadow-lg shadow-indigo-200"
                                     title="Copiar para área de transferência"
                                 >
                                     <Copy size={20} />
                                 </button>
                             </div>
                        </div>

                        <div className="mt-8 flex justify-center">
                            <button 
                                onClick={() => setShowLinkModal(false)}
                                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Entendido, Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};