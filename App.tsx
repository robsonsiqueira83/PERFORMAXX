import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import AthletesList from './pages/AthletesList';
import AthleteProfile from './pages/AthleteProfile';
import Training from './pages/Training';
import Admin from './pages/Admin';
import UserManagement from './pages/UserManagement';
import GlobalDashboard from './pages/GlobalDashboard';
import PublicTeamDashboard from './pages/PublicTeamDashboard';
import PublicAthleteProfile from './pages/PublicAthleteProfile';
import { User, UserRole } from './types';
import { getTeams, getUsers } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [viewingAsMasterId, setViewingAsMasterId] = useState<string>(''); // Context ID (Panel ID)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        const storedUserStr = localStorage.getItem('performax_current_user');
        let currentUser: User | null = null;
        
        if (storedUserStr) {
            try {
                const localUser = JSON.parse(storedUserStr);
                const allUsers = await getUsers();
                const freshUser = allUsers.find(u => u.id === localUser.id);
                
                if (freshUser) {
                    currentUser = freshUser;
                    setUser(freshUser);
                    localStorage.setItem('performax_current_user', JSON.stringify(freshUser));
                    
                    // Restore Context if previously set, otherwise default to self
                    const storedContext = localStorage.getItem('performax_context_id');
                    if (storedContext && storedContext !== freshUser.id && freshUser.role === UserRole.GLOBAL) {
                         // Keep impersonation context if Global
                         setViewingAsMasterId(storedContext);
                    } else if (storedContext && freshUser.role === UserRole.MASTER) {
                         // Keep selected context for Masters (could be own or invited)
                         setViewingAsMasterId(storedContext);
                    } else {
                        // Default to self or first owner in invited list
                        // For now default to self, Layout will adjust if self is not available
                        setViewingAsMasterId(freshUser.id);
                    }
                } else {
                    localStorage.removeItem('performax_current_user');
                }
            } catch (e) {
                console.error("Error parsing user session", e);
                localStorage.removeItem('performax_current_user');
            }
        }
        
        // Initial Team Load based on Context
        if (currentUser) {
            await updateSelectedTeamForContext(viewingAsMasterId || currentUser.id, currentUser);
        }
        
        setLoading(false);
    };
    init();
  }, []);

  const updateSelectedTeamForContext = async (contextId: string, currentUser: User) => {
      const allTeams = await getTeams();
      // Filter teams belonging to this Context (Master)
      // AND that the current user has access to
      let contextTeams = allTeams.filter(t => t.ownerId === contextId);
      
      if (currentUser.role !== UserRole.GLOBAL && currentUser.role !== UserRole.MASTER) {
          // Strict filter for non-admins
          contextTeams = contextTeams.filter(t => currentUser.teamIds?.includes(t.id));
      } else if (currentUser.role === UserRole.MASTER && contextId !== currentUser.id) {
          // Master viewing another panel they are invited to
          contextTeams = contextTeams.filter(t => currentUser.teamIds?.includes(t.id));
      }

      if (contextTeams.length > 0) {
          // If current selection is valid for this context, keep it. Else pick first.
          setSelectedTeamId(prev => {
              return contextTeams.find(t => t.id === prev) ? prev : contextTeams[0].id;
          });
      } else {
          setSelectedTeamId('');
      }
  };

  const handleLogin = async (u: User) => {
    setUser(u);
    localStorage.setItem('performax_current_user', JSON.stringify(u));
    const defaultContext = u.id;
    setViewingAsMasterId(defaultContext);
    localStorage.setItem('performax_context_id', defaultContext);
    
    await updateSelectedTeamForContext(defaultContext, u);
    
    // Global User Logic: Stay on Global Dashboard if logging in
    if (u.role === UserRole.GLOBAL) {
        window.location.hash = '/global';
    } else {
        window.location.hash = '/';
    }
  };

  const handleLogout = () => {
    setUser(null);
    setViewingAsMasterId('');
    setSelectedTeamId('');
    localStorage.removeItem('performax_current_user');
    localStorage.removeItem('performax_context_id');
    window.location.hash = '/';
  };

  // Change Context (Panel Switcher)
  const handleContextChange = async (newMasterId: string) => {
      setViewingAsMasterId(newMasterId);
      localStorage.setItem('performax_context_id', newMasterId);
      if (user) {
          await updateSelectedTeamForContext(newMasterId, user);
      }
      // Force redirect to dashboard to avoid stale data on current page
      window.location.hash = '/';
  };

  // Global Admin Accessing Specific Master
  const handleGlobalAccessMaster = async (masterId: string) => {
      setViewingAsMasterId(masterId);
      localStorage.setItem('performax_context_id', masterId);
      if (user) {
         await updateSelectedTeamForContext(masterId, user);
      }
      window.location.hash = '/';
  };

  // Return to Global Dashboard
  const handleReturnToGlobal = () => {
      if (user?.role === UserRole.GLOBAL) {
          setViewingAsMasterId(user.id); // Reset context to self (optional)
          window.location.hash = '/global';
      }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50 text-blue-600 font-bold">Carregando PerformaXX...</div>;

  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/p/team/:teamId" element={<PublicTeamDashboard />} />
        <Route path="/p/athlete/:athleteId" element={<PublicAthleteProfile />} />

        {/* AUTH ROUTES */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        
        {/* GLOBAL DASHBOARD */}
        <Route path="/global" element={
            user && user.role === UserRole.GLOBAL ? (
                <GlobalDashboard onAccessMaster={handleGlobalAccessMaster} onLogout={handleLogout} />
            ) : <Navigate to={user ? "/" : "/login"} />
        } />

        {/* APP ROUTES */}
        <Route path="*" element={
           !user ? (
             <Navigate to="/login" />
           ) : (
             <Layout 
                user={user} 
                viewingAsMasterId={viewingAsMasterId}
                onLogout={handleLogout} 
                selectedTeamId={selectedTeamId} 
                onTeamChange={setSelectedTeamId}
                onContextChange={handleContextChange}
                onReturnToGlobal={handleReturnToGlobal}
             >
               <Routes>
                  <Route path="/" element={<Dashboard teamId={selectedTeamId} />} />
                  <Route path="/athletes" element={<AthletesList teamId={selectedTeamId} />} />
                  <Route path="/athletes/:id" element={<AthleteProfile />} />
                  <Route path="/training" element={<Training teamId={selectedTeamId} />} />
                  <Route path="/admin" element={<Admin userRole={user.role} currentTeamId={selectedTeamId} />} />
                  
                  {/* Master & Global Route */}
                  {(user.role === UserRole.MASTER || user.role === UserRole.GLOBAL) && (
                    <Route path="/users" element={<UserManagement />} />
                  )}
                  <Route path="*" element={<Navigate to="/" />} />
               </Routes>
             </Layout>
           )
        } />
      </Routes>
    </Router>
  );
};

export default App;