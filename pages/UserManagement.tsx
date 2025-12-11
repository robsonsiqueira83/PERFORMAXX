import React, { useState, useEffect } from 'react';
import { getUsers, saveUser, deleteUser, getTeams } from '../services/storageService';
import { User, UserRole, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Save, Plus, ShieldCheck, Loader2, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { processImageUpload } from '../services/imageService';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
      setLoading(true);
      const [u, t] = await Promise.all([getUsers(), getTeams()]);
      setUsers(u);
      setTeams(t);
      setLoading(false);
  };

  const handleSave = async () => {
    try {
        setError(null);
        if (!editingUser?.name || !editingUser?.email || !editingUser.role) {
            setError("Preencha todos os campos obrigatórios.");
            return;
        }

        // Security Check: Non-MASTER users MUST have at least one team
        if (editingUser.role !== UserRole.MASTER && (!editingUser.teamIds || editingUser.teamIds.length === 0)) {
            setError("Para usuários que não são MASTER, é obrigatório selecionar pelo menos um time.");
            return;
        }

        setSaving(true);

        const user: User = {
            id: editingUser.id || uuidv4(),
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role,
            password: editingUser.password || '123456', // Simple default
            avatarUrl: editingUser.avatarUrl,
            teamIds: editingUser.role === UserRole.MASTER ? [] : (editingUser.teamIds || [])
        };
        
        const { error: saveError } = await saveUser(user);

        if (saveError) {
            throw saveError;
        }

        await loadData();
        setEditingUser(null);
        alert("Usuário salvo com sucesso!");

    } catch (err: any) {
        console.error("Erro ao salvar usuário:", err);
        if (err.code === '23505') {
            setError("Este email já está em uso por outro usuário.");
        } else {
            setError(err.message || "Erro desconhecido ao salvar. Tente novamente.");
        }
    } finally {
        setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deletar usuário?')) {
        await deleteUser(id);
        await loadData();
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

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && users.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
       <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
               <ShieldCheck className="text-blue-600"/> Gestão de Usuários
           </h2>
           <button onClick={() => setEditingUser({role: UserRole.TECNICO, teamIds: []})} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex gap-2 shadow-sm transition-colors">
               <Plus size={20} /> Novo Usuário
           </button>
       </div>

       {editingUser && (
           <div className="bg-gray-50 p-6 rounded-xl mb-8 border border-gray-200 shadow-inner animate-fade-in relative">
               <h3 className="font-bold mb-6 text-lg text-gray-800 border-b pb-2">{editingUser.id ? 'Editar' : 'Novo'} Usuário</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="md:col-span-2 flex items-center gap-4 mb-2">
                        {editingUser.avatarUrl ? (
                            <img src={editingUser.avatarUrl} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
                        ) : <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-400">?</div>}
                        <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
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
                       <label className="block text-sm font-bold text-gray-700 mb-1">Função (Permissão)</label>
                       <select 
                          className={inputClass}
                          value={editingUser.role} 
                          onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                       >
                           {Object.values(UserRole).map(role => (
                               <option key={role} value={role}>{role}</option>
                           ))}
                       </select>
                   </div>
                   
                   <div>
                       <label className="block text-sm font-bold text-gray-700 mb-1">Senha {editingUser.id && '(Preencha para alterar)'}</label>
                       <input 
                          type="password"
                          placeholder="******" 
                          className={inputClass}
                          value={editingUser.password || ''} 
                          onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                       />
                   </div>
               </div>

               {editingUser.role !== UserRole.MASTER && (
                   <div className="mt-6 bg-white p-4 rounded-xl border border-gray-200">
                      <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                          <CheckSquare size={16} className="text-green-600"/> Liberar Acesso aos Times
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {teams.map(team => {
                              const isSelected = editingUser.teamIds?.includes(team.id);
                              return (
                                  <div key={team.id} 
                                       onClick={() => toggleTeamSelection(team.id)}
                                       className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-blue-50 border-blue-300 shadow-sm' : 'hover:bg-gray-50 border-gray-100'}`}
                                  >
                                      {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-gray-300" />}
                                      <span className={`text-sm ${isSelected ? 'font-bold text-blue-900' : 'text-gray-600'}`}>{team.name}</span>
                                  </div>
                              );
                          })}
                      </div>
                      {(!editingUser.teamIds || editingUser.teamIds.length === 0) && (
                          <p className="text-xs text-red-500 mt-2 font-medium">* Selecione pelo menos um time para este usuário.</p>
                      )}
                   </div>
               )}

               {error && (
                   <div className="mt-4 bg-red-100 text-red-700 p-3 rounded-lg flex items-center gap-2 text-sm font-bold animate-pulse">
                       <AlertCircle size={18} /> {error}
                   </div>
               )}

               <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                   <button onClick={() => setEditingUser(null)} disabled={saving} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors disabled:opacity-50">Cancelar</button>
                   <button onClick={handleSave} disabled={saving} className="flex-[2] bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                       {saving && <Loader2 className="animate-spin" size={18} />}
                       Salvar Usuário
                   </button>
               </div>
           </div>
       )}

       <div className="space-y-3">
           {users.map(u => (
               <div key={u.id} className="flex justify-between items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors bg-white shadow-sm">
                   <div className="flex items-center gap-4">
                       {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-gray-200" /> : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-lg">{u.name.charAt(0)}</div>}
                       <div>
                           <p className="font-bold text-gray-800 text-lg">{u.name}</p>
                           <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                               <p className="text-sm text-gray-500">{u.email}</p>
                               <span className="hidden sm:inline text-gray-300">•</span>
                               <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded uppercase">{u.role}</span>
                           </div>
                           {u.role !== UserRole.MASTER && u.teamIds && u.teamIds.length > 0 && (
                               <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                   <CheckSquare size={12}/> Acesso a {u.teamIds.length} times
                               </p>
                           )}
                       </div>
                   </div>
                   <div className="flex gap-2">
                       <button onClick={() => setEditingUser(u)} className="text-blue-600 bg-blue-50 p-2 hover:bg-blue-100 rounded-lg transition-colors"><Edit size={18} /></button>
                       {u.role !== UserRole.MASTER && <button onClick={() => handleDelete(u.id)} className="text-red-600 bg-red-50 p-2 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={18} /></button>}
                   </div>
               </div>
           ))}
       </div>
    </div>
  );
};

export default UserManagement;