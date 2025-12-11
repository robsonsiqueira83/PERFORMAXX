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
import PublicTeamDashboard from './pages/PublicTeamDashboard';
import PublicAthleteProfile from './pages/PublicAthleteProfile';
import { User, UserRole } from './types';
import { getTeams, getUsers } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        // 1. Check local session first
        const storedUserStr = localStorage.getItem('performax_current_user');
        let currentUser: User | null = null;
        
        if (storedUserStr) {
            try {
                const localUser = JSON.parse(storedUserStr);
                
                // CRITICAL FIX: Fetch fresh user data from DB to ensure Role/Permissions are up to date.
                // This prevents users from having stale permissions (e.g. seeing Edit buttons after being demoted).
                const allUsers = await getUsers();
                const freshUser = allUsers.find(u => u.id === localUser.id);
                
                if (freshUser) {
                    currentUser = freshUser;
                    setUser(freshUser);
                    // Update local storage with fresh data so it persists correctly next time
                    localStorage.setItem('performax_current_user', JSON.stringify(freshUser));
                } else {
                    // User might have been deleted from DB, logout locally
                    localStorage.removeItem('performax_current_user');
                }
            } catch (e) {
                console.error("Error parsing user session", e);
                localStorage.removeItem('performax_current_user');
            }
        }
        
        // 2. Load Teams with PERMISSION check based on the FRESH currentUser
        const allTeams = await getTeams();
        
        if (currentUser && allTeams.length > 0) {
            let allowedTeams = allTeams;
            
            // SECURITY: If not MASTER, filter teams strictly by user.teamIds
            if (currentUser.role !== UserRole.MASTER) {
                const userTeamIds = currentUser.teamIds || [];
                allowedTeams = allTeams.filter(t => userTeamIds.includes(t.id));
            }

            // Only set selectedTeamId if we have allowed teams
            if (allowedTeams.length > 0) {
                // Check if currently selected (from props or memory) is still valid, else default to first allowed
                setSelectedTeamId(prev => {
                    const isStillValid = allowedTeams.some(t => t.id === prev);
                    return isStillValid ? prev : allowedTeams[0].id;
                });
            } else if (currentUser.role !== UserRole.MASTER) {
                // If user exists but has NO teams allowed, clear selection
                setSelectedTeamId('');
            } else {
                // Master default
                setSelectedTeamId(allTeams[0].id);
            }
        } else if (allTeams.length > 0 && !currentUser) {
             setSelectedTeamId(allTeams[0].id);
        }
        
        setLoading(false);
    };
    init();

  }, []);

  const handleLogin = async (u: User) => {
    // On login, we assume 'u' is fresh from the login process (which fetches from DB)
    setUser(u);
    localStorage.setItem('performax_current_user', JSON.stringify(u));
    
    const allTeams = await getTeams();
    let allowedTeams = allTeams;

    // Apply strict filtering on Login as well
    if (u.role !== UserRole.MASTER) {
        allowedTeams = allTeams.filter(t => u.teamIds?.includes(t.id));
    }

    if (allowedTeams.length > 0) {
        setSelectedTeamId(allowedTeams[0].id);
    } else {
        setSelectedTeamId(''); // User has no teams assigned
    }

    // Force redirect to Dashboard
    window.location.hash = '/';
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('performax_current_user');
    window.location.hash = '/'; // Reset to root
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50 text-blue-600 font-bold">Carregando PerformaXX...</div>;

  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTES (No Auth Required) */}
        <Route path="/p/team/:teamId" element={<PublicTeamDashboard />} />
        <Route path="/p/athlete/:athleteId" element={<PublicAthleteProfile />} />

        {/* AUTHENTICATED ROUTES */}
        <Route path="*" element={
           !user ? (
             <Login onLogin={handleLogin} />
           ) : (
             <Layout user={user} onLogout={handleLogout} selectedTeamId={selectedTeamId} onTeamChange={setSelectedTeamId}>
               <Routes>
                  <Route path="/" element={<Dashboard teamId={selectedTeamId} />} />
                  <Route path="/athletes" element={<AthletesList teamId={selectedTeamId} />} />
                  <Route path="/athletes/:id" element={<AthleteProfile />} />
                  <Route path="/training" element={<Training teamId={selectedTeamId} />} />
                  <Route path="/admin" element={<Admin userRole={user.role} currentTeamId={selectedTeamId} />} />
                  {/* Master Only Route */}
                  {user.role === UserRole.MASTER && (
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