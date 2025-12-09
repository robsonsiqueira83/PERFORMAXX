import React, { useState, useEffect } from 'react';
import { getUsers, saveUser, deleteUser, getTeams } from '../services/storageService';
import { User, UserRole, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Save, Plus, ShieldCheck, Loader2, CheckSquare, Square } from 'lucide-react';
import { processImageUpload } from '../services/imageService';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (!editingUser?.name || !editingUser?.email || !editingUser.role) return;

    const user: User = {
        id: editingUser.id || uuidv4(),
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        password: editingUser.password || '123456', // Simple default
        avatarUrl: editingUser.avatarUrl,
        teamIds: editingUser.teamIds || []
    };
    await saveUser(user);
    await loadData();
    setEditingUser(null);
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

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded p-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && users.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
       <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
               <ShieldCheck className="text-blue-600"/> Gestão de Usuários
           </h2>
           <button onClick={() => setEditingUser({role: UserRole.TECNICO, teamIds: []})} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex gap-2">
               <Plus size={20} /> Novo Usuário
           </button>
       </div>

       {editingUser && (
           <div className="bg-gray-50 p-6 rounded-lg mb-8 border border-gray-200 shadow-inner animate-fade-in">
               <h3 className="font-bold mb-4 text-lg text-gray-800">{editingUser.id ? 'Editar' : 'Novo'} Usuário</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="md:col-span-2 flex items-center gap-4 mb-2">
                        {editingUser.avatarUrl ? (
                            <img src={editingUser.avatarUrl} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
                        ) : <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-400">?</div>}
                        <input type="file" onChange={handleAvatarUpload} className="text-sm text-gray-600" />
                   </div>
                   <input 
                      placeholder="Nome" 
                      className={inputClass}
                      value={editingUser.name || ''} 
                      onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                   />
                   <input 
                      placeholder="Email" 
                      className={inputClass}
                      value={editingUser.email || ''} 
                      onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                   />
                   <select 
                      className={inputClass}
                      value={editingUser.role} 
                      onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                   >
                       {Object.values(UserRole).map(role => (
                           <option key={role} value={role}>{role}</option>
                       ))}
                   </select>
                   <input 
                      type="password"
                      placeholder="Senha (Reset)" 
                      className={inputClass}
                      value={editingUser.password || ''} 
                      onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                   />
               </div>

               <div className="mt-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Acesso aos Times</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 bg-white p-3 rounded border border-gray-200">
                      {teams.map(team => {
                          const isSelected = editingUser.teamIds?.includes(team.id);
                          return (
                              <div key={team.id} 
                                   onClick={() => toggleTeamSelection(team.id)}
                                   className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                              >
                                  {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-gray-400" />}
                                  <span className={`text-sm ${isSelected ? 'font-bold text-blue-900' : 'text-gray-700'}`}>{team.name}</span>
                              </div>
                          );
                      })}
                  </div>
               </div>

               <div className="flex gap-2 mt-6">
                   <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">Salvar</button>
                   <button onClick={() => setEditingUser(null)} className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-400">Cancelar</button>
               </div>
           </div>
       )}

       <div className="space-y-3">
           {users.map(u => (
               <div key={u.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors bg-white">
                   <div className="flex items-center gap-3">
                       {u.avatarUrl ? <img src={u.avatarUrl} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">{u.name.charAt(0)}</div>}
                       <div>
                           <p className="font-bold text-gray-800">{u.name}</p>
                           <p className="text-sm text-gray-500">{u.email} - <span className="text-blue-600 font-medium">{u.role}</span></p>
                           {u.teamIds && u.teamIds.length > 0 && (
                               <p className="text-xs text-gray-400 mt-0.5">Acesso a {u.teamIds.length} times</p>
                           )}
                       </div>
                   </div>
                   <div className="flex gap-2">
                       <button onClick={() => setEditingUser(u)} className="text-blue-600 p-2 hover:bg-blue-50 rounded"><Edit size={18} /></button>
                       {u.role !== UserRole.MASTER && <button onClick={() => handleDelete(u.id)} className="text-red-600 p-2 hover:bg-red-50 rounded"><Trash2 size={18} /></button>}
                   </div>
               </div>
           ))}
       </div>
    </div>
  );
};

export default UserManagement;