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
  ShieldCheck
} from 'lucide-react';
import { Team, User, UserRole, canEditData } from '../types';
import { getTeams } from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
  selectedTeamId: string;
  onTeamChange: (id: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, selectedTeamId, onTeamChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const location = useLocation();

  useEffect(() => {
    const loadTeams = async () => {
        const allTeams = await getTeams();
        
        // Filter teams based on user access
        let userTeams = allTeams;
        if (user.role !== UserRole.MASTER && user.teamIds) {
             userTeams = allTeams.filter(t => user.teamIds?.includes(t.id));
        }
        setTeams(userTeams);

        // If current selected team is not in allowed list (and list is not empty), switch to first allowed
        if (userTeams.length > 0 && !userTeams.find(t => t.id === selectedTeamId)) {
            if (onTeamChange) onTeamChange(userTeams[0].id);
        }
    };
    loadTeams();
  }, [user]);

  // Base navigation
  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Atletas', href: '/athletes', icon: Users },
    // 'Atuações' is added conditionally below
    { name: 'Admin', href: '/admin', icon: Settings },
  ];
  
  // Insert 'Atuações' only if user can edit data
  if (canEditData(user.role)) {
      navigation.splice(2, 0, { name: 'Atuações', href: '/training', icon: ClipboardList });
  }
  
  // Update: Filtering Logic
  const filteredNavigation = navigation; 

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#1e3a8a] text-white p-4 flex justify-between items-center shadow-md z-50">
        <div className="flex items-center gap-2">
             <img 
               src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" 
               alt="PERFORMAXX" 
               className="h-8 object-contain"
             />
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#1e3a8a] text-white transform transition-transform duration-300 ease-in-out shadow-xl
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-center border-b border-blue-800">
           <img 
             src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" 
             alt="PERFORMAXX" 
             className="w-40 object-contain"
           />
        </div>

        <nav className="mt-6 px-4 space-y-2">
          {filteredNavigation.map((item) => (
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
           {user.role === UserRole.MASTER && (
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
          <button
            onClick={onLogout}
            className="flex items-center justify-center w-full px-4 py-2 text-sm text-red-200 hover:text-red-100 hover:bg-red-900/30 rounded transition-colors"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header with Context Selector */}
        <header className="bg-white shadow-sm z-30 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800 hidden md:block">
               {navigation.find(n => n.href === location.pathname)?.name || 'Painel'}
            </h2>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto justify-end flex-1">
                <div className="flex flex-col md:items-end w-full md:w-auto text-right">
                    <div className="mb-2">
                        <div className="flex items-center justify-end gap-1">
                            <span className="text-lg text-gray-600">Olá,</span>
                            <span className="text-xl font-bold text-gray-900">{user.name}.</span>
                        </div>
                        <p className="text-xs text-gray-500">Selecione abaixo a equipe que deseja trabalhar.</p>
                    </div>
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 w-full md:w-auto justify-between md:justify-start">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Equipe:</span>
                        <select 
                            value={selectedTeamId}
                            onChange={(e) => onTeamChange(e.target.value)}
                            className="bg-transparent text-base font-bold text-blue-900 focus:outline-none cursor-pointer"
                        >
                            {teams.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {user.avatarUrl && <img src={user.avatarUrl} className="w-12 h-12 rounded-full object-cover hidden md:block border-2 border-gray-100 shadow-sm" alt="" />}
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