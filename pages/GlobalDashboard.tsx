
import React, { useEffect, useState } from 'react';
import { 
  getUsers, saveUser, deleteUser, 
  getTeams, saveTeam, deleteTeam,
  getCategories, saveCategory, deleteCategory,
  getAthletes, saveAthlete,
  getTrainingSessions, saveTrainingSession
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { User, UserRole, Team, normalizeCategoryName } from '../types';
import { Loader2, ShieldCheck, Search, ExternalLink, Calendar, Mail, LayoutDashboard, UserPlus, Trash2, X, Globe, Save, Edit, AlertTriangle, Upload, User as UserIcon, ArrowRightLeft, CheckCircle, Shirt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

interface GlobalDashboardProps {
  onAccessMaster: (masterId: string) => void;
  onLogout: () => void;
}

const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ onAccessMaster, onLogout }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({ name: '', email: '', password: '', role: UserRole.GLOBAL });
  const [modalError, setModalError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, userId: string | null, userName: string }>({ isOpen: false, userId: null, userName: '' });
  
  const [userTeamsCount, setUserTeamsCount] = useState(0);
  const [wantToMigrate, setWantToMigrate] = useState(false);
  const [targetTeamIdInput, setTargetTeamIdInput] = useState('');
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
       setLoading(true);
       try {
           const storedUserStr = localStorage.getItem('performax_current_user');
           if (storedUserStr) setCurrentUser(JSON.parse(storedUserStr));

           const all = await getUsers();
           // Filtro ultra-resiliente para MASTER e GLOBAL
           const filtered = all.filter(u => {
               const r = (u.role || '').toString().toUpperCase().trim();
               return r === 'MASTER' || r === 'GLOBAL';
           });
           setUsers(filtered);
       } catch (err) {
           console.error("Erro ao carregar dados globais:", err);
       } finally {
           setLoading(false);
       }
  };

  const openCreateModal = () => {
      setEditData({ name: '', email: '', password: '', role: UserRole.GLOBAL, avatarUrl: '' });
      setModalError('');
      setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
      setEditData({ ...user });
      setModalError('');
      setIsModalOpen(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setUploading(true);
          try {
              e.target.value = '';
              const url = await processImageUpload(file);
              setEditData(prev => ({ ...prev, avatarUrl: url }));
          } catch (err) {
              console.error(err);
              setModalError('Erro no upload da imagem.');
          } finally {
              setUploading(false);
          }
      }
  };

  const handleSaveGlobal = async (e: React.FormEvent) => {
      e.preventDefault();
      setModalError('');
      
      if (!editData.name || !editData.email) {
          setModalError('Preencha nome e email.');
          return;
      }
      
      if (!editData.id && !editData.password) {
          setModalError('Senha é obrigatória para novos usuários.');
          return;
      }

      const userToSave: User = {
          id: editData.id || uuidv4(),
          name: editData.name,
          email: editData.email,
          password: editData.password || undefined,
          role: UserRole.GLOBAL,
          avatarUrl: editData.avatarUrl || '',
          teamIds: editData.teamIds || []
      };
      
      if (editData.id && !editData.password) {
          const existing = users.find(u => u.id === editData.id);
          if (existing) userToSave.password = existing.password;
      }

      const { error } = await saveUser(userToSave);
      if (error) {
          if (error.code === '23505') {
              setModalError('Email já cadastrado.');
          } else {
              setModalError('Erro ao salvar usuário.');
          }
      } else {
          setIsModalOpen(false);
          loadData();
      }
  };

  const requestDelete = async (user: User) => {
      const allTeams = await getTeams();
      const count = allTeams.filter(t => t.ownerId === user.id).length;
      
      setUserTeamsCount(count);
      setWantToMigrate(false);
      setTargetTeamIdInput('');
      setDeleteConfirm({ isOpen: true, userId: user.id, userName: user.name });
  };

  const handleMigrationAndCleanup = async () => {
      if (!deleteConfirm.userId) return;
      setIsProcessingDelete(true);

      try {
          const userIdToDelete = deleteConfirm.userId;
          const allTeams = await getTeams();
          const userTeams = allTeams.filter(t => t.ownerId === userIdToDelete);
          const userTeamIds = userTeams.map(t => t.id);

          if (userTeamsCount > 0) {
              if (wantToMigrate) {
                  if (!targetTeamIdInput) {
                      alert("Por favor, insira o ID do Time de Destino.");
                      setIsProcessingDelete(false);
                      return;
                  }

                  const targetTeam = allTeams.find(t => t.id === targetTeamIdInput);
                  if (!targetTeam) {
                      alert("Time de destino não encontrado. Verifique o ID.");
                      setIsProcessingDelete(false);
                      return;
                  }

                  const [allCats, allAthletes, allSessions] = await Promise.all([
                      getCategories(),
                      getAthletes(),
                      getTrainingSessions()
                  ]);

                  const destCategories = allCats.filter(c => c.teamId === targetTeamIdInput);
                  const catsToMove = allCats.filter(c => userTeamIds.includes(c.teamId));
                  
                  for (const cat of catsToMove) {
                      const normalizedOld = normalizeCategoryName(cat.name);
                      const existingDestCat = destCategories.find(dc => normalizeCategoryName(dc.name) === normalizedOld);

                      if (existingDestCat) {
                          const relatedAthletes = allAthletes.filter(a => a.categoryId === cat.id);
                          for (const ath of relatedAthletes) {
                              await saveAthlete({ ...ath, categoryId: existingDestCat.id, teamId: targetTeamIdInput, pendingTransferTeamId: undefined });
                          }
                          const relatedSessions = allSessions.filter(s => s.categoryId === cat.id);
                          for (const ses of relatedSessions) {
                              await saveTrainingSession({ ...ses, categoryId: existingDestCat.id, teamId: targetTeamIdInput });
                          }
                          await deleteCategory(cat.id);
                      } else {
                          await saveCategory({ ...cat, name: normalizedOld, teamId: targetTeamIdInput });
                      }
                  }

                  const athletesToMove = allAthletes.filter(a => userTeamIds.includes(a.teamId));
                  for (const item of athletesToMove) {
                      await saveAthlete({ ...item, teamId: targetTeamIdInput, pendingTransferTeamId: undefined });
                  }

                  const sessionsToMove = allSessions.filter(s => userTeamIds.includes(s.teamId));
                  for (const item of sessionsToMove) {
                      await saveTrainingSession({ ...item, teamId: targetTeamIdInput });
                  }
              }
              
              for (const team of userTeams) {
                  await deleteTeam(team.id);
              }
          }

          await deleteUser(userIdToDelete);
          setDeleteConfirm({ isOpen: false, userId: null, userName: '' });
          loadData();
      } catch (error) {
          console.error("Erro ao processar exclusão/migração", error);
          alert("Ocorreu um erro durante o processo.");
      } finally {
          setIsProcessingDelete(false);
      }
  };

  const formatDate = (isoString?: string) => {
      if (!isoString) return 'Data não disponível';
      return new Date(isoString).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });
  };

  const globalAdmins = users.filter(u => (u.role || '').toString().toUpperCase() === 'GLOBAL');
  
  const masterTenants = users.filter(u => {
      const isMaster = (u.role || '').toString().toUpperCase() === 'MASTER';
      if (!isMaster) return false;
      
      const searchLower = search.toLowerCase();
      return (
          (u.name || '').toLowerCase().includes(searchLower) || 
          (u.email || '').toLowerCase().includes(searchLower) ||
          (u.id || '').includes(search)
      );
  });

  if (loading) return <div className="h-screen flex items-center justify-center bg-darkBase text-white"><Loader2 className="animate-spin mr-2"/> Carregando Global...</div>;

  return (
    <div className="min-h-screen bg-darkBase text-gray-100 font-sans pb-20 transition-colors">
        <div className="bg-darkCard border-b border-darkBorder p-6 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4 transition-colors">
            <div className="flex items-center gap-3">
                 <Globe className="text-purple-500" size={32} />
                 <div>
                     <h1 className="text-2xl font-black tracking-tight text-white uppercase tracking-tighter leading-none">Painel Global</h1>
                     <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Super Administração de Tenants</p>
                 </div>
            </div>
            <div className="flex items-center gap-4">
                 {currentUser && (
                     <button 
                        onClick={() => onAccessMaster(currentUser.id)} 
                        className="bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-900/20 border-b-4 border-purple-800"
                     >
                        <LayoutDashboard size={16} />
                        Acessar Meu Painel
                     </button>
                 )}
                 <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl transition border-b-4 border-red-800">
                    Sair
                 </button>
            </div>
        </div>

        <div className="max-w-7xl mx-auto p-8 space-y-8">
            
            {currentUser && (
                <div className="bg-gradient-to-r from-indigo-900 to-darkCard rounded-[32px] border border-darkBorder p-8 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-6">
                         {currentUser.avatarUrl ? (
                            <img src={currentUser.avatarUrl} className="w-20 h-20 rounded-full border-4 border-white/10 shadow-md object-cover" />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-3xl font-black text-white border-4 border-white/10 shadow-md uppercase">
                                {currentUser.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Olá, {currentUser.name}</h2>
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">{currentUser.email}</p>
                            <span className="text-[9px] bg-indigo-800/50 text-indigo-100 px-3 py-1 rounded-full border border-indigo-600 mt-2 inline-block font-black uppercase tracking-widest">
                                Global Session ID: {currentUser.id.substring(0,16)}...
                            </span>
                        </div>
                    </div>
                    <div className="hidden md:block text-right">
                         <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-1">Status do Operador</p>
                         <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase">
                             <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                             Super Admin Ativo
                         </div>
                    </div>
                </div>
            )}

            <div className="bg-darkCard rounded-[32px] border border-darkBorder shadow-xl overflow-hidden">
                <div className="p-8 border-b border-darkBorder flex justify-between items-center bg-darkInput/20">
                    <h2 className="text-lg font-black text-purple-400 flex items-center gap-3 uppercase tracking-widest">
                        <ShieldCheck size={20} /> Administradores Globais
                    </h2>
                    <button 
                        onClick={openCreateModal}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition shadow-lg border-b-4 border-purple-800"
                    >
                        <UserPlus size={16} /> Novo Admin
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-darkInput text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-8 py-4">Operador</th>
                                <th className="px-8 py-4">Contato</th>
                                <th className="px-8 py-4 text-right">Ações de Controle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-darkBorder">
                            {globalAdmins.map(u => (
                                <tr key={u.id} className="hover:bg-darkInput/30 transition-colors">
                                    <td className="px-8 py-5 font-black text-white flex items-center gap-4">
                                        {u.avatarUrl ? <img src={u.avatarUrl} className="w-10 h-10 rounded-full object-cover border border-darkBorder shadow-sm" /> : <div className="w-10 h-10 rounded-full bg-purple-900/50 text-purple-300 flex items-center justify-center text-xs font-black uppercase border border-purple-800/30">{u.name.charAt(0)}</div>}
                                        <div className="flex flex-col">
                                            <span className="text-sm uppercase tracking-tighter">{u.name}</span>
                                            {u.id === currentUser?.id && <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Sessão Atual</span>}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-gray-400 text-xs font-bold font-mono tracking-tight">{u.email}</td>
                                    <td className="px-8 py-5 text-right flex justify-end gap-3">
                                        <button onClick={() => openEditModal(u)} className="bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white p-2.5 rounded-xl transition-all border border-blue-900/30"><Edit size={16}/></button>
                                        {u.id !== currentUser?.id && (
                                            <button onClick={() => requestDelete(u)} className="bg-red-900/10 text-red-500 hover:bg-red-600 hover:text-white p-2.5 rounded-xl transition-all border border-red-900/30"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-darkCard rounded-[32px] border border-darkBorder shadow-xl overflow-hidden">
                <div className="p-8 border-b border-darkBorder flex flex-col md:flex-row justify-between items-center gap-4 bg-darkInput/20">
                    <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                        Painéis Master (Tenants)
                    </h2>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar Nome, ID ou Email..." 
                          className="w-full bg-darkInput border border-darkBorder rounded-2xl pl-12 pr-4 py-3 text-xs font-bold text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-darkInput text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-8 py-4">Tenant Root</th>
                                <th className="px-8 py-4">Metadados de Contato</th>
                                <th className="px-8 py-4 text-right">Interface de Controle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-darkBorder">
                            {masterTenants.map((user) => (
                                <tr key={user.id} className="hover:bg-darkInput/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} className="w-12 h-12 rounded-2xl border border-darkBorder object-cover shadow-sm" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-2xl bg-darkInput flex items-center justify-center font-black text-gray-500 text-lg border border-darkBorder shadow-inner uppercase">
                                                    {user.name.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-black text-white text-base uppercase tracking-tighter">{user.name}</p>
                                                <p className="text-[9px] text-gray-500 font-mono tracking-widest mt-1">UUID: {user.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-gray-300">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                                <Mail size={14} className="text-gray-600" /> {user.email}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                                <Calendar size={12} /> Criado em {formatDate(user.createdAt)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right flex justify-end gap-3 items-center">
                                        <button 
                                            onClick={() => onAccessMaster(user.id)}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg border-b-4 border-indigo-900"
                                        >
                                            Acessar <ExternalLink size={14} />
                                        </button>
                                        <button 
                                            onClick={() => requestDelete(user)}
                                            className="bg-red-900/20 border border-red-900/50 hover:bg-red-700 hover:text-white text-red-500 p-2.5 rounded-xl transition-all shadow-sm"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {masterTenants.length === 0 && (
                        <div className="p-20 text-center text-gray-500 font-black uppercase tracking-widest italic text-xs">Nenhum tenant localizado para os critérios informados.</div>
                    )}
                </div>
            </div>
        </div>

        {isModalOpen && (
             <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in transition-all">
                <div className="bg-darkCard rounded-[32px] w-full max-w-lg p-8 shadow-2xl border border-darkBorder">
                   <div className="flex justify-between items-center mb-8 border-b border-darkBorder pb-4">
                      <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                         {editData.id ? <Edit className="text-blue-400"/> : <UserPlus className="text-purple-400"/>}
                         {editData.id ? 'Editar Configuração Global' : 'Provisionar Novo Operador'}
                      </h3>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-red-500/10 rounded-full transition-colors"><X className="text-gray-500 hover:text-red-500" /></button>
                   </div>

                   <form onSubmit={handleSaveGlobal} className="space-y-6">
                      <div className="flex flex-col items-center mb-6">
                         <div className="w-24 h-24 bg-darkInput rounded-full flex items-center justify-center mb-4 overflow-hidden relative border-4 border-dashed border-darkBorder shadow-inner transition-all">
                             {uploading ? (
                                <Loader2 className="animate-spin text-purple-400" size={32} />
                             ) : editData.avatarUrl ? (
                                 <img src={editData.avatarUrl} className="w-full h-full object-cover" />
                             ) : (
                                 <UserIcon size={32} className="text-gray-700" />
                             )}
                         </div>
                         <label className={`cursor-pointer text-purple-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:text-purple-300 transition-colors bg-purple-900/10 px-4 py-2 rounded-full border border-purple-800/30 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                             {uploading ? 'Aguarde...' : <><Upload size={14} /> Alterar Avatar</>}
                             <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleAvatarUpload} />
                         </label>
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Nome Completo</label>
                              <input required type="text" className="w-full bg-darkInput border border-darkBorder rounded-2xl p-4 text-xs font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none shadow-inner" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Email de Acesso</label>
                              <input required type="email" className="w-full bg-darkInput border border-darkBorder rounded-2xl p-4 text-xs font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none shadow-inner" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Senha de Controle {editData.id && '(Opcional)'}</label>
                              <input type="password" className="w-full bg-darkInput border border-darkBorder rounded-2xl p-4 text-xs font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none shadow-inner" value={editData.password || ''} onChange={e => setEditData({...editData, password: e.target.value})} placeholder={editData.id ? 'Manter chave atual' : 'Defina uma senha forte'} />
                          </div>
                      </div>
                      
                      {modalError && <p className="text-red-400 text-center text-[10px] font-black uppercase tracking-widest bg-red-900/20 p-3 rounded-xl border border-red-800/30">{modalError}</p>}

                      <button type="submit" disabled={uploading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 mt-4 disabled:opacity-50 uppercase tracking-widest text-xs border-b-4 border-purple-900">
                          <Save size={18}/> {uploading ? 'Sincronizando...' : 'Confirmar Registro'}
                      </button>
                   </form>
                </div>
             </div>
        )}

        {deleteConfirm.isOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in transition-all">
                <div className="bg-darkCard rounded-[32px] w-full max-w-md p-8 shadow-2xl text-center border border-red-900/50">
                     <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-darkCard shadow-inner">
                         <AlertTriangle className="text-red-500" size={40} />
                     </div>
                     <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Excluir Tenant Root?</h3>
                     <p className="text-gray-400 mb-8 text-sm font-medium">
                        Você está prestes a revogar o acesso e apagar os registros do usuário <strong>{deleteConfirm.userName}</strong>.
                     </p>

                     {userTeamsCount > 0 && (
                         <div className="text-left bg-darkInput/50 p-6 rounded-2xl border border-darkBorder mb-8 transition-colors">
                             <div className="flex items-center gap-2 text-yellow-500 font-black text-[10px] uppercase tracking-widest mb-3">
                                 <ShieldCheck size={14} />
                                 <span>Sub-datasets Vinculados Detectados</span>
                             </div>
                             <p className="text-xs text-gray-400 mb-4 font-medium leading-relaxed">
                                 Este tenant possui <strong>{userTeamsCount} unidades esportivas</strong> registradas sob sua custódia técnica.
                             </p>
                             
                             <label className="flex items-center gap-4 cursor-pointer bg-darkInput p-4 rounded-xl border border-darkBorder hover:border-purple-800 transition-all group">
                                 <input 
                                    type="checkbox" 
                                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 bg-darkCard border-darkBorder cursor-pointer"
                                    checked={wantToMigrate}
                                    onChange={(e) => setWantToMigrate(e.target.checked)}
                                 />
                                 <span className="text-[10px] font-black text-white uppercase tracking-widest group-hover:text-purple-400 transition-colors">Migrar sub-datasets para outro Tenant?</span>
                             </label>

                             {wantToMigrate && (
                                 <div className="mt-4 animate-slide-up">
                                     <label className="block text-[8px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.2em] ml-1">UUID do Time Destino (Receptor)</label>
                                     <input 
                                        type="text" 
                                        className="w-full bg-darkCard border border-purple-500/30 rounded-xl p-3 text-white focus:border-purple-500 outline-none text-xs font-mono tracking-widest shadow-inner"
                                        placeholder="Cole o identificador único..."
                                        value={targetTeamIdInput}
                                        onChange={(e) => setTargetTeamIdInput(e.target.value)}
                                     />
                                     <p className="text-[8px] text-gray-500 mt-2 flex items-center gap-1 font-bold uppercase tracking-widest">
                                         <Shirt size={10} />
                                         Atletas, avaliações e treinos serão reatribuídos ao receptor.
                                     </p>
                                 </div>
                             )}

                             {!wantToMigrate && (
                                 <p className="text-[9px] text-red-400 mt-4 flex items-center gap-2 font-black uppercase tracking-widest bg-red-900/10 p-2 rounded-lg border border-red-900/20">
                                     <Trash2 size={12} />
                                     CRÍTICO: Dados não migrados serão excluídos permanentemente.
                                 </p>
                             )}
                         </div>
                     )}

                     <div className="flex gap-4">
                         <button 
                            onClick={() => setDeleteConfirm({isOpen: false, userId: null, userName: ''})} 
                            className="flex-1 bg-darkInput text-gray-500 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-800 disabled:opacity-50 transition-all shadow-sm"
                            disabled={isProcessingDelete}
                         >
                             Cancelar
                         </button>
                         <button 
                            onClick={handleMigrationAndCleanup} 
                            className={`flex-1 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl uppercase tracking-widest text-[10px] border-b-4 ${wantToMigrate ? 'bg-purple-600 hover:bg-purple-700 border-purple-900' : 'bg-red-600 hover:bg-red-700 border-red-900'} disabled:opacity-50`}
                            disabled={isProcessingDelete}
                         >
                             {isProcessingDelete ? <Loader2 className="animate-spin" size={18} /> : (wantToMigrate ? <ArrowRightLeft size={18}/> : <Trash2 size={18}/>)}
                             {wantToMigrate ? 'Migrar & Root Delete' : 'Hard Delete Root'}
                         </button>
                     </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default GlobalDashboard;
