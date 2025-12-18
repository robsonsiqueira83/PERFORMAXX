
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  getAthletes, 
  getCategories, 
  saveAthlete, 
  getTeams,
  getEvaluationSessions
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, User, canEditData, Team, EvaluationSession } from '../types';
import { Plus, Search, Upload, X, Users, Loader2, Edit, ArrowRightLeft, CheckCircle, AlertCircle, Target, XCircle, Info, Send, UserCheck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allSystemAthletes, setAllSystemAthletes] = useState<Athlete[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationSession[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterPos, setFilterPos] = useState('all');
  
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Transferência (Entrada / Vincular)
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRg, setTransferRg] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Transferência (Saída / Enviar)
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
          const [a, c, ev, teams] = await Promise.all([
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
          setEvaluations(ev);
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

  const filtered = useMemo(() => {
      let list = athletes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
      if (filterCat !== 'all') list = list.filter(a => a.categoryId === filterCat);
      if (filterPos !== 'all') list = list.filter(a => a.position === filterPos);
      
      return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes, search, filterCat, filterPos]);

  const getAthleteTechScore = (athleteId: string) => {
      const athleteEvals = evaluations.filter(ev => ev.athleteId === athleteId);
      if (athleteEvals.length === 0) return null;
      return (athleteEvals.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / athleteEvals.length).toFixed(1);
  };

  const handleTransferRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!transferRg) return;
      setTransferLoading(true);
      try {
          const targetAthlete = allSystemAthletes.find(a => a.rg === transferRg.trim());
          if (!targetAthlete) {
              setFeedback({ type: 'error', message: 'Atleta não encontrado no sistema.' });
              return;
          }
          if (targetAthlete.teamId === teamId) {
              setFeedback({ type: 'error', message: 'Este atleta já pertence ao seu time.' });
              return;
          }
          
          await saveAthlete({ ...targetAthlete, pendingTransferTeamId: teamId });
          setFeedback({ type: 'success', message: `Solicitação enviada. A escola de origem de ${targetAthlete.name} precisa autorizar a saída.` });
          setShowTransferModal(false);
          setTransferRg('');
          setRefreshKey(prev => prev + 1);
      } catch (err: any) { 
          setFeedback({ type: 'error', message: `Erro: ${err.message}` }); 
      } finally { 
          setTransferLoading(false); 
      }
  };

  const handleSendTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferOutRg || !transferOutTeamId) return;
    setSendTransferLoading(true);
    try {
        // Busca o atleta no time atual pelo RG
        const targetAthlete = athletes.find(a => a.rg === transferOutRg.trim() && a.teamId === teamId);
        if (!targetAthlete) {
            setFeedback({ type: 'error', message: 'Atleta com este RG não encontrado na sua lista de jogadores.' });
            return;
        }

        // Valida se o time de destino existe
        const targetTeam = allTeams.find(t => t.id === transferOutTeamId.trim());
        if (!targetTeam) {
            setFeedback({ type: 'error', message: 'ID do Time de destino não localizado no sistema.' });
            return;
        }

        if (targetTeam.id === teamId) {
            setFeedback({ type: 'error', message: 'O time de destino não pode ser o mesmo time atual.' });
            return;
        }
        
        await saveAthlete({ ...targetAthlete, pendingTransferTeamId: targetTeam.id });
        setFeedback({ type: 'success', message: `Solicitação de transferência para o time ${targetTeam.name} enviada com sucesso!` });
        setShowSendTransferModal(false);
        setTransferOutRg('');
        setTransferOutTeamId('');
        setRefreshKey(prev => prev + 1);
    } catch (err: any) { 
        setFeedback({ type: 'error', message: `Erro: ${err.message}` }); 
    } finally { 
        setSendTransferLoading(false); 
    }
  };

  const handleAcceptTransfer = async (athlete: Athlete) => {
      setLoading(true);
      try {
          const updatedAthlete: Athlete = { 
              ...athlete, 
              teamId: athlete.pendingTransferTeamId!, 
              categoryId: null, 
              pendingTransferTeamId: null 
          };
          await saveAthlete(updatedAthlete);
          setFeedback({ type: 'success', message: `Atleta liberado com sucesso!` });
          setRefreshKey(prev => prev + 1);
      } catch (err: any) {
          setFeedback({ type: 'error', message: `Erro ao liberar.` });
      } finally {
          setLoading(false);
      }
  };

  const handleDeclineTransfer = async (athlete: Athlete) => {
      setLoading(true);
      try {
          await saveAthlete({ ...athlete, pendingTransferTeamId: null });
          setFeedback({ type: 'success', message: 'Solicitação recusada.' });
          setRefreshKey(prev => prev + 1);
      } catch (err) {
          setFeedback({ type: 'error', message: 'Erro ao recusar.' });
      } finally {
          setLoading(false);
      }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const url = await processImageUpload(file);
        setPreviewUrl(url);
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
          responsibleName: formData.responsibleName || '',
          responsibleEmail: formData.responsibleEmail || '',
          responsiblePhone: formData.responsiblePhone || '',
          pendingTransferTeamId: null
        };
        await saveAthlete(newAthlete);
        setShowModal(false);
        setFormData({ name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsibleEmail: '', responsiblePhone: '', birthDate: '' });
        setPreviewUrl('');
        setRefreshKey(prev => prev + 1);
        setFeedback({ type: 'success', message: 'Dados salvos com sucesso!' });
    } catch (err: any) { setFeedback({ type: 'error', message: 'Erro ao salvar.' }); }
    finally { setLoading(false); }
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
                <button onClick={() => setShowTransferModal(true)} className="bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors" title="Solicitar Transferência (Vincular Atleta Externo)"><UserCheck size={18} /></button>
                <button onClick={() => setShowSendTransferModal(true)} className="bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors" title="Transferir Atleta (Enviar para outro Time)"><Send size={18} /></button>
                <button onClick={() => { setFormData({position: Position.MEIO_CAMPO}); setPreviewUrl(''); setShowModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-md transition-all"><Plus size={16} /> Novo</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {filtered.map(athlete => {
           const score = getAthleteTechScore(athlete.id);
           const isRequestToRelease = athlete.teamId === teamId && athlete.pendingTransferTeamId && athlete.pendingTransferTeamId !== teamId;
           const isWaitingForRelease = athlete.pendingTransferTeamId === teamId && athlete.teamId !== teamId;

           return (
           <div key={athlete.id} className={`rounded-3xl shadow-sm border p-6 flex flex-col items-center hover:shadow-xl transition-all group relative ${isRequestToRelease ? 'border-amber-200 bg-amber-50/20 dark:border-amber-800 dark:bg-amber-900/10' : isWaitingForRelease ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-800 dark:bg-emerald-900/10' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder'}`}>
               
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
                        {isWaitingForRelease && <div className="absolute inset-0 flex items-center justify-center"><Info className="text-emerald-600" size={32} /></div>}
                   </div>
                   
                   <h3 className="font-black text-gray-800 dark:text-gray-100 text-center uppercase tracking-tighter truncate w-full">{athlete.name}</h3>
                   <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded mt-2 uppercase tracking-widest">{athlete.position}</span>
                   
                   {!isWaitingForRelease && (
                    <div className="mt-4 flex flex-col items-center p-2 bg-gray-50 dark:bg-darkInput rounded-2xl w-full border border-gray-100 dark:border-darkBorder group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-900/20 transition-colors">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Target size={10} className="text-emerald-500"/> Média Técnica</span>
                        <span className={`text-xl font-black ${score ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-700'}`}>{score || '--'}</span>
                    </div>
                   )}

                   <div className="flex flex-col items-center gap-1 mt-3">
                       <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                       <span className="text-[9px] text-gray-300 dark:text-gray-600 font-mono tracking-widest">RG: {athlete.rg}</span>
                   </div>
               </Link>

               {isRequestToRelease && (
                   <div className="mt-6 flex flex-col gap-2 w-full">
                       <button onClick={() => handleAcceptTransfer(athlete)} className="w-full bg-amber-600 text-white py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-md hover:bg-amber-700 transition-all active:scale-95"><CheckCircle size={14}/> Liberar Atleta</button>
                       <button onClick={() => handleDeclineTransfer(athlete)} className="w-full bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"><XCircle size={14}/> Recusar Saída</button>
                   </div>
               )}
               
               {isWaitingForRelease && (
                   <div className="mt-4 p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center w-full animate-pulse">
                       <span className="text-[8px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Aguardando liberação...</span>
                   </div>
               )}
           </div>
         )})}
      </div>

      {showTransferModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400 shadow-inner"><UserCheck size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Vincular Atleta</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-8 font-black uppercase tracking-widest leading-relaxed">Informe o RG para solicitar a transferência.</p>
                  <form onSubmit={handleTransferRequest} className="space-y-4">
                      <input autoFocus type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-5 text-center font-mono font-black text-xl uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="RG-000000" value={transferRg} onChange={e => setTransferRg(e.target.value)} required />
                      <button type="submit" disabled={transferLoading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95">
                         {transferLoading ? <Loader2 className="animate-spin" size={18}/> : 'Pesquisar e Vincular'}
                      </button>
                  </form>
                  <button onClick={() => setShowTransferModal(false)} className="mt-8 text-[10px] font-black text-gray-400 dark:text-gray-500 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {showSendTransferModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-md p-10 shadow-2xl text-center animate-slide-up">
                  <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-600 dark:text-amber-400 shadow-inner"><Send size={36} /></div>
                  <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Transferir Atleta</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-8 font-black uppercase tracking-widest leading-relaxed">Escolha um atleta do seu time e o ID da escola destino.</p>
                  <form onSubmit={handleSendTransfer} className="space-y-4">
                      <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1 text-left">RG DO ATLETA (DO SEU TIME)</label>
                          <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-4 text-center font-mono font-black text-lg uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-500 shadow-inner" placeholder="RG-000000" value={transferOutRg} onChange={e => setTransferOutRg(e.target.value)} required />
                      </div>
                      <div>
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1 text-left">ID DO TIME DESTINO (UUID)</label>
                          <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-2xl p-4 text-center font-mono font-black text-lg uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-500 shadow-inner" placeholder="UUID-TIME" value={transferOutTeamId} onChange={e => setTransferOutTeamId(e.target.value)} required />
                      </div>
                      <button type="submit" disabled={sendTransferLoading} className="w-full bg-amber-600 text-white font-black py-4 rounded-2xl hover:bg-amber-700 transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[11px] active:scale-95">
                         {sendTransferLoading ? <Loader2 className="animate-spin" size={18}/> : 'Solicitar Envio de Atleta'}
                      </button>
                  </form>
                  <button onClick={() => setShowSendTransferModal(false)} className="mt-8 text-[10px] font-black text-gray-400 dark:text-gray-500 hover:text-gray-600 uppercase tracking-widest">Cancelar</button>
              </div>
          </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-[40px] w-full max-w-3xl p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center mb-10 border-b border-gray-100 dark:border-darkBorder pb-5">
                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 dark:text-gray-100">
                    <div className={`p-2 rounded-xl text-white ${formData.id ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                        {formData.id ? <Edit size={24}/> : <Plus size={24}/>}
                    </div>
                    {formData.id ? 'Editar Atleta' : 'Novo Atleta'}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-gray-300 hover:text-red-500"><X size={28}/></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-8">
                 <div className="flex flex-col items-center">
                    <div className="w-32 h-32 bg-gray-50 dark:bg-darkInput rounded-full flex items-center justify-center mb-4 overflow-hidden border-4 border-dashed border-gray-200 dark:border-darkBorder shadow-inner relative">
                       {uploading ? <Loader2 className="animate-spin text-blue-600" size={32} /> : (previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Users size={48} className="text-gray-200 dark:text-gray-700" />)}
                    </div>
                    <label className={`cursor-pointer text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all ${uploading ? 'opacity-50' : ''}`}>
                       {uploading ? 'Aguarde...' : <><Upload size={14} /> Carregar Foto</>}
                       <input type="file" className="hidden" accept="image/*" disabled={uploading} onChange={handleImageChange} />
                    </label>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-gray-800 dark:text-gray-100">
                    <div className="space-y-5">
                        <h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] border-b dark:border-darkBorder pb-1">Identificação</h4>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome Completo</label>
                           <input required type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nascimento</label>
                                <input type="date" required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">RG</label>
                                <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="Automático" value={formData.rg} onChange={e => setFormData({...formData, rg: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Posição</label>
                                <select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value as Position})}>
                                    {Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Categoria</label>
                                <select required className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <h4 className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] border-b dark:border-darkBorder pb-1">Responsáveis</h4>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Nome do Responsável</label>
                           <input type="text" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.responsibleName} onChange={e => setFormData({...formData, responsibleName: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">E-mail</label>
                           <input type="email" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.responsibleEmail} onChange={e => setFormData({...formData, responsibleEmail: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Telefone</label>
                           <input type="tel" className="w-full bg-gray-50 dark:bg-darkInput border border-gray-100 dark:border-darkBorder rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" value={formData.responsiblePhone} onChange={e => setFormData({...formData, responsiblePhone: e.target.value})} />
                        </div>
                    </div>
                 </div>

                 <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl uppercase tracking-widest text-xs transition-all hover:bg-indigo-700 disabled:opacity-50 active:scale-95">
                    {loading ? 'Processando...' : 'Salvar Cadastro'}
                 </button>
              </form>
           </div>
        </div>
      )}

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
