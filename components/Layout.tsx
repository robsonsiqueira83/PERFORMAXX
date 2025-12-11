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
  User as UserIcon
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
            
            // Teams they are invited to (via teamIds) - FILTER OUT PENDING INVITES
            const activeTeamIds = (user.teamIds || []).filter(id => !id.startsWith('pending:'));
            const invitedTeams = allTeams.filter(t => activeTeamIds.includes(t.id));
            
            userAllowedTeams = [...ownedTeams, ...invitedTeams];
        } else {
            // Regular user sees only invited teams - FILTER OUT PENDING INVITES
            const activeTeamIds = (user.teamIds || []).filter(id => !id.startsWith('pending:'));
            userAllowedTeams = allTeams.filter(t => activeTeamIds.includes(t.id));
        }

        // 2. Build Context List (Panel Selector)
        // Group available teams by Owner
        const ownerIds = Array.from(new Set(userAllowedTeams.map(t => t.ownerId).filter(Boolean))) as string[];
        
        // If I am a master, I should always see "My Panel" even if I have no teams yet
        if (user.role === UserRole.MASTER && !ownerIds.includes(user.id)) {
            ownerIds.push(user.id);
        }
        
        // Global user sees the current viewing ID in the list to allow "selection" (though they switch via Dashboard usually)
        if (user.role === UserRole.GLOBAL && viewingAsMasterId && !ownerIds.includes(viewingAsMasterId)) {
            ownerIds.push(viewingAsMasterId);
        }

        const contexts = ownerIds.map(oId => {
            const ownerUser = allUsers.find(u => u.id === oId);
            
            let label = '';
            if (oId === user.id) {
                label = 'Meu Painel Master';
            } else {
                // Show Name and ID as requested
                const ownerName = ownerUser?.name || 'Desconhecido';
                label = `${ownerName} (ID: ${oId})`;
            }

            return {
                id: oId,
                name: label
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

  // Determine if we should show the Panel Switcher
  // Show if Global OR if Master has access to other contexts (invited)
  const showPanelSelector = user.role === UserRole.GLOBAL || (availableContexts.length > 1);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#1e3a8a] text-white transform transition-transform duration-300 ease-in-out shadow-xl flex flex-col
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo Area */}
        <div className="p-6 flex flex-col items-center justify-center border-b border-blue-800 relative">
           <img 
             src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" 
             alt="PERFORMAXX" 
             className="w-40 object-contain mb-4"
           />
           
           {/* User Profile in Sidebar */}
           <div className="flex flex-col items-center w-full">
               <div className="w-16 h-16 rounded-full border-2 border-blue-400 bg-blue-800 flex items-center justify-center overflow-hidden mb-2">
                   {user.avatarUrl ? (
                       <img src={user.avatarUrl} alt="User" className="w-full h-full object-cover" />
                   ) : (
                       <UserIcon size={32} className="text-blue-300" />
                   )}
               </div>
               <h3 className="font-bold text-sm text-center truncate w-full px-2">{user.name}</h3>
               <span className="text-xs text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded border border-blue-800 mt-1">{user.role}</span>
           </div>

           {isGlobalImpersonating && (
               <div className="mt-4 bg-blue-900/50 text-blue-200 text-xs px-2 py-1 rounded border border-blue-700 w-full text-center animate-pulse">
                   Modo Visualização Global
               </div>
           )}
        </div>

        <nav className="mt-6 px-4 space-y-2 flex-1">
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
           {/* Global/Master User Management */}
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

        <div className="p-4 border-t border-blue-800 bg-[#1e3a8a]">
            <button
                onClick={onLogout}
                className={`flex items-center justify-center w-full px-4 py-2 text-sm text-red-200 hover:text-red-100 hover:bg-red-900/30 rounded transition-colors`}
                title="Sair"
            >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Sair</span>
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm z-30 px-6 py-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                
                {/* Welcome & Team Selection Group */}
                <div className="flex flex-col gap-2 w-full md:w-auto flex-1">
                    <div className="flex items-center gap-3">
                         <h2 className="text-lg text-gray-800 font-medium">
                            Olá, <span className="font-bold text-blue-900">{user.name}</span>. <span className="text-gray-500">Em qual time deseja trabalhar?</span>
                         </h2>
                         {/* Return to Global Dashboard Button in Header */}
                         {user.role === UserRole.GLOBAL && (
                             <button
                                 onClick={onReturnToGlobal}
                                 className="flex items-center gap-1 bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-purple-200 transition-colors border border-purple-200"
                             >
                                 <Globe size={12} />
                                 Voltar ao Painel Global
                             </button>
                         )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                         {/* TEAM SELECTOR */}
                         <div className="relative">
                            <select 
                                value={selectedTeamId}
                                onChange={(e) => onTeamChange(e.target.value)}
                                className="appearance-none bg-blue-50 text-blue-900 pl-4 pr-10 py-2 rounded-lg border border-blue-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 cursor-pointer"
                            >
                                {availableTeams.length > 0 ? (
                                    availableTeams.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))
                                ) : (
                                    <option value="">Nenhum time disponível</option>
                                )}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 pointer-events-none" size={16} />
                         </div>

                         {/* CONTEXT/PANEL SELECTOR (Conditional) */}
                         {showPanelSelector && (
                             <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Briefcase size={14} className="text-gray-500" />
                                </div>
                                <select 
                                    value={viewingAsMasterId}
                                    onChange={(e) => onContextChange(e.target.value)}
                                    className="appearance-none bg-gray-100 text-gray-700 pl-9 pr-10 py-2 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gray-400 w-full sm:w-auto cursor-pointer"
                                    disabled={isGlobalImpersonating} // Global users usually switch via Dashboard, but listing here for reference
                                >
                                    {availableContexts.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                             </div>
                         )}
                    </div>
                </div>

                {/* Page Title / Info (Hidden on small mobile to save space) */}
                <div className="hidden md:block text-right">
                    <h1 className="text-xl font-bold text-gray-800">
                       {navigation.find(n => n.href === location.pathname)?.name || (location.pathname === '/users' ? 'Gestão de Usuários' : 'Painel')}
                    </h1>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200 uppercase">{user.role}</span>
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