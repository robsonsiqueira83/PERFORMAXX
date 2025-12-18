
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentContextId, setCurrentContextId] = useState<string>('');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, isGuestMaster: boolean } | null>(null);
  const [inviteModal, setInviteModal] = useState<{ isOpen: boolean, user: User | null, newTeams: string[] }>({ isOpen: false, user: null, newTeams: [] });
  const [inviteByIdModal, setInviteByIdModal] = useState(false);
  const [guestIdInput, setGuestIdInput] = useState('');
  const [guestIdError, setGuestIdError] = useState('');
  const [searchingId, setSearchingId] = useState(false);
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.TECNICO);
  const [inviteSelectedTeams, setInviteSelectedTeams] = useState<string[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    const storedContext = localStorage.getItem('performax_context_id');
    if (storedUser) {
        const u = JSON.parse(storedUser);
        setCurrentUser(u);
        const ctx = storedContext || u.id;
        setCurrentContextId(ctx);
        loadData(ctx, u);
    }
  }, []);

  const loadData = async (contextId: string, loggedUser: User) => {
      setLoading(true);
      const [allUsers, allTeams] = await Promise.all([getUsers(), getTeams()]);
      setAllSystemUsers(allUsers);
      const panelTeams = allTeams.filter(t => t.ownerId === contextId);
      setTeams(panelTeams);
      const panelTeamIds = panelTeams.map(t => t.id);
      const filteredUsers = allUsers.filter(u => {
          if (u.role === UserRole.GLOBAL) return loggedUser.role === UserRole.GLOBAL && contextId === loggedUser.id;
          if (u.id === contextId) return true;
          if (u.teamIds && u.teamIds.length > 0) return u.teamIds.some(tid => panelTeamIds.includes(tid.replace('pending:', '')));
          return false;
      });
      setUsers(filteredUsers);
      setLoading(false);
  };

  const handleSave = async () => {
    if (!editingUser?.name || !editingUser?.email || !editingUser.role) { setError("Preencha campos obrigatórios."); return; }
    const existingUser = allSystemUsers.find(u => u.email === editingUser.email && u.id !== editingUser.id);
    if (existingUser) { setInviteModal({ isOpen: true, user: existingUser, newTeams: [] }); setEditingUser(null); return; }
    setSaving(true);
    try {
        const user: User = { id: editingUser.id || uuidv4(), name: editingUser.name, email: editingUser.email, role: editingUser.role as UserRole, password: editingUser.password || '123456', avatarUrl: editingUser.avatarUrl, teamIds: editingUser.teamIds || [] };
        await saveUser(user);
        if (currentUser) await loadData(currentContextId, currentUser);
        setEditingUser(null);
        setSuccessMessage("Salvo!");
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const inputClass = "w-full bg-gray-100 dark:bg-darkInput border border-gray-300 dark:border-darkBorder text-black dark:text-gray-100 rounded-lg p-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && users.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white dark:bg-darkCard rounded-xl shadow-sm border border-gray-100 dark:border-darkBorder p-6 transition-colors duration-300">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
           <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><ShieldCheck className="text-blue-600 dark:text-blue-400"/> Gestão de Usuários</h2>
           <div className="flex gap-2 w-full md:w-auto">
               <button onClick={() => setInviteByIdModal(true)} className="flex-1 md:flex-none bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800">Convidar</button>
               <button onClick={() => setEditingUser({role: UserRole.TECNICO, teamIds: []})} className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-colors">Novo</button>
           </div>
       </div>

       <div className="space-y-8">
           {users.map(u => (
               <div key={u.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border dark:border-darkBorder rounded-xl hover:bg-gray-50 dark:hover:bg-indigo-900/10 transition-colors shadow-sm gap-4 bg-white dark:bg-darkInput/30">
                   <div className="flex items-center gap-4 w-full">
                       {u.avatarUrl ? <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-darkBorder" /> : <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 text-lg">{u.name.charAt(0)}</div>}
                       <div className="flex-1 min-w-0">
                           <p className="font-bold text-gray-800 dark:text-gray-100 text-lg truncate">{u.name}</p>
                           <p className="text-sm text-gray-500 dark:text-gray-400">{u.email}</p>
                           <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600">ID: {u.id}</span>
                       </div>
                   </div>
                   <div className="flex gap-2">
                       <button onClick={() => setEditingUser(u)} className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-darkInput p-2 hover:bg-blue-100 rounded-lg transition-colors"><Edit size={18} /></button>
                       <button onClick={() => setDeleteConfirmation({id: u.id, isGuestMaster: u.id !== currentContextId})} className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-darkInput p-2 hover:bg-red-100 rounded-lg"><Trash2 size={18} /></button>
                   </div>
               </div>
           ))}
       </div>

       {editingUser && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-xl w-full max-w-lg p-6 shadow-2xl">
                   <h3 className="font-bold mb-6 text-xl text-gray-800 dark:text-gray-100 pb-2 border-b dark:border-darkBorder flex justify-between items-center">
                       Usuário <button onClick={() => setEditingUser(null)}><X className="text-gray-400"/></button>
                   </h3>
                   <div className="space-y-4">
                       <div><label className="text-xs font-bold text-gray-500 uppercase">Nome</label><input className={inputClass} value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})}/></div>
                       <div><label className="text-xs font-bold text-gray-500 uppercase">Email</label><input className={inputClass} value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})}/></div>
                       <div><label className="text-xs font-bold text-gray-500 uppercase">Cargo</label><select className={inputClass} value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}>{Object.values(UserRole).map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                   </div>
                   <div className="flex gap-2 mt-8">
                       <button onClick={() => setEditingUser(null)} className="flex-1 bg-gray-100 dark:bg-darkInput text-gray-700 dark:text-gray-300 font-bold py-3 rounded-lg">Cancelar</button>
                       <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg">{saving ? 'Salvando...' : 'Salvar'}</button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default UserManagement;
