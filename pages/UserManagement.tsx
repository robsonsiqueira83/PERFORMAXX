import React, { useState, useEffect } from 'react';
import { getUsers, saveUser, deleteUser, getTeams } from '../services/storageService';
import { User, UserRole, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, ShieldCheck, Loader2, CheckSquare, Square, AlertCircle, CheckCircle, Lock, Info, Eye, Database, X, Globe } from 'lucide-react';
import { processImageUpload } from '../services/imageService';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Modal States
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('performax_current_user');
    if (stored) setCurrentUser(JSON.parse(stored));
    loadData();
  }, []);

  const loadData = async () => {
      setLoading(true);
      const [u, t] = await Promise.all([getUsers(), getTeams()]);
      setUsers(u);
      setTeams(t);
      setLoading(false);
  };

  const handleRoleChange = (newRole: UserRole) => {
    if (!editingUser) return;
    
    // Logic: 
    // MASTER/GLOBAL -> teamIds = [] (Implies access to all or via Dashboard)
    // OTHERS -> teamIds = current selection or []
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

        if (saveError) {
            throw saveError;
        }

        await loadData();
        setEditingUser(null);
        setSuccessMessage("Usuário salvo com sucesso!");

    } catch (err: any) {
        console.error("Erro ao salvar usuário:", err);
        if (err.code === '23505') {
            setError("Este email já está em uso por outro usuário.");
        } else {
            setError(err.message || "Erro desconhecido ao salvar.");
        }
    } finally {
        setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirmation) {
        await deleteUser(deleteConfirmation);
        await loadData();
        setDeleteConfirmation(null);
    }
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

  // Helper to get permission description
  const getPermissionDescription = (role: UserRole) => {
    switch (role) {
        case UserRole.GLOBAL:
            return {
                icon: <Globe className="text-purple-600" size={24} />,
                title: "Super Admin (Global)",
                desc: "Acesso irrestrito a TODOS os painéis Master do sistema. Pode criar outros Globais.",
                color: "bg-purple-50 border-purple-200 text-purple-900"
            };
        case UserRole.MASTER:
            return {
                icon: <ShieldCheck className="text-blue-600" size={24} />,
                title: "Dono do Painel (Master)",
                desc: "Controle total do seu próprio painel (Times, Atletas). Possui ID único de Tenant.",
                color: "bg-blue-50 border-blue-200 text-blue-900"
            };
        case UserRole.TECNICO:
        case UserRole.AUXILIAR:
        case UserRole.SCOUT:
            return {
                icon: <Database className="text-green-600" size={24} />,
                title: "Gestão de Dados (Restrito)",
                desc: "Pode cadastrar e editar dados (Atletas, Treinos) dos times selecionados.",
                color: "bg-green-50 border-green-200 text-green-900"
            };
        case UserRole.PREPARADOR:
        case UserRole.MASSAGISTA:
            return {
                icon: <Eye className="text-orange-600" size={24} />,
                title: "Apenas Visualização",
                desc: "Acesso somente leitura aos dados dos times selecionados.",
                color: "bg-orange-50 border-orange-200 text-orange-900"
            };
        default:
            return { icon: null, title: "", desc: "", color: "" };
    }
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && users.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative">
       <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
               <ShieldCheck className="text-blue-600"/> Gestão de Usuários
           </h2>
           <button onClick={() => setEditingUser({role: UserRole.TECNICO, teamIds: []})} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex gap-2 shadow-sm transition-colors">
               <Plus size={20} /> Novo Usuário
           </button>
       </div>

       {editingUser && (
           <div className="bg-white p-6 rounded-xl mb-8 border-2 border-blue-100 shadow-lg animate-fade-in relative">
               <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 rounded-t-xl"></div>
               <h3 className="font-bold mb-6 text-xl text-gray-800 pb-2 flex justify-between items-center">
                   {editingUser.id ? 'Editar Usuário' : 'Novo Usuário'}
                   <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
               </h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="md:col-span-2 flex items-center gap-4 mb-2 p-4 bg-gray-50 rounded-lg">
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
                               // Only show GLOBAL option if current user is GLOBAL
                               (role === UserRole.GLOBAL && currentUser?.role !== UserRole.GLOBAL) ? null :
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

               {/* PERMISSION INFO BOX */}
               {editingUser.role && (() => {
                   const info = getPermissionDescription(editingUser.role);
                   return (
                       <div className={`mt-6 p-4 rounded-xl border flex items-start gap-4 ${info.color}`}>
                           <div className="mt-1">{info.icon}</div>
                           <div>
                               <h4 className="font-bold">{info.title}</h4>
                               <p className="text-sm opacity-90 leading-relaxed">{info.desc}</p>
                           </div>
                       </div>
                   );
               })()}

               {/* TEAM SELECTION */}
               {editingUser.role !== UserRole.MASTER && editingUser.role !== UserRole.GLOBAL && (
                   <div className="mt-6 border-t border-gray-100 pt-4">
                      <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                          <Lock size={16} className="text-gray-500"/> Selecionar Times Permitidos
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {teams.map(team => {
                              const isSelected = editingUser.teamIds?.includes(team.id);
                              return (
                                  <div key={team.id} 
                                       onClick={() => toggleTeamSelection(team.id)}
                                       className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-blue-50 border-blue-300 shadow-sm' : 'hover:bg-gray-50 border-gray-200'}`}
                                  >
                                      {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-gray-300" />}
                                      <span className={`text-sm ${isSelected ? 'font-bold text-blue-900' : 'text-gray-600'}`}>{team.name}</span>
                                  </div>
                              );
                          })}
                      </div>
                      {(!editingUser.teamIds || editingUser.teamIds.length === 0) && (
                          <p className="text-xs text-red-500 mt-2 font-bold flex items-center gap-1">
                              <AlertCircle size={12}/> É necessário selecionar pelo menos um time.
                          </p>
                      )}
                   </div>
               )}

               {error && (
                   <div className="mt-4 bg-red-100 text-red-700 p-3 rounded-lg flex items-center gap-2 text-sm font-bold animate-pulse">
                       <AlertCircle size={18} /> {error}
                   </div>
               )}

               <div className="flex gap-3 mt-8 pt-4 border-t border-gray-200">
                   <button onClick={() => setEditingUser(null)} disabled={saving} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors disabled:opacity-50">Cancelar</button>
                   <button onClick={handleSave} disabled={saving} className="flex-[2] bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                       {saving && <Loader2 className="animate-spin" size={18} />}
                       Salvar Usuário
                   </button>
               </div>
           </div>
       )}

       <div className="grid grid-cols-1 gap-3">
           {users.map(u => {
               const perm = getPermissionDescription(u.role);
               return (
               <div key={u.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors bg-white shadow-sm gap-4">
                   <div className="flex items-center gap-4 w-full">
                       {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-gray-200" /> : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-lg">{u.name.charAt(0)}</div>}
                       <div className="flex-1 min-w-0">
                           <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                               <p className="font-bold text-gray-800 text-lg truncate">{u.name}</p>
                               {/* SHOW ID FOR MASTER/GLOBAL */}
                               {(u.role === UserRole.MASTER || u.role === UserRole.GLOBAL) && (
                                   <span className="text-[10px] bg-gray-100 text-gray-500 font-mono px-2 py-0.5 rounded border border-gray-200 truncate" title="ID do Painel">ID: {u.id}</span>
                               )}
                           </div>
                           <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                               <p className="text-sm text-gray-500">{u.email}</p>
                               <span className="hidden sm:inline text-gray-300">•</span>
                               <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${u.role === UserRole.GLOBAL ? 'bg-purple-100 text-purple-800' : u.role === UserRole.MASTER ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{u.role}</span>
                           </div>
                           
                           {/* Info Permissions */}
                           <div className="flex items-center gap-1 mt-1">
                               <div className="text-xs text-gray-400">{perm.title}</div>
                           </div>
                       </div>
                   </div>
                   <div className="flex gap-2 self-end md:self-center">
                       <button onClick={() => setEditingUser(u)} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg transition-colors"><Edit size={18} /></button>
                       {/* Cannot delete self or Master if not Global */}
                       {u.id !== currentUser?.id && <button onClick={() => setDeleteConfirmation(u.id)} className="text-red-600 bg-red-50 p-2 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={18} /></button>}
                   </div>
               </div>
           )})}
       </div>

       {/* --- MODALS --- */}
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
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Trash2 className="text-red-600" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">Excluir Usuário?</h3>
                 <p className="text-gray-500 mb-6">Esta ação não pode ser desfeita. Tem certeza?</p>
                 <div className="flex gap-3">
                     <button onClick={() => setDeleteConfirmation(null)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
                     <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700">Excluir</button>
                 </div>
             </div>
         </div>
       )}

    </div>
  );
};

export default UserManagement;