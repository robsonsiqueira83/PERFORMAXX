import React, { useEffect, useState } from 'react';
import { getUsers, saveUser, deleteUser } from '../services/storageService';
import { User, UserRole } from '../types';
import { Loader2, ShieldCheck, Search, ExternalLink, Calendar, Mail, LayoutDashboard, UserPlus, Trash2, X, Globe, Save } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  
  // Create Global Modal State
  const [isCreating, setIsCreating] = useState(false);
  const [newGlobalData, setNewGlobalData] = useState({ name: '', email: '', password: '' });
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
       setLoading(true);
       const storedUserStr = localStorage.getItem('performax_current_user');
       if (storedUserStr) setCurrentUser(JSON.parse(storedUserStr));

       const all = await getUsers();
       // Filter Masters or other Globals
       setUsers(all.filter(u => u.role === UserRole.MASTER || u.role === UserRole.GLOBAL));
       setLoading(false);
  };

  const handleCreateGlobal = async (e: React.FormEvent) => {
      e.preventDefault();
      setCreateError('');
      
      if (!newGlobalData.name || !newGlobalData.email || !newGlobalData.password) {
          setCreateError('Preencha todos os campos.');
          return;
      }

      const newUser: User = {
          id: uuidv4(),
          name: newGlobalData.name,
          email: newGlobalData.email,
          password: newGlobalData.password,
          role: UserRole.GLOBAL,
          avatarUrl: '',
          teamIds: []
      };

      const { error } = await saveUser(newUser);
      if (error) {
          if (error.code === '23505') {
              setCreateError('Email já cadastrado.');
          } else {
              setCreateError('Erro ao criar usuário.');
          }
      } else {
          setIsCreating(false);
          setNewGlobalData({ name: '', email: '', password: '' });
          loadData();
      }
  };

  const handleDeleteUser = async (userId: string) => {
      if (window.confirm("Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.")) {
          await deleteUser(userId);
          loadData();
      }
  };

  const formatDate = (isoString?: string) => {
      if (!isoString) return 'Data não disponível';
      return new Date(isoString).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });
  };

  // Separate Lists
  const globalAdmins = users.filter(u => u.role === UserRole.GLOBAL);
  const masterTenants = users.filter(u => u.role === UserRole.MASTER && (
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  ));

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><Loader2 className="animate-spin mr-2"/> Carregando Global...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans pb-20">
        {/* Header */}
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
            
            {/* 1. CURRENT USER HIGHLIGHT */}
            {currentUser && (
                <div className="bg-gradient-to-r from-blue-900 to-gray-800 rounded-xl border border-blue-700 p-6 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold text-white border-2 border-white shadow-md">
                            {currentUser.name.charAt(0)}
                        </div>
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

            {/* 2. GLOBAL ADMINS MANAGEMENT */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                        <ShieldCheck size={20} /> Administradores Globais
                    </h2>
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition"
                    >
                        <UserPlus size={16} /> Novo Admin
                    </button>
                </div>
                
                {/* Create Global Form (Inline/Modal) */}
                {isCreating && (
                    <div className="p-6 bg-gray-900 border-b border-gray-700 animate-fade-in">
                        <form onSubmit={handleCreateGlobal} className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nome</label>
                                <input required type="text" className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white" value={newGlobalData.name} onChange={e => setNewGlobalData({...newGlobalData, name: e.target.value})} />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Email</label>
                                <input required type="email" className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white" value={newGlobalData.email} onChange={e => setNewGlobalData({...newGlobalData, email: e.target.value})} />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Senha</label>
                                <input required type="password" className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white" value={newGlobalData.password} onChange={e => setNewGlobalData({...newGlobalData, password: e.target.value})} />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setIsCreating(false)} className="bg-gray-700 text-white p-2 rounded hover:bg-gray-600"><X size={20}/></button>
                                <button type="submit" className="bg-green-600 text-white p-2 rounded hover:bg-green-500 flex-1 flex items-center justify-center gap-1"><Save size={18}/> Salvar</button>
                            </div>
                        </form>
                        {createError && <p className="text-red-400 text-center text-sm mt-2">{createError}</p>}
                    </div>
                )}

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
                                        <div className="w-6 h-6 rounded-full bg-purple-900/50 text-purple-300 flex items-center justify-center text-xs font-bold">{u.name.charAt(0)}</div>
                                        {u.name} {u.id === currentUser?.id && <span className="text-xs text-gray-500">(Você)</span>}
                                    </td>
                                    <td className="px-6 py-3 text-gray-400 text-sm">{u.email}</td>
                                    <td className="px-6 py-3 text-right">
                                        {u.id !== currentUser?.id && (
                                            <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3. MASTERS / TENANTS LIST */}
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
                                        {/* Global can delete Master directly here */}
                                        <button 
                                            onClick={() => handleDeleteUser(user.id)}
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
    </div>
  );
};

export default GlobalDashboard;