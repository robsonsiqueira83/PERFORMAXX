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
import { User } from './types';
import { getTeams } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local session (simplified)
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    // Set default team - Async
    const init = async () => {
        const teams = await getTeams();
        if (teams.length > 0) setSelectedTeamId(teams[0].id);
        setLoading(false);
    };
    init();

  }, []);

  const handleLogin = async (u: User) => {
    setUser(u);
    localStorage.setItem('performax_current_user', JSON.stringify(u));
    
    // Ensure default team is selected if not already
    if (!selectedTeamId) {
        const teams = await getTeams();
        if (teams.length > 0) setSelectedTeamId(teams[0].id);
    }

    // Force redirect to Dashboard
    window.location.hash = '/';
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('performax_current_user');
    window.location.hash = '/'; // Reset to root
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

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
                  {user.role === 'MASTER' && (
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