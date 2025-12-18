
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  getAthletes, 
  getCategories, 
  saveAthlete, 
  getEvaluationSessions 
} from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, User, canEditData, Team, EvaluationSession } from '../types';
import { Plus, Search, Upload, X, Users, Loader2, Edit, ArrowRightLeft, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allSystemAthletes, setAllSystemAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evals, setEvals] = useState<EvaluationSession[]>([]);
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

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', rg: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsibleEmail: '', responsiblePhone: '', birthDate: ''
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));

    const load = async () => {
        setLoading(true);
        const [a, c, ev] = await Promise.all([
            getAthletes(),
            getCategories(),
            getEvaluationSessions()
        ]);
        setAllSystemAthletes(a);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setEvals(ev);
        setLoading(false);
    };
    load();
  }, [teamId, showModal, refreshKey]);

  const athletesWithScores = useMemo(() => {
    return athletes.map(a => {
        const myEvals = evals.filter(e => e.athleteId === a.id);
        const avg = myEvals.length > 0 ? myEvals.reduce((acc, curr) => acc + curr.scoreTecnico, 0) / myEvals.length : 0;
        return { ...a, avgTech: avg };
    });
  }, [athletes, evals]);

  const filtered = useMemo(() => {
      let list = athletesWithScores.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
      if (filterCat !== 'all') list = list.filter(a => a.categoryId === filterCat);
      if (filterPos !== 'all') list = list.filter(a => a.position === filterPos);
      return list;
  }, [athletesWithScores, search, filterCat, filterPos]);

  // ... (restante das funções handleTransferRequest, handleImageChange, handleSubmit permanecem iguais)

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2"><Users className="text-blue-600" /> Atletas do Clube</h2>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
          <div className="relative flex-1 md:min-w-[200px]">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
             <input type="text" placeholder="Nome..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 w-full bg-white text-xs font-bold" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Todas Categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {currentUser && canEditData(currentUser.role) && (
            <div className="flex gap-2">
                <button onClick={() => setShowTransferModal(true)} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 p-2.5 rounded-xl border border-indigo-200 transition-colors" title="Solicitar Transferência"><ArrowRightLeft size={18} /></button>
                <button onClick={() => { setFormData({position: Position.MEIO_CAMPO}); setPreviewUrl(''); setShowModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-md transition-all"><Plus size={16} /> Novo Atleta</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {filtered.map(athlete => (
           <div key={athlete.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col items-center hover:shadow-xl transition-all group relative">
               <div className="absolute top-4 right-4 flex gap-2">
                   <button onClick={() => { setFormData(athlete); setPreviewUrl(athlete.photoUrl || ''); setShowModal(true); }} className="p-2 bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit size={14}/></button>
               </div>
               <Link to={`/athletes/${athlete.id}`} className="flex flex-col items-center w-full">
                   <div className="relative mb-4">
                       {athlete.photoUrl ? <img src={athlete.photoUrl} className="w-24 h-24 rounded-full object-cover border-4 border-gray-50 shadow-sm" /> : <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center text-3xl font-black text-gray-200">{athlete.name.charAt(0)}</div>}
                       <div className="absolute -bottom-2 right-0 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full border-2 border-white shadow-md">{athlete.avgTech.toFixed(1)}</div>
                   </div>
                   <h3 className="font-black text-gray-800 text-center uppercase tracking-tighter truncate w-full">{athlete.name}</h3>
                   <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mt-2 uppercase tracking-widest">{athlete.position}</span>
                   <div className="flex flex-col items-center gap-1 mt-3">
                       <span className="text-[10px] text-gray-400 font-bold">{categories.find(c=>c.id===athlete.categoryId)?.name || '--'}</span>
                       <span className="text-[9px] text-gray-300 font-mono tracking-widest">RG: {athlete.rg}</span>
                   </div>
               </Link>
           </div>
         ))}
      </div>

      {/* ... (restante do arquivo modalType success/error/transfer/newAthlete) */}
    </div>
  );
};

export default AthletesList;
