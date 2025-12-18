
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  getAthletes, 
  getCategories, 
  saveAthlete, 
  getTeams,
  getEvaluationSessions,
  getTrainingEntries
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, User, canEditData, Team, EvaluationSession, TrainingEntry } from '../types';
import { Plus, Search, Upload, X, Users, Loader2, Edit, ArrowRightLeft, CheckCircle, AlertCircle, Target, XCircle, Info, Send, UserCheck, HelpCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allSystemAthletes, setAllSystemAthletes] = useState<Athlete[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evalSessions, setEvalSessions] = useState<EvaluationSession[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterPos, setFilterPos] = useState('all');
  
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRg, setTransferRg] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const [showSendTransferModal, setShowSendTransferModal] = useState(false);
  const [transferOutRg, setTransferOutRg] = useState('');
  const [transferOutTeamId, setTransferOutTeamId] = useState('');
  const [sendTransferLoading, setSendTransferLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsibleEmail: '', responsiblePhone: '', birthDate: ''
  });

  const loadData = async () => {
      setLoading(true);
      try {
          const [a, c, evals, teams] = await Promise.all([
              getAthletes(),
              getCategories(),
              getEvaluationSessions(),
              getTeams()
          ]);
          setAllSystemAthletes(a);
          setAllTeams(teams);
          const localAthletes = a.filter(item => item.teamId === teamId || item.pendingTransferTeamId === teamId);
          setAthletes(localAthletes);
          setCategories(c.filter(item => item.teamId === teamId));
          setEvalSessions(evals);
      } catch (err) {
          console.error("Erro ao carregar dados:", err);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
    loadData();
  }, [teamId, refreshKey]);

  const athletesWithSMC = useMemo(() => {
      return athletes.map(athlete => {
          const myEvals = evalSessions.filter(ev => ev.athleteId === athlete.id);
          const avgTech = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreTecnico, 0) / myEvals.length : 0;
          const avgPhys = myEvals.length > 0 ? myEvals.reduce((a, b) => a + b.scoreFisico, 0) / myEvals.length : 0;
          
          // CÁLCULO SMC (SCORE MÉDIO DE CAPACIDADE)
          const mt_norm = (avgTech / 5.0) * 10;
          const cf_norm = avgPhys / 10;
          const smc = (mt_norm * 0.55) + (cf_norm * 0.45);

          return { ...athlete, smc, isTechValid: myEvals.length >= 2 };
      });
  }, [athletes, evalSessions]);

  const filtered = useMemo(() => {
      let list = athletesWithSMC.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
      if (filterCat !== 'all') list = list.filter(a => a.categoryId === filterCat);
      if (filterPos !== 'all') list = list.filter(a => a.position === filterPos);
      return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [athletesWithSMC, search, filterCat, filterPos]);

  const getSMCReading = (val: number) => {
      if (val <= 3.0) return "Capacidade insuficiente";
      if (val <= 5.0) return "Em desenvolvimento";
      if (val <= 6.5) return "Funcional para composição";
      if (val <= 8.0) return "Boa prontidão competitiva";
      return "Alta prontidão para jogos";
  };

  const handleTransferRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!transferRg) return;
      setTransferLoading(true);
      try {
          const targetAthlete = allSystemAthletes.find(a => a.rg === transferRg.trim());
          if (!targetAthlete) { setFeedback({ type: 'error', message: 'Atleta não encontrado no sistema.' }); return; }
          if (targetAthlete.teamId === teamId) { setFeedback({ type: 'error', message: 'Este atleta já pertence ao seu time.' }); return; }
          await saveAthlete({ ...targetAthlete, pendingTransferTeamId: teamId });
          setFeedback({ type: 'success', message: `Solicitação enviada. A escola de origem de ${targetAthlete.name} precisa autorizar a saída.` });
          setShowTransferModal(false); setTransferRg(''); setRefreshKey(prev => prev + 1);
      } catch (err: any) { setFeedback({ type: 'error', message: `Erro: ${err.message}` }); } finally { setTransferLoading(false); }
  };

  const handleSendTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferOutRg || !transferOutTeamId) return;
    setSendTransferLoading(true);
    try {
        const targetAthlete = athletes.find(a => a.rg === transferOutRg.trim() && a.teamId === teamId);
        if (!targetAthlete) { setFeedback({ type: 'error', message: 'Atleta com este RG não encontrado na sua lista de jogadores.' }); return; }
        const targetTeam = allTeams.find(t => t.id === transferOutTeamId.trim());
        if (!targetTeam) { setFeedback({ type: 'error', message: 'ID do Time de destino não localizado no sistema.' }); return; }
        if (targetTeam.id === teamId) { setFeedback({ type: 'error', message: 'O time de destino não pode ser o mesmo time atual.' }); return; }
        await saveAthlete({ ...targetAthlete, pendingTransferTeamId: targetTeam.id });
        setFeedback({ type: 'success', message: `Solicitação de transferência para o time ${targetTeam.name} enviada com sucesso!` });
        setShowSendTransferModal(false); setTransferOutRg(''); setTransferOutTeamId(''); setRefreshKey(prev => prev + 1);
    } catch (err: any) { setFeedback({ type: 'error', message: `Erro: ${err.message}` }); } finally { setSendTransferLoading(false); }
  };

  const handleAcceptTransfer = async (athlete: Athlete) => {
      setLoading(true);
      try {
          const updatedAthlete: Athlete = { ...athlete, teamId: athlete.pendingTransferTeamId!, categoryId: null, pendingTransferTeamId: null };
          await saveAthlete(updatedAthlete);
          setFeedback({ type: 'success', message: `Atleta liberado com sucesso!` }); setRefreshKey(prev => prev + 1);
      } catch (err: any) { setFeedback({ type: 'error', message: `Erro ao liberar.` }); } finally { setLoading(false); }
  };

  const handleDeclineTransfer = async (athlete: Athlete) => {
      setLoading(true);
      try {
          await saveAthlete({ ...athlete, pendingTransferTeamId: null });
          setFeedback({ type: 'success', message: 'Solicitação recusada.' }); setRefreshKey(prev => prev + 1);
      } catch (err) { setFeedback({ type: 'error', message: 'Erro ao recusar.' }); } finally { setLoading(false); }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const url = await processImageUpload(file); setPreviewUrl(url);
      } catch (error) { setFeedback({ type: 'error', message: 'Erro na imagem.' }); }
      finally { setUploading(false); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) return;
    setLoading(true);
    try {
        const finalRg = formData.rg || `ID-${uuidv4().substring(0,8).toUpperCase()}`;
        const newAthlete: Athlete = {
          id: formData.id || uuidv4(), teamId, rg: finalRg, name: formData.name, categoryId: formData.categoryId,
          position: formData.position as Position, photoUrl: previewUrl || formData.photoUrl, 
          birthDate: formData.birthDate || new Date().toISOString().split('T')[0],
          responsibleName: formData.responsibleName || '', responsibleEmail: formData.responsibleEmail || '', responsiblePhone: formData.responsiblePhone || '',
          pendingTransferTeamId: null
        };
        await saveAthlete(newAthlete); setShowModal(false);
        setFormData({ name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsibleEmail: '', responsiblePhone: '', birthDate: '' });
        setPreviewUrl(''); setRefreshKey(prev => prev + 1); setFeedback({ type: 'success', message: 'Dados salvos com sucesso!' });
    } catch (err: any) { setFeedback({ type: 'error', message: 'Erro ao salvar.' }); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 relative transition-colors duration-300">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter flex items-center gap-2">
            <Users className="text-blue-600 dark:text-blue-400" /> Atletas
        </h2>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
          <div className="relative flex-1 md:min-w-[200px]">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
             <input type="text" placeholder="Buscar..." className="pl-9 pr-4 py-2 border border-gray-200 dark:border-darkBorder rounded-xl focus:ring-2 focus:ring-blue-500 w-full bg-white dark:bg-darkInput dark:text-gray-200 text-xs font-bold" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-darkBorder rounded-xl text-xs font-bold bg-white dark:bg-darkInput dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Todas Categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterPos} onChange={e=>setFilterPos(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-darkBorder rounded-xl text-xs font-bold bg-white dark:bg-darkInput dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Todas Posições</option>
              {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {currentUser && canEditData(currentUser.role) && (
            <div className="flex gap-2">
                <button onClick={() => setShowTransferModal(true)} className="bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors" title="Solicitar Transferência"><UserCheck size={18} /></button>
                <button onClick={() => setShowSendTransferModal(true)} className="bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors" title="Transferir Atleta"><Send size={18} /></button>
                <button onClick={() => { setFormData({position: Position.MEIO_CAMPO}); setPreviewUrl(''); setShowModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-md transition-all"><Plus size={16} /> Novo</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {filtered.map(athlete => {
           const isRequestToRelease = athlete.teamId === teamId && athlete.pendingTransferTeamId && athlete.pendingTransferTeamId !== teamId;
           const isWaitingForRelease = athlete.pendingTransferTeamId === teamId && athlete.teamId !== teamId;

           return (
           <div key={athlete.id} className={`rounded-[32px] shadow-sm border p-6 flex flex-col items-center hover:shadow-xl transition-all group relative ${isRequestToRelease ? 'border-amber-200 bg-amber-50/20 dark:border-amber-800 dark:bg-amber-900/10' : isWaitingForRelease ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-800 dark:bg-emerald-900/10' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder'}`}>
               
               {isRequestToRelease && (
                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 animate-bounce">
                       <Send size={10}/> Solicitação de Saída
                   </div>
               )}
               {isWaitingForRelease && (
                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg flex items-center gap-1 z-10">
                       <UserCheck size={10}/> Aguardando Liberação
                   </div>
               )}

               <div className="absolute top-4 right-4 flex gap-2">
                   {!isWaitingForRelease && (
                       <button onClick={() => { setFormData(athlete); setPreviewUrl(athlete.photoUrl || ''); setShowModal(true); }} className="p-2 bg-gray-50 dark:bg-darkInput text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit size={14}/></button>
                   )}
               </div>

               <Link to={isWaitingForRelease ? '#' : `/athletes/${athlete.id}`} className={`flex flex-col items-center w-full ${isWaitingForRelease ? 'cursor-default' : ''}`}>
                   <div className="relative mb-4">
                        {athlete.photoUrl ? <img src={athlete.photoUrl} className={`w-24 h-24 rounded-full object-cover border-4 shadow-sm ${isRequestToRelease ? 'border-amber-200 grayscale' : isWaitingForRelease ? 'border-emerald-200 opacity-50' : 'border-gray-50 dark:border-darkBorder'}`} /> : <div className="w-24 h-24 rounded-full bg-gray-50 dark:bg-darkInput flex items-center justify-center text-3xl font-black text-gray-200 dark:text-gray-700">{athlete.name.charAt(0)}</div>}
                   </div>
                   
                   <h3 className="font-black text-gray-800 dark:text-gray-100 text-center uppercase tracking-tighter truncate w-full">{athlete.name}</h3>
                   <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded mt-2 uppercase tracking-widest">{athlete.position}</span>
                   
                   {!isWaitingForRelease && (
                    <div className="mt-6 flex flex-col items-center p-4 bg-gray-50 dark:bg-darkInput rounded-2xl w-full border border-gray-100 dark:border-darkBorder group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-900/20 transition-all">
                        <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 block">Score SMC</span>
                        <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none">{athlete.smc.toFixed(1)}</span>
                        <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 mt-2 leading-tight uppercase tracking-widest text-center">{getSMCReading(athlete.smc)}</p>
                        {!athlete.isTechValid && (
                            <span className="mt-2 text-[7px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Dados Insuficientes</span>
                        )}
                    </div>
                   )}

                   <div className="flex flex-col items-center gap-1 mt-4">
                       <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                       <span className="text-[9px] text-gray-300 dark:text-gray-600 font-mono tracking-widest">RG: {athlete.rg}</span>
                   </div>
               </Link>

               {isRequestToRelease && (
                   <div className="mt-6 flex flex-col gap-2 w-full">
                       <button onClick={() => handleAcceptTransfer(athlete)} className="w-full bg-amber-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-md hover:bg-amber-700 transition-all active:scale-95"><CheckCircle size={14}/> Liberar Atleta</button>
                       <button onClick={() => handleDeclineTransfer(athlete)} className="w-full bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"><XCircle size={14}/> Recusar Saída</button>
                   </div>
               )}
           </div>
         )})}
      </div>
      {/* Modais de exclusão/transferência mantidos ... */}
    </div>
  );
};

export default AthletesList;
