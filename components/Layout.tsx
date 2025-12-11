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
  Briefcase
} from 'lucide-react';
import { Team, User, UserRole, canEditData } from '../types';
import { getTeams, getUsers } from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
  user: User; // The logged in user (could be Global)
  viewingAsMasterId: string; // The ID of the Master context currently active
  onLogout: () => void;
  selectedTeamId: string;
  onTeamChange: (id: string) => void;
  onContextChange: (masterId: string) => void; // To switch Panels
  onReturnToGlobal: () => void; // For Global users to exit impersonation
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
  
  // State for Navigation Logic
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availableContexts, setAvailableContexts] = useState<{id: string, name: string}[]>([]);
  const location = useLocation();

  useEffect(() => {
    const loadContext = async () => {
        const [allTeams, allUsers] = await Promise.all([getTeams(), getUsers()]);
        
        // 1. Determine which teams the logged-in user can access
        let userAllowedTeams: Team[] = [];

        if (user.role === UserRole.GLOBAL) {
            // Global sees ALL teams of the current viewing context (Master)
            userAllowedTeams = allTeams.filter(t => t.ownerId === viewingAsMasterId);
        } else if (user.role === UserRole.MASTER) {
            // Master sees their own teams + teams they are invited to
            // Teams owned by them
            const ownedTeams = allTeams.filter(t => t.ownerId === user.id);
            // Teams they are invited to (via teamIds)
            const invitedTeams = allTeams.filter(t => user.teamIds?.includes(t.id));
            userAllowedTeams = [...ownedTeams, ...invitedTeams];
        } else {
            // Regular user sees only invited teams
            userAllowedTeams = allTeams.filter(t => user.teamIds?.includes(t.id));
        }

        // 2. Build Context List (Panel Selector)
        // Group available teams by Owner
        const ownerIds = Array.from(new Set(userAllowedTeams.map(t => t.ownerId).filter(Boolean))) as string[];
        
        // If I am a master, I should always see "My Panel" even if I have no teams yet
        if (user.role === UserRole.MASTER && !ownerIds.includes(user.id)) {
            ownerIds.push(user.id);
        }

        const contexts = ownerIds.map(oId => {
            const ownerUser = allUsers.find(u => u.id === oId);
            return {
                id: oId,
                name: oId === user.id ? 'Meu Painel Master' : `Painel de ${ownerUser?.name || 'Desconhecido'}`
            };
        });

        setAvailableContexts(contexts);

        // 3. Filter Teams for CURRENT Context
        const currentContextTeams = userAllowedTeams.filter(t => t.ownerId === viewingAsMasterId);
        setAvailableTeams(currentContextTeams);

        // Auto-select first team if current selection is invalid for this context
        if (currentContextTeams.length > 0 && !currentContextTeams.find(t => t.id === selectedTeamId)) {
            if (onTeamChange) onTeamChange(currentContextTeams[0].id);
        } else if (currentContextTeams.length === 0) {
            onTeamChange('');
        }
    };
    loadContext();
  }, [user, viewingAsMasterId]);

  // Base navigation
  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Atletas', href: '/athletes', icon: Users },
    { name: 'Admin', href: '/admin', icon: Settings },
  ];
  
  // Insert 'Atuações' if can edit
  if (canEditData(user.role)) {
      navigation.splice(2, 0, { name: 'Atuações', href: '/training', icon: ClipboardList });
  }
  
  const isActive = (path: string) => location.pathname === path;
  
  // Is this a Global User acting as a Master?
  const isGlobalImpersonating = user.role === UserRole.GLOBAL && viewingAsMasterId !== user.id;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#1e3a8a] text-white transform transition-transform duration-300 ease-in-out shadow-xl
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex flex-col items-center justify-center border-b border-blue-800 relative">
           <img 
             src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" 
             alt="PERFORMAXX" 
             className="w-40 object-contain"
           />
           {isGlobalImpersonating && (
               <div className="mt-2 bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded border border-blue-700 w-full text-center">
                   Modo Visualização Global
               </div>
           )}
        </div>

        <nav className="mt-6 px-4 space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive(item.href)
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5 mr-3" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
           {/* Global users can access User Management anywhere */}
           {(user.role === UserRole.MASTER || user.role === UserRole.GLOBAL) && (
             <Link
              to="/users"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive('/users')
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-5 w-5 mr-3" />
              <span className="font-medium">Usuários</span>
            </Link>
           )}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-blue-800 bg-[#1e3a8a]">
          <div className="flex items-center gap-3 mb-4">
             {user.avatarUrl ? (
                 <img src={user.avatarUrl} alt="User" className="w-10 h-10 rounded-full border-2 border-green-400 object-cover" />
             ) : (
                 <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold border-2 border-green-400">
                     {user.name.charAt(0)}
                 </div>
             )}
             <div className="flex-1 min-w-0">
                 <p className="text-sm font-medium truncate">{user.name}</p>
                 <p className="text-xs text-blue-300 truncate">{user.role}</p>
             </div>
          </div>
          
          <div className="flex gap-2">
            {isGlobalImpersonating ? (
                <button
                    onClick={onReturnToGlobal}
                    className="flex-1 flex items-center justify-center px-3 py-2 text-xs text-blue-100 hover:bg-blue-800 rounded transition-colors bg-blue-900/50 border border-blue-700"
                    title="Voltar ao Painel Global"
                >
                    <Globe className="h-4 w-4 mr-1" />
                    Global
                </button>
            ) : null}
            <button
                onClick={onLogout}
                className={`flex items-center justify-center ${isGlobalImpersonating ? 'w-auto px-3' : 'w-full px-4'} py-2 text-sm text-red-200 hover:text-red-100 hover:bg-red-900/30 rounded transition-colors`}
                title="Sair"
            >
                <LogOut className="h-4 w-4" />
                {!isGlobalImpersonating && <span className="ml-2">Sair</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header with Context Selector */}
        <header className="bg-white shadow-sm z-30 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800 hidden md:block">
               {navigation.find(n => n.href === location.pathname)?.name || (location.pathname === '/users' ? 'Gestão de Usuários' : 'Painel')}
            </h2>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto justify-end flex-1">
                <div className="flex flex-col md:items-end w-full md:w-auto text-right gap-2">
                    
                    {/* 1. PANEL/CONTEXT SELECTOR (Only if user has access to multiple) */}
                    {(availableContexts.length > 1 || user.role === UserRole.GLOBAL) && (
                         <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg border border-gray-200 w-full md:w-auto justify-between md:justify-end">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><Briefcase size={12}/> Painel:</span>
                            <select 
                                value={viewingAsMasterId}
                                onChange={(e) => onContextChange(e.target.value)}
                                className="bg-transparent text-sm font-bold text-gray-800 focus:outline-none cursor-pointer min-w-[150px] text-right"
                                disabled={isGlobalImpersonating} // Global users switch via Dashboard
                            >
                                {availableContexts.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                         </div>
                    )}

                    {/* 2. TEAM SELECTOR (Dependent on Context) */}
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 w-full md:w-auto justify-between md:justify-end">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Equipe:</span>
                        {availableTeams.length > 0 ? (
                            <select 
                                value={selectedTeamId}
                                onChange={(e) => onTeamChange(e.target.value)}
                                className="bg-transparent text-base font-bold text-blue-900 focus:outline-none cursor-pointer"
                            >
                                {availableTeams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        ) : (
                            <span className="text-sm text-gray-400 italic px-2">Nenhum time disponível</span>
                        )}
                    </div>
                </div>
            </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto w-full">
             {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;