
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
import { Athlete, Position, Category, User, canEditData, Team, EvaluationSession, TrainingEntry } from '../types';
import { Plus, Search, Upload, X, Users, Loader2, Edit, CheckCircle, AlertCircle, Target, XCircle, Send, UserCheck, HelpCircle, Save, ArrowDownWideNarrow } from 'lucide-react';
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
  const [trainingEntries, setTrainingEntries] = useState<TrainingEntry[]>([]); // New state for tactical data
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterPos, setFilterPos] = useState('all');
  const [sortOrder, setSortOrder] = useState<'alpha' | 'score' | 'tech' | 'phys' | 'tactical'>('alpha');
  
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
          const [a, c, evals, teams, entries] = await Promise.all([
              getAthletes(),
              getCategories(),
              getEvaluationSessions(),
              getTeams(),
              getTrainingEntries()
          ]);
          setAllSystemAthletes(a);
          setAllTeams(teams);
          const localAthletes = a.filter(item => item.teamId === teamId || item.pendingTransferTeamId === teamId);
          setAthletes(localAthletes);
          setCategories(c.filter(item => item.teamId === teamId));
          setEvalSessions(evals);
          setTrainingEntries(entries);
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
          
          // Cálculo Impacto Tático (Scout)
          const myEntries = trainingEntries.filter(e => e.athleteId === athlete.id);
          let totalTactical = 0;
          let tacticalCount = 0;
          myEntries.forEach(entry => {
              try {
                  const notes = JSON.parse(entry.notes || '{}');
                  if (notes.avgScore !== undefined) {
                      totalTactical += notes.avgScore;
                      tacticalCount++;
                  }
              } catch(e) {}
          });
          const avgTactical = tacticalCount > 0 ? totalTactical / tacticalCount : 0;

          const mt_norm = (avgTech / 5.0) * 10;
          const cf_norm = avgPhys / 10;
          const smc = (mt_norm * 0.55) + (cf_norm * 0.45);

          return { ...athlete, smc, avgTech, avgPhys, avgTactical, isTechValid: myEvals.length >= 2 };
      });
  }, [athletes, evalSessions, trainingEntries]);

  const filtered = useMemo(() => {
      let list = athletesWithSMC.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
      if (filterCat !== 'all') list = list.filter(a => a.categoryId === filterCat);
      if (filterPos !== 'all') list = list.filter(a => a.position === filterPos);
      
      return list.sort((a, b) => {
          if (sortOrder === 'score') return b.smc - a.smc;
          if (sortOrder === 'tech') return b.avgTech - a.avgTech;
          if (sortOrder === 'phys') return b.avgPhys - a.avgPhys;
          if (sortOrder === 'tactical') return b.avgTactical - a.avgTactical;
          return a.name.localeCompare(b.name);
      });
  }, [athletesWithSMC, search, filterCat, filterPos, sortOrder]);

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
          id: formData.id || uuidv4(), 
          teamId, 
          rg: finalRg, 
          name: formData.name!, 
          categoryId: formData.categoryId!,
          position: formData.position as Position, 
          photoUrl: previewUrl || formData.photoUrl, 
          birthDate: formData.birthDate || new Date().toISOString().split('T')[0],
          responsibleName: formData.responsibleName || '', 
          responsibleEmail: formData.responsibleEmail || '', 
          responsiblePhone: formData.responsiblePhone || '',
          pendingTransferTeamId: formData.pendingTransferTeamId || null
        };
        await saveAthlete(newAthlete); 
        setShowModal(false);
        setFormData({ name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsibleEmail: '', responsiblePhone: '', birthDate: '' });
        setPreviewUrl(''); setRefreshKey(prev => prev + 1); setFeedback({ type: 'success', message: 'Dados salvos com sucesso!' });
    } catch (err: any) { setFeedback({ type: 'error', message: 'Erro ao salvar.' }); } finally { setLoading(false); }
  };

  const handleEditClick = (e: React.MouseEvent, athlete: Athlete) => {
      e.preventDefault();
      e.stopPropagation();
      setFormData(athlete);
      setPreviewUrl(athlete.photoUrl || '');
      setShowModal(true);
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
          
          <div className="relative">
             <select 
               value={sortOrder} 
               onChange={e => setSortOrder(e.target.value as 'alpha' | 'score' | 'tech' | 'phys' | 'tactical')} 
               className="pl-8 pr-3 py-2 border border-gray-200 dark:border-darkBorder rounded-xl text-xs font-bold bg-white dark:bg-darkInput dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
             >
                 <option value="alpha">Ordem Alfabética</option>
                 <option value="score">Ranking SMC</option>
                 <option value="tactical">Impacto Tático</option>
                 <option value="tech">Média Técnica</option>
                 <option value="phys">Condição Física</option>
             </select>
             <ArrowDownWideNarrow className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
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

               <div className="absolute top-4 right-4 flex gap-2 z-20">
                   {!isWaitingForRelease && currentUser && canEditData(currentUser.role) && (
                       <button onClick={(e) => handleEditClick(e, athlete)} className="p-2 bg-white dark:bg-darkInput text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors shadow-sm border border-gray-100 dark:border-darkBorder"><Edit size={14}/></button>
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
                        {sortOrder === 'tactical' ? (
                            <>
                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1 block">Impacto Tático</span>
                                <span className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tighter leading-none">{(athlete as any).avgTactical.toFixed(2)}</span>
                            </>
                        ) : sortOrder === 'tech' ? (
                            <>
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1 block">Média Técnica</span>
                                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter leading-none">{(athlete as any).avgTech.toFixed(1)}</span>
                            </>
                        ) : sortOrder === 'phys' ? (
                            <>
                                <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-1 block">Condição Física</span>
                                <span className="text-3xl font-black text-orange-600 dark:text-orange-400 tracking-tighter leading-none">{(athlete as any).avgPhys.toFixed(0)}%</span>
                            </>
                        ) : (
                            <>
                                <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 block">Score SMC</span>
                                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none">{athlete.smc.toFixed(1)}</span>
                                <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 mt-2 leading-tight uppercase tracking-widest text-center">{getSMCReading(athlete.smc)}</p>
                            </>
                        )}
                        {!athlete.isTechValid && sortOrder === 'score' && (
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

      {/* MODAL CADASTRAR/EDITAR ATLETA */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-4xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 dark:border-darkBorder pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 dark:text-gray-100">
                    <div className={`p-2 rounded-xl text-white ${formData.id ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                        {formData.id ? <Edit size={24}/> : <Plus size={24}/>}
                    </div>
                    {formData.id ? 'Editar Cadastro do Atleta' : 'Novo Atleta'}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-12">
                 <div className="flex flex-col items-center">
                    <div className="w-32 h-32 bg-gray-50 dark:bg-darkInput rounded-full flex items-center justify-center mb-4 overflow-hidden border-4 border-dashed border-gray-200 dark:border-darkBorder shadow-inner relative">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (previewUrl || formData.photoUrl ? <img src={previewUrl || formData.photoUrl} className="w-full h-full object-cover" /> : <Users size={48} className="text-gray-200 dark:text-gray-700" />)}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-5 py-2.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all shadow-sm ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Processando...' : <><Upload size={14} /> Carregar Foto</>}
                       <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleImageChange} />
                    </label>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-gray-800 dark:text-gray-100">
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-indigo-50 dark:border-darkBorder"><HelpCircle size={14} className="text-indigo-400"/><h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Identificação</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label><input required type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label><input type="date" required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} /></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG / Identificador</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.rg} onChange={e => setFormData({...formData, rg: e.target.value})} required /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value as Position})}>{Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                            <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label><select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.categoryId || ''} onChange={e => setFormData({...formData, categoryId: e.target.value})}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-1 border-b-2 border-emerald-50 dark:border-darkBorder"><Target size={14} className="text-emerald-400"/><h4 className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Responsáveis</h4></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Responsável</label><input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" value={formData.responsibleName} onChange={e => setFormData({...formData, responsibleName: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail para Contato</label><input type="email" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.responsibleEmail} onChange={e => setFormData({...formData, responsibleEmail: e.target.value})} /></div>
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone WhatsApp</label><input type="tel" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={formData.responsiblePhone} onChange={e => setFormData({...formData, responsiblePhone: e.target.value})} /></div>
                    </div>
                 </div>
                 <div className="flex justify-end pt-6">
                    <button type="submit" disabled={uploading || loading} className="w-full md:w-auto bg-indigo-600 text-white font-black py-4 px-12 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 border-b-4 border-indigo-900">
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} {loading ? 'Gravando...' : 'Salvar Atleta'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* MODAL SOLICITAR TRANSFERENCIA (DE FORA PARA O MEU CLUBE) */}
      {showTransferModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400 shadow-inner"><UserCheck size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Solicitar Atleta</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-6 font-bold uppercase tracking-widest leading-relaxed">Insira o RG do atleta para solicitar a transferência dele para sua escola.</p>
                  <form onSubmit={handleTransferRequest} className="space-y-4">
                      <input autoFocus type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-5 text-center font-mono font-black text-xl uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="RG DO ATLETA" value={transferRg} onChange={e => setTransferRg(e.target.value)} required />
                      <button type="submit" disabled={transferLoading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95">
                         {transferLoading ? <Loader2 className="animate-spin" size={18}/> : 'Enviar Solicitação'}
                      </button>
                  </form>
                  <button onClick={() => setShowTransferModal(false)} className="mt-8 text-[10px] font-black text-gray-400 dark:text-gray-500 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {/* MODAL TRANSFERIR ATLETA (DO MEU CLUBE PARA OUTRO) */}
      {showSendTransferModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600 dark:text-amber-400 shadow-inner"><Send size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Enviar Atleta</h2>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-6 font-bold uppercase tracking-widest leading-relaxed">Transfira um atleta da sua escola para outro clube informando o RG e o ID do Clube receptor.</p>
                  <form onSubmit={handleSendTransfer} className="space-y-4 text-left">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG do seu Atleta</label>
                        <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-4 font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-amber-500" placeholder="RG" value={transferOutRg} onChange={e => setTransferOutRg(e.target.value)} required />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">ID do Clube Destino</label>
                        <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-4 font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-amber-500" placeholder="ID DO CLUBE" value={transferOutTeamId} onChange={e => setTransferOutTeamId(e.target.value)} required />
                      </div>
                      <button type="submit" disabled={sendTransferLoading} className="w-full bg-amber-600 text-white font-black py-4 rounded-2xl hover:bg-amber-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95 mt-4">
                         {sendTransferLoading ? <Loader2 className="animate-spin" size={18}/> : 'Realizar Transferência'}
                      </button>
                  </form>
                  <button onClick={() => setShowSendTransferModal(false)} className="mt-8 text-[10px] font-black text-gray-400 dark:text-gray-500 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {/* FEEDBACK POPUP */}
      {feedback && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full text-center border border-indigo-50">
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner ${feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {feedback.type === 'success' ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                 </div>
                 <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">{feedback.type === 'success' ? 'Sucesso!' : 'Atenção'}</h3>
                 <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mb-8">{feedback.message}</p>
                 <button onClick={() => setFeedback(null)} className={`text-white font-black py-4 px-12 rounded-2xl transition-all w-full shadow-lg uppercase tracking-widest text-[11px] active:scale-95 ${feedback.type === 'success' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}>Entendido</button>
             </div>
         </div>
      )}
    </div>
  );
};

export default AthletesList;
