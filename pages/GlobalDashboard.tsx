
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
       const storedUserStr = localStorage.getItem('performax_current_user');
       if (storedUserStr) setCurrentUser(JSON.parse(storedUserStr));

       const all = await getUsers();
       setUsers(all.filter(u => u.role === UserRole.MASTER || u.role === UserRole.GLOBAL));
       setLoading(false);
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
                      if (userTeamIds.includes(item.teamId)) {
                          await saveAthlete({ ...item, teamId: targetTeamIdInput, pendingTransferTeamId: undefined });
                      }
                  }

                  const sessionsToMove = allSessions.filter(s => userTeamIds.includes(s.teamId));
                  for (const item of sessionsToMove) {
                      if (userTeamIds.includes(item.teamId)) {
                          await saveTrainingSession({ ...item, teamId: targetTeamIdInput });
                      }
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

  const globalAdmins = users.filter(u => u.role === UserRole.GLOBAL);
  const masterTenants = users.filter(u => u.role === UserRole.MASTER && (
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  ));

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><Loader2 className="animate-spin mr-2"/> Carregando Global...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans pb-20">
        <div className="bg-gray-800 border-b border-gray-700 p-6 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4">
            <div className="flex items-center gap-3">
                 <Globe className="text-purple-500" size={32} />
                 <div>
                     <h1 className="text-2xl font-bold tracking-tight text-white">Painel Global</h1>
                     <p className="text-xs text-gray-400">Super Administração de Tenants</p>
                 </div>
            </div>
            <div className="flex items-center gap-4">
                 {currentUser && (
                     <button 
                        onClick={() => onAccessMaster(currentUser.id)} 
                        className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-lg shadow-purple-900/20"
                     >
                        <LayoutDashboard size={18} />
                        Acessar Meu Painel
                     </button>
                 )}
                 <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold transition">
                    Sair
                 </button>
            </div>
        </div>

        <div className="max-w-7xl mx-auto p-8 space-y-8">
            
            {currentUser && (
                <div className="bg-gradient-to-r from-blue-900 to-gray-800 rounded-xl border border-blue-700 p-6 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-4">
                         {currentUser.avatarUrl ? (
                            <img src={currentUser.avatarUrl} className="w-16 h-16 rounded-full border-2 border-white shadow-md object-cover" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold text-white border-2 border-white shadow-md">
                                {currentUser.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-white">Olá, {currentUser.name}</h2>
                            <p className="text-blue-200 text-sm">{currentUser.email}</p>
                            <span className="text-xs bg-blue-800 text-blue-100 px-2 py-0.5 rounded border border-blue-600 mt-1 inline-block">
                                ID: {currentUser.id}
                            </span>
                        </div>
                    </div>
                    <div className="hidden md:block text-right">
                         <p className="text-sm text-gray-400 uppercase font-bold">Status</p>
                         <div className="flex items-center gap-2 text-green-400 font-bold">
                             <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                             Super Admin Ativo
                         </div>
                    </div>
                </div>
            )}

            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                        <ShieldCheck size={20} /> Administradores Globais
                    </h2>
                    <button 
                        onClick={openCreateModal}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition"
                    >
                        <UserPlus size={16} /> Novo Admin
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-900/30 text-gray-500 text-xs uppercase">
                            <tr>
                                <th className="px-6 py-3">Nome</th>
                                <th className="px-6 py-3">Email</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {globalAdmins.map(u => (
                                <tr key={u.id} className="hover:bg-gray-700/30">
                                    <td className="px-6 py-3 font-medium text-white flex items-center gap-2">
                                        {u.avatarUrl ? <img src={u.avatarUrl} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-purple-900/50 text-purple-300 flex items-center justify-center text-xs font-bold">{u.name.charAt(0)}</div>}
                                        {u.name} {u.id === currentUser?.id && <span className="text-xs text-gray-500">(Você)</span>}
                                    </td>
                                    <td className="px-6 py-3 text-gray-400 text-sm">{u.email}</td>
                                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                                        <button onClick={() => openEditModal(u)} className="text-blue-400 hover:text-blue-300 p-1 hover:bg-gray-700 rounded transition"><Edit size={16}/></button>
                                        {u.id !== currentUser?.id && (
                                            <button onClick={() => requestDelete(u)} className="text-red-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-800/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Painéis Master Cadastrados
                    </h2>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar Tenant (Nome, ID, Email)..." 
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:outline-none focus:border-blue-500"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Tenant / ID</th>
                                <th className="px-6 py-4">Contato</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {masterTenants.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {user.avatarUrl ? (
                                                <img src={user.avatarUrl} className="w-10 h-10 rounded-full border border-gray-600" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-400">
                                                    {user.name.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-white">{user.name}</p>
                                                <p className="text-xs text-gray-500 font-mono">ID: {user.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <Mail size={14} className="text-gray-500" /> {user.email}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <Calendar size={12} /> {formatDate(user.createdAt)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => onAccessMaster(user.id)}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow"
                                        >
                                            Acessar <ExternalLink size={14} />
                                        </button>
                                        <button 
                                            onClick={() => requestDelete(user)}
                                            className="bg-red-900/30 border border-red-900 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {masterTenants.length === 0 && (
                        <div className="p-8 text-center text-gray-500">Nenhum tenant encontrado.</div>
                    )}
                </div>
            </div>
        </div>

        {isModalOpen && (
             <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-gray-700">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                         {editData.id ? <Edit className="text-blue-400"/> : <UserPlus className="text-green-400"/>}
                         {editData.id ? 'Editar Admin Global' : 'Novo Admin Global'}
                      </h3>
                      <button onClick={() => setIsModalOpen(false)}><X className="text-gray-500 hover:text-white" /></button>
                   </div>

                   <form onSubmit={handleSaveGlobal} className="space-y-4">
                      <div className="flex flex-col items-center mb-6">
                         <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-500">
                             {uploading ? (
                                <Loader2 className="animate-spin text-blue-400" size={32} />
                             ) : editData.avatarUrl ? (
                                 <img src={editData.avatarUrl} className="w-full h-full object-cover" />
                             ) : (
                                 <UserIcon size={32} className="text-gray-400" />
                             )}
                         </div>
                         <label className={`cursor-pointer text-blue-400 text-sm font-bold flex items-center gap-1 hover:text-blue-300 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                             {uploading ? 'Enviando...' : <><Upload size={14} /> Alterar Foto</>}
                             <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleAvatarUpload} />
                         </label>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Nome Completo</label>
                          <input required type="text" className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Email</label>
                          <input required type="email" className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Senha {editData.id && '(Opcional)'}</label>
                          <input type="password" className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none" value={editData.password || ''} onChange={e => setEditData({...editData, password: e.target.value})} placeholder={editData.id ? 'Manter senha atual' : ''} />
                      </div>
                      
                      {modalError && <p className="text-red-400 text-center text-sm font-bold bg-red-900/20 p-2 rounded">{modalError}</p>}

                      <button type="submit" disabled={uploading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-md transition flex items-center justify-center gap-2 mt-2 disabled:opacity-50">
                          <Save size={18}/> {uploading ? 'Aguarde...' : 'Salvar'}
                      </button>
                   </form>
                </div>
             </div>
        )}

        {deleteConfirm.isOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-center border border-red-900/50">
                     <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-800">
                         <AlertTriangle className="text-red-500" size={32} />
                     </div>
                     <h3 className="text-xl font-bold text-white mb-2">Excluir Painel Master?</h3>
                     <p className="text-gray-400 mb-4">
                        Você está prestes a excluir o usuário <strong>{deleteConfirm.userName}</strong>.
                     </p>

                     {userTeamsCount > 0 && (
                         <div className="text-left bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-6">
                             <div className="flex items-center gap-2 text-yellow-500 font-bold mb-2">
                                 <ShieldCheck size={16} />
                                 <span>Dados Vinculados Encontrados</span>
                             </div>
                             <p className="text-sm text-gray-400 mb-3">
                                 Este usuário possui <strong>{userTeamsCount} times</strong> com atletas e dados vinculados.
                             </p>
                             
                             <label className="flex items-center gap-3 cursor-pointer bg-gray-800 p-3 rounded border border-gray-600 hover:border-gray-500 transition">
                                 <input 
                                    type="checkbox" 
                                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 bg-gray-700 border-gray-500"
                                    checked={wantToMigrate}
                                    onChange={(e) => setWantToMigrate(e.target.checked)}
                                 />
                                 <span className="text-sm font-medium text-white">Migrar atletas para outro Time?</span>
                             </label>

                             {wantToMigrate && (
                                 <div className="mt-3 animate-fade-in">
                                     <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">ID do Time de Destino</label>
                                     <input 
                                        type="text" 
                                        className="w-full bg-gray-700 border border-purple-500/50 rounded p-2 text-white focus:border-purple-500 outline-none text-sm font-mono"
                                        placeholder="Cole o ID do time aqui..."
                                        value={targetTeamIdInput}
                                        onChange={(e) => setTargetTeamIdInput(e.target.value)}
                                     />
                                     <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                                         <Shirt size={10} />
                                         Atletas, categorias e treinos serão movidos para este time.
                                     </p>
                                 </div>
                             )}

                             {!wantToMigrate && (
                                 <p className="text-xs text-red-400 mt-3 flex items-center gap-1 font-bold">
                                     <Trash2 size={12} />
                                     Atenção: Se não migrar, todos os dados serão apagados permanentemente.
                                 </p>
                             )}
                         </div>
                     )}

                     <div className="flex gap-3">
                         <button 
                            onClick={() => setDeleteConfirm({isOpen: false, userId: null, userName: ''})} 
                            className="flex-1 bg-gray-700 text-white font-bold py-2 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                            disabled={isProcessingDelete}
                         >
                             Cancelar
                         </button>
                         <button 
                            onClick={handleMigrationAndCleanup} 
                            className={`flex-1 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 ${wantToMigrate ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}
                            disabled={isProcessingDelete}
                         >
                             {isProcessingDelete ? <Loader2 className="animate-spin" size={18} /> : (wantToMigrate ? <ArrowRightLeft size={18}/> : <Trash2 size={18}/>)}
                             {wantToMigrate ? 'Migrar & Excluir' : 'Excluir Tudo'}
                         </button>
                     </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default GlobalDashboard;
