
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  ClipboardList,
  ShieldCheck,
  Globe,
  Briefcase,
  ChevronDown,
  User as UserIcon,
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { Team, User, UserRole, canEditData } from '../types';
import { getTeams, getUsers, saveUser } from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  viewingAsMasterId: string;
  onLogout: () => void;
  selectedTeamId: string;
  onTeamChange: (id: string) => void;
  onContextChange: (masterId: string) => void;
  onReturnToGlobal: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
    children, 
    user, 
    viewingAsMasterId,
    onLogout, 
    selectedTeamId, 
    onTeamChange,
    onContextChange,
    onReturnToGlobal
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availableContexts, setAvailableContexts] = useState<{id: string, name: string}[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Team[]>([]);
  const location = useLocation();

  const loadContext = async () => {
      const [allTeams, allUsers] = await Promise.all([getTeams(), getUsers()]);
      
      const freshUser = allUsers.find(u => u.id === user.id) || user;
      const userTeamIds = freshUser.teamIds || [];

      // Detectar convites pendentes
      const pendingIds = userTeamIds.filter(id => id.startsWith('pending:')).map(id => id.replace('pending:', ''));
      setPendingInvites(allTeams.filter(t => pendingIds.includes(t.id)));

      let userAllowedTeams: Team[] = [];
      if (freshUser.role === UserRole.GLOBAL) {
          userAllowedTeams = allTeams.filter(t => t.ownerId === viewingAsMasterId);
      } else {
          const ownedTeams = allTeams.filter(t => t.ownerId === freshUser.id);
          const activeInvites = userTeamIds.filter(id => !id.startsWith('pending:'));
          // Fix: replaced undefined activeTeamIds with defined activeInvites to fix reference error
          const invitedTeams = allTeams.filter(t => activeInvites.includes(t.id));
          userAllowedTeams = [...ownedTeams, ...invitedTeams];
      }

      const ownerIds = Array.from(new Set(userAllowedTeams.map(t => t.ownerId).filter(Boolean))) as string[];
      if (freshUser.role === UserRole.MASTER && !ownerIds.includes(freshUser.id)) ownerIds.push(freshUser.id);
      
      const contexts = ownerIds.map(oId => {
          const ownerUser = allUsers.find(u => u.id === oId);
          return { id: oId, name: oId === freshUser.id ? 'Meu Painel Master' : `${ownerUser?.name || 'Desconhecido'} (ID: ${oId.substring(0,6)}...)` };
      });
      setAvailableContexts(contexts);

      const currentContextTeams = userAllowedTeams.filter(t => t.ownerId === viewingAsMasterId);
      setAvailableTeams(currentContextTeams);

      if (currentContextTeams.length > 0 && !currentContextTeams.find(t => t.id === selectedTeamId)) {
          onTeamChange(currentContextTeams[0].id);
      } else if (currentContextTeams.length === 0) {
          onTeamChange('');
      }
  };

  useEffect(() => { loadContext(); }, [user, viewingAsMasterId]);

  const handleAcceptInvite = async (teamId: string) => {
      const updatedIds = (user.teamIds || []).map(id => id === `pending:${teamId}` ? teamId : id);
      const updatedUser = { ...user, teamIds: updatedIds };
      await saveUser(updatedUser);
      // Sincroniza localStorage para que a página Admin veja a mudança após o reload
      localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
      window.location.reload();
  };

  const handleDeclineInvite = async (teamId: string) => {
      const updatedIds = (user.teamIds || []).filter(id => id !== `pending:${teamId}`);
      const updatedUser = { ...user, teamIds: updatedIds };
      await saveUser(updatedUser);
      localStorage.setItem('performax_current_user', JSON.stringify(updatedUser));
      loadContext();
  };

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Atletas', href: '/athletes', icon: Users },
    { name: 'Admin', href: '/admin', icon: Settings },
  ];
  if (canEditData(user.role)) navigation.splice(2, 0, { name: 'Atuações', href: '/training', icon: ClipboardList });
  
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row relative">
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1e3a8a] text-white transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col items-center border-b border-blue-800">
           <img src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" alt="PERFORMAXX" className="w-32 object-contain mb-4" />
           <div className="w-14 h-14 rounded-full border-2 border-blue-400 bg-blue-800 flex items-center justify-center overflow-hidden mb-2">
               {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon size={24} className="text-blue-300" />}
           </div>
           <h3 className="font-black text-[10px] uppercase tracking-widest text-center truncate w-full px-2">{user.name}</h3>
           <span className="text-[8px] font-black text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded border border-blue-800 mt-1 uppercase">{user.role}</span>
        </div>
        <nav className="mt-6 px-4 space-y-1 flex-1">
          {navigation.map((item) => (
            <Link key={item.name} to={item.href} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center px-4 py-3 rounded-xl transition-all ${isActive(item.href) ? 'bg-blue-700 text-white shadow-lg' : 'text-blue-100 hover:bg-blue-800'}`}>
              <item.icon className="h-5 w-5 mr-3" />
              <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-800"><button onClick={onLogout} className="flex items-center justify-center w-full px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-900/20 rounded-xl transition-all"><LogOut className="h-4 w-4 mr-2" /> Sair</button></div>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Banner de Convites Pendentes */}
        {pendingInvites.length > 0 && (
            <div className="bg-indigo-600 text-white px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 animate-pulse-slow">
                <div className="flex items-center gap-3">
                    <Bell className="animate-bounce" size={18} />
                    <p className="text-[10px] font-black uppercase tracking-widest">Você foi convidado para colaborar em {pendingInvites.length} {pendingInvites.length === 1 ? 'equipe' : 'equipes'}!</p>
                </div>
                <div className="flex gap-2">
                    {pendingInvites.map(t => (
                        <div key={t.id} className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full border border-white/20">
                            <span className="text-[9px] font-black uppercase">{t.name}</span>
                            <button onClick={() => handleAcceptInvite(t.id)} className="hover:text-emerald-400"><CheckCircle size={14}/></button>
                            <button onClick={() => handleDeclineInvite(t.id)} className="hover:text-red-400"><XCircle size={14}/></button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <header className="bg-white shadow-sm z-30 px-6 py-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-gray-500"><Menu size={24} /></button>
                    <h2 className="text-sm font-medium text-gray-800">Olá, <span className="font-black text-indigo-900">{user.name.split(' ')[0]}</span>.</h2>
                    {user.role === UserRole.GLOBAL && <button onClick={onReturnToGlobal} className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-purple-200">Painel Global</button>}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto md:min-w-[500px]">
                     {availableContexts.length > 1 && (
                         <div className="flex-1 relative">
                            <select value={viewingAsMasterId} onChange={(e) => onContextChange(e.target.value)} className="appearance-none w-full bg-gray-100 text-gray-700 pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                {availableContexts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                         </div>
                     )}
                     <div className="flex-1 relative">
                        <select value={selectedTeamId} onChange={(e) => onTeamChange(e.target.value)} className="appearance-none w-full bg-indigo-50 text-indigo-900 pl-4 pr-10 py-2.5 rounded-xl border border-indigo-100 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            {availableTeams.length > 0 ? availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>) : <option value="">Sem times disponíveis</option>}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" size={16} />
                     </div>
                </div>
            </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
