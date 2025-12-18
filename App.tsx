import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import AthletesList from './pages/AthletesList';
import AthleteProfile from './pages/AthleteProfile';
import AthleteEvaluation from './pages/AthleteEvaluation'; 
import TechnicalPhysicalEvaluation from './pages/TechnicalPhysicalEvaluation'; // New Page
import Training from './pages/Training';
import Admin from './pages/Admin';
import UserManagement from './pages/UserManagement';
import GlobalDashboard from './pages/GlobalDashboard';
import PublicTeamDashboard from './pages/PublicTeamDashboard';
import PublicAthleteProfile from './pages/PublicAthleteProfile';
import RealTimeEvaluation from './pages/RealTimeEvaluation';
import { User, UserRole } from './types';
import { getTeams, getUsers } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [viewingAsMasterId, setViewingAsMasterId] = useState<string>(''); // Context ID (Panel ID)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        try {
            const storedUserStr = localStorage.getItem('performax_current_user');
            let currentUser: User | null = null;
            
            if (storedUserStr) {
                const localUser = JSON.parse(storedUserStr);
                try {
                    const allUsers = await getUsers();
                    const freshUser = allUsers.find(u => u.id === localUser.id);
                    if (freshUser) {
                        currentUser = freshUser;
                    }
                } catch (err) {
                    console.error("Could not refresh user from DB, using local cache", err);
                    currentUser = localUser;
                }

                if (currentUser) {
                    setUser(currentUser);
                    localStorage.setItem('performax_current_user', JSON.stringify(currentUser));
                    
                    const storedContext = localStorage.getItem('performax_context_id');
                    if (storedContext && storedContext !== currentUser.id && currentUser.role === UserRole.GLOBAL) {
                         setViewingAsMasterId(storedContext);
                    } else if (storedContext && currentUser.role === UserRole.MASTER) {
                         setViewingAsMasterId(storedContext);
                    } else {
                        setViewingAsMasterId(currentUser.id);
                    }
                } else {
                    localStorage.removeItem('performax_current_user');
                }
            }
            
            if (currentUser) {
                await updateSelectedTeamForContext(viewingAsMasterId || currentUser.id, currentUser);
            }
        } catch (e) {
            console.error("Critical error during app init", e);
            localStorage.removeItem('performax_current_user');
        } finally {
            setLoading(false);
        }
    };
    init();
  }, []);

  const updateSelectedTeamForContext = async (contextId: string, currentUser: User) => {
      try {
          const allTeams = await getTeams();
          let contextTeams = allTeams.filter(t => t.ownerId === contextId);
          
          if (currentUser.role !== UserRole.GLOBAL && currentUser.role !== UserRole.MASTER) {
              contextTeams = contextTeams.filter(t => currentUser.teamIds?.includes(t.id));
          } else if (currentUser.role === UserRole.MASTER && contextId !== currentUser.id) {
              contextTeams = contextTeams.filter(t => currentUser.teamIds?.includes(t.id));
          }

          if (contextTeams.length > 0) {
              setSelectedTeamId(prev => {
                  return contextTeams.find(t => t.id === prev) ? prev : contextTeams[0].id;
              });
          } else {
              setSelectedTeamId('');
          }
      } catch (e) {
          console.error("Error loading context teams", e);
      }
  };

  const handleLogin = async (u: User) => {
    setUser(u);
    localStorage.setItem('performax_current_user', JSON.stringify(u));
    const defaultContext = u.id;
    setViewingAsMasterId(defaultContext);
    localStorage.setItem('performax_context_id', defaultContext);
    
    await updateSelectedTeamForContext(defaultContext, u);
    
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

  const handleContextChange = async (newMasterId: string) => {
      setViewingAsMasterId(newMasterId);
      localStorage.setItem('performax_context_id', newMasterId);
      if (user) {
          await updateSelectedTeamForContext(newMasterId, user);
      }
      window.location.hash = '/';
  };

  const handleGlobalAccessMaster = async (masterId: string) => {
      setViewingAsMasterId(masterId);
      localStorage.setItem('performax_context_id', masterId);
      if (user) {
         await updateSelectedTeamForContext(masterId, user);
      }
      window.location.hash = '/';
  };

  const handleReturnToGlobal = () => {
      if (user?.role === UserRole.GLOBAL) {
          setViewingAsMasterId(user.id); 
          window.location.hash = '/global';
      }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50 text-blue-600 font-bold">Carregando PerformaXX...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/p/team/:teamId" element={<PublicTeamDashboard />} />
        <Route path="/p/athlete/:athleteId" element={<PublicAthleteProfile />} />

        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        
        <Route path="/global" element={
            user && user.role === UserRole.GLOBAL ? (
                <GlobalDashboard onAccessMaster={handleGlobalAccessMaster} onLogout={handleLogout} />
            ) : <Navigate to={user ? "/" : "/login"} />
        } />

        {user && (
            <>
                <Route path="/athletes/:id/realtime" element={<RealTimeEvaluation />} />
                <Route path="/athletes/:id/tech-phys-eval" element={<TechnicalPhysicalEvaluation />} />
            </>
        )}

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
                  
                  <Route path="/athletes/:id/evaluation" element={<AthleteEvaluation />} />
                  <Route path="/athletes/:id/evaluation/:entryId" element={<AthleteEvaluation />} />

                  <Route path="/training" element={<Training teamId={selectedTeamId} />} />
                  <Route path="/admin" element={<Admin userRole={user.role} currentTeamId={selectedTeamId} />} />
                  
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