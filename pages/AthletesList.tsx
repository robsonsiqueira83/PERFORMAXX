import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAthletes, getCategories, saveAthlete, getTrainingEntries } from '../services/storageService';
import { processImageUpload } from '../services/imageService';
import { Athlete, Position, Category, getCalculatedCategory, calculateTotalScore } from '../types';
import { Plus, Search, Upload, X, Users, Filter, ArrowUpDown, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AthletesListProps {
  teamId: string;
}

const AthletesList: React.FC<AthletesListProps> = ({ teamId }) => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<any[]>([]); // To calc scores
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('registration'); // registration, score, age, alpha
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState<Partial<Athlete>>({
    name: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: ''
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        const [a, c, e] = await Promise.all([
            getAthletes(),
            getCategories(),
            getTrainingEntries()
        ]);
        setAthletes(a.filter(item => item.teamId === teamId));
        setCategories(c.filter(item => item.teamId === teamId));
        setEntries(e);
        setLoading(false);
    };
    load();
  }, [teamId, showModal]);

  // 1. Attach Meta Data (Score) to Athletes
  const athletesWithMeta = useMemo(() => {
    return athletes.map(athlete => {
        const athleteEntries = entries.filter(e => e.athleteId === athlete.id);
        let averageScore = 0;
        
        if (athleteEntries.length > 0) {
            // Added curr.tactical to ensure correct average calculation
            const total = athleteEntries.reduce((acc, curr) => acc + calculateTotalScore(curr.technical, curr.physical, curr.tactical), 0);
            averageScore = total / athleteEntries.length;
        }

        return {
            ...athlete,
            averageScore
        };
    });
  }, [athletes, entries]);

  // 2. Filter
  const filtered = athletesWithMeta.filter(a => {
    const matchesName = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? a.categoryId === categoryFilter : true;
    return matchesName && matchesCategory;
  });

  // 3. Sort
  const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
          case 'score':
              return b.averageScore - a.averageScore; // Descending
          case 'age':
              return new Date(b.birthDate).getTime() - new Date(a.birthDate).getTime();
          case 'alpha':
              return a.name.localeCompare(b.name);
          case 'registration':
          default:
               return 0; 
      }
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const url = await processImageUpload(e.target.files[0]);
        setPreviewUrl(url);
      } catch (error) {
        alert('Erro ao processar imagem');
      }
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    // Update state synchronously to allow typing
    setFormData(prev => ({ ...prev, birthDate: newDate }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) return;

    // Use current date (YYYY-MM-DD) if none selected
    const dateToSave = formData.birthDate || new Date().toISOString().split('T')[0];

    const newAthlete: Athlete = {
      id: uuidv4(),
      teamId,
      name: formData.name,
      categoryId: formData.categoryId,
      position: formData.position as Position,
      photoUrl: previewUrl,
      birthDate: dateToSave,
      responsibleName: formData.responsibleName || '',
      responsiblePhone: formData.responsiblePhone || ''
    };
    
    await saveAthlete(newAthlete);
    setShowModal(false);
    setFormData({ name: '', position: Position.MEIO_CAMPO, categoryId: '', responsibleName: '', responsiblePhone: '', birthDate: '' });
    setPreviewUrl('');
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 rounded p-2 text-black focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-blue-600" /> Atletas
        </h2>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto flex-wrap">
          
          {/* Category Filter */}
          <div className="relative w-full md:w-auto">
             <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <select 
               className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full md:w-40 bg-gray-100 text-black appearance-none"
               value={categoryFilter}
               onChange={(e) => setCategoryFilter(e.target.value)}
             >
               <option value="">Categoria (Todas)</option>
               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
             </select>
          </div>

          {/* Sort Select */}
          <div className="relative w-full md:w-auto">
             <ArrowUpDown className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <select 
               className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full md:w-40 bg-gray-100 text-black appearance-none"
               value={sortBy}
               onChange={(e) => setSortBy(e.target.value)}
             >
               <option value="registration">Cadastro (Recente)</option>
               <option value="score">Melhor Score</option>
               <option value="age">Idade (Jovem-Velho)</option>
               <option value="alpha">Alfabética (A-Z)</option>
             </select>
          </div>

          {/* Name Search */}
          <div className="relative flex-1 min-w-[200px]">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Buscar atleta..." 
               className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full bg-gray-100 text-black"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
          </div>

          <button 
            onClick={() => setShowModal(true)}
            className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 whitespace-nowrap w-full md:w-auto"
          >
            <Plus size={18} /> Novo Atleta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {sorted.map(athlete => (
           <Link to={`/athletes/${athlete.id}`} key={athlete.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center hover:shadow-md transition-shadow group relative">
               
               {/* Score Badge */}
               <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full border ${
                   athlete.averageScore >= 8 ? 'bg-green-100 text-green-800 border-green-200' :
                   athlete.averageScore >= 4 ? 'bg-gray-100 text-gray-600 border-gray-200' :
                   athlete.averageScore > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-100'
               }`}>
                   {athlete.averageScore > 0 ? athlete.averageScore.toFixed(1) : '-'}
               </div>

               {athlete.photoUrl ? (
                 <img src={athlete.photoUrl} alt={athlete.name} className="w-24 h-24 rounded-full object-cover mb-3 group-hover:scale-105 transition-transform" />
               ) : (
                 <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-gray-400 mb-3 group-hover:scale-105 transition-transform">
                    {athlete.name.charAt(0)}
                 </div>
               )}
               <h3 className="font-bold text-gray-800 text-center">{athlete.name}</h3>
               <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 font-semibold">{athlete.position}</span>
               
               <div className="flex gap-1 mt-2">
                   <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-100">
                       {getCalculatedCategory(athlete.birthDate)}
                   </span>
               </div>
           </Link>
         ))}
         {sorted.length === 0 && (
             <div className="col-span-full text-center py-10 text-gray-500">
                 Nenhum atleta encontrado com os filtros selecionados.
             </div>
         )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h3 className="text-xl font-bold flex items-center gap-2"><Plus className="text-green-500"/> Cadastrar Atleta</h3>
                <button onClick={() => setShowModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="flex flex-col items-center mb-4">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-2 overflow-hidden relative border-2 border-dashed border-gray-300">
                       {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <Users size={32} className="text-gray-400" />}
                    </div>
                    <label className="cursor-pointer text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800">
                       <Upload size={14} /> Carregar Foto
                       <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                    <span className="text-xs text-gray-400 mt-1">Max: 150x150px, 200kb</span>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Nome Completo</label>
                   <input required type="text" className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Data Nasc.</label>
                      <input type="date" className={inputClass} value={formData.birthDate} onChange={handleDateChange} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Categoria</label>
                      <select required className={inputClass} value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                         <option value="">Selecione...</option>
                         {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-gray-700 mb-1">Posição</label>
                   <select className={inputClass} value={formData.position} onChange={e => setFormData({...formData, position: e.target.value as Position})}>
                      {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                   </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Responsável</label>
                     <input type="text" className={inputClass} value={formData.responsibleName} onChange={e => setFormData({...formData, responsibleName: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                     <input type="text" className={inputClass} value={formData.responsiblePhone} onChange={e => setFormData({...formData, responsiblePhone: e.target.value})} />
                   </div>
                 </div>

                 <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 hover:bg-blue-700 transition-colors">
                    Cadastrar
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default AthletesList;