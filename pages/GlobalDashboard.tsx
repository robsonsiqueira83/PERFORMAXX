import React, { useEffect, useState } from 'react';
import { getUsers } from '../services/storageService';
import { User, UserRole } from '../types';
import { Loader2, ShieldCheck, Search, ExternalLink, Calendar, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface GlobalDashboardProps {
  onAccessMaster: (masterId: string) => void;
  onLogout: () => void;
}

const GlobalDashboard: React.FC<GlobalDashboardProps> = ({ onAccessMaster, onLogout }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
       const all = await getUsers();
       // Filter Masters or other Globals (but mainly display Masters as tenants)
       setUsers(all.filter(u => u.role === UserRole.MASTER || u.role === UserRole.GLOBAL));
       setLoading(false);
    };
    load();
  }, []);

  const filteredUsers = users.filter(u => 
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  );

  const formatDate = (isoString?: string) => {
      if (!isoString) return 'Data não disponível';
      return new Date(isoString).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white"><Loader2 className="animate-spin mr-2"/> Carregando Global...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-6 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
                 <ShieldCheck className="text-blue-500" size={32} />
                 <div>
                     <h1 className="text-2xl font-bold tracking-tight text-white">Painel Global</h1>
                     <p className="text-xs text-gray-400">Super Administração de Tenants</p>
                 </div>
            </div>
            <div className="flex items-center gap-4">
                 <button onClick={() => navigate('/users')} className="text-gray-300 hover:text-white font-medium px-4 py-2 hover:bg-gray-700 rounded-lg transition">
                    Gestão de Usuários
                 </button>
                 <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold transition">
                    Sair
                 </button>
            </div>
        </div>

        <div className="max-w-7xl mx-auto p-8">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-sm">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Total de Usuários Master</h3>
                    <p className="text-4xl font-bold text-white">{users.filter(u => u.role === UserRole.MASTER).length}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-sm">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Total Admins Global</h3>
                    <p className="text-4xl font-bold text-blue-400">{users.filter(u => u.role === UserRole.GLOBAL).length}</p>
                </div>
            </div>

            {/* List */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Painéis Master Cadastrados
                    </h2>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                        <input 
                          type="text" 
                          placeholder="Buscar por nome, email ou ID..." 
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
                                <th className="px-6 py-4">Usuário / ID</th>
                                <th className="px-6 py-4">Email / Cadastro</th>
                                <th className="px-6 py-4">Função</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredUsers.map((user) => (
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
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${user.role === UserRole.GLOBAL ? 'bg-blue-900/50 text-blue-300 border border-blue-800' : 'bg-green-900/50 text-green-300 border border-green-800'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {user.role === UserRole.MASTER && (
                                            <button 
                                                onClick={() => onAccessMaster(user.id)}
                                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ml-auto transition-all"
                                            >
                                                Acessar Painel <ExternalLink size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredUsers.length === 0 && (
                        <div className="p-8 text-center text-gray-500">Nenhum usuário encontrado.</div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default GlobalDashboard;