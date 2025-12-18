
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import AthletesList from './pages/AthletesList';
import AthleteProfile from './pages/AthleteProfile';
import AthleteEvaluation from './pages/AthleteEvaluation'; 
import TechnicalPhysicalEvaluation from './pages/TechnicalPhysicalEvaluation';
import EvaluationView from './pages/EvaluationView'; // Nova Página
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
  const [viewingAsMasterId, setViewingAsMasterId] = useState<string>(''); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        try {
            const storedUserStr = localStorage.getItem('performax_current_user');
            let currentUser: User | null = null;
            if (storedUserStr) {
                const localUser = JSON.parse(storedUserStr);
                const allUsers = await getUsers();
                const freshUser = allUsers.find(u => u.id === localUser.id);
                currentUser = freshUser || localUser;
                if (currentUser) {
                    setUser(currentUser);
                    const storedContext = localStorage.getItem('performax_context_id');
                    setViewingAsMasterId(storedContext || currentUser.id);
                }
            }
            if (currentUser) await updateSelectedTeamForContext(viewingAsMasterId || currentUser.id, currentUser);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    init();
  }, []);

  const updateSelectedTeamForContext = async (contextId: string, currentUser: User) => {
      const allTeams = await getTeams();
      let contextTeams = allTeams.filter(t => t.ownerId === contextId);
      if (contextTeams.length > 0) setSelectedTeamId(contextTeams[0].id);
      else setSelectedTeamId('');
  };

  const handleLogin = async (u: User) => {
    setUser(u);
    localStorage.setItem('performax_current_user', JSON.stringify(u));
    setViewingAsMasterId(u.id);
    localStorage.setItem('performax_context_id', u.id);
    await updateSelectedTeamForContext(u.id, u);
    window.location.hash = u.role === UserRole.GLOBAL ? '/global' : '/';
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('performax_current_user');
    window.location.hash = '/';
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50 text-blue-600 font-bold">Carregando...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/p/team/:teamId" element={<PublicTeamDashboard />} />
        <Route path="/p/athlete/:athleteId" element={<PublicAthleteProfile />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/global" element={user && user.role === UserRole.GLOBAL ? <GlobalDashboard onAccessMaster={() => {}} onLogout={handleLogout} /> : <Navigate to="/login" />} />

        {user && (
            <>
                <Route path="/athletes/:id/realtime" element={<RealTimeEvaluation />} />
                <Route path="/athletes/:id/tech-phys-eval" element={<TechnicalPhysicalEvaluation />} />
                <Route path="/athletes/:id/eval-view/:sessionId" element={<EvaluationView />} />
            </>
        )}

        <Route path="*" element={!user ? <Navigate to="/login" /> : (
             <Layout user={user} viewingAsMasterId={viewingAsMasterId} onLogout={handleLogout} selectedTeamId={selectedTeamId} onTeamChange={setSelectedTeamId} onContextChange={() => {}} onReturnToGlobal={() => {}}>
               <Routes>
                  <Route path="/" element={<Dashboard teamId={selectedTeamId} />} />
                  <Route path="/athletes" element={<AthletesList teamId={selectedTeamId} />} />
                  <Route path="/athletes/:id" element={<AthleteProfile />} />
                  <Route path="/athletes/:id/evaluation" element={<AthleteEvaluation />} />
                  <Route path="/training" element={<Training teamId={selectedTeamId} />} />
                  <Route path="/admin" element={<Admin userRole={user.role} currentTeamId={selectedTeamId} />} />
                  {(user.role === UserRole.MASTER || user.role === UserRole.GLOBAL) && <Route path="/users" element={<UserManagement />} />}
               </Routes>
             </Layout>
        )} />
      </Routes>
    </Router>
  );
};

export default App;
