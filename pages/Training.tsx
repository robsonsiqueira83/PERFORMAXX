
// Fix: Added explicit typing to the reduce call to resolve arithmetic operation errors on unknown types.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getAthletes, getCategories, saveTrainingEntry, saveTrainingSession, getTrainingSessions
} from '../services/storageService';
import { Athlete, Category, TrainingEntry, TrainingSession, Position, User, canEditData } from '../types';
import { Save, Users, ClipboardList, Loader2, Search, Target, AlertOctagon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TECH_CONFIG = [
    { fundamento: 'Passe', subs: ['Curto', 'Médio', 'Longo'] },
    { fundamento: 'Domínio e Controle', subs: ['Orientado', 'Sob pressão'] },
    { fundamento: 'Condução', subs: ['Espaço curto', 'Progressão'] },
    { fundamento: 'Finalização', subs: ['Bola rolando', 'Primeira finalização'] },
    { fundamento: '1x1 Ofensivo', subs: ['Drible curto', 'Mudança de direção'] },
    { fundamento: '1x1 Defensivo', subs: ['Desarme', 'Postura corporal'] }
];

interface TrainingProps {
  teamId: string;
}

const Training: React.FC<TrainingProps> = ({ teamId }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [techScores, setTechScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
    const init = async () => {
        setLoading(true);
        const [c, a] = await Promise.all([getCategories(), getAthletes()]);
        setCategories(c.filter(item => item.teamId === teamId));
        setAllAthletes(a.filter(item => item.teamId === teamId));
        setLoading(false);
    };
    init();
  }, [teamId]);

  useEffect(() => {
    if (selectedCategory && date) {
      let filtered = allAthletes.filter(a => a.categoryId === selectedCategory);
      if (selectedPosition) filtered = filtered.filter(a => a.position === selectedPosition);
      if (searchTerm) filtered = filtered.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
      setAthletes(filtered);
      const checkSession = async () => {
          const s = await getTrainingSessions();
          const existingSessions = s.filter(s => s.date === date && s.categoryId === selectedCategory && s.teamId === teamId);
          setCurrentSessionId(existingSessions.length > 0 ? existingSessions[0].id : null);
      };
      checkSession();
    } else {
      setAthletes([]);
      setCurrentSessionId(null);
    }
    setSelectedAthlete(null);
  }, [selectedCategory, date, teamId, allAthletes, selectedPosition, searchTerm]);

  const handleSelectAthlete = (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    setTechScores({});
    setNotes('');
  };

  const handleSaveEntry = async () => {
    if (!selectedAthlete || !selectedCategory || !date) return;
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
        sessionIdToUse = uuidv4();
        await saveTrainingSession({ id: sessionIdToUse, date, categoryId: selectedCategory, teamId, description: 'Atuação de Treino' });
        setCurrentSessionId(sessionIdToUse);
    }

    // Fix: Explicitly cast values to number array and type the reduce parameters to avoid arithmetic operation errors on unknown types
    const avgScore = Object.values(techScores).length > 0 
        ? (Object.values(techScores) as number[]).reduce((a: number, b: number) => a + b, 0) / Object.values(techScores).length 
        : 5;

    const entry: TrainingEntry = {
      id: uuidv4(), sessionId: sessionIdToUse, athleteId: selectedAthlete.id,
      technical: {
        controle_bola: techScores['Domínio e Controle|Orientado'] || avgScore,
        conducao: techScores['Condução|Progressão'] || avgScore,
        passe: techScores['Passe|Curto'] || avgScore,
        recepcao: techScores['Domínio e Controle|Sob pressão'] || avgScore,
        drible: techScores['1x1 Ofensivo|Drible curto'] || avgScore,
        finalizacao: techScores['Finalização|Bola rolando'] || avgScore,
        cruzamento: avgScore,
        desarme: techScores['1x1 Defensivo|Desarme'] || avgScore,
        interceptacao: techScores['1x1 Defensivo|Postura corporal'] || avgScore
      },
      physical: { velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5 },
      tactical: {
        def_posicionamento: avgScore, def_pressao: avgScore, def_cobertura: avgScore, def_fechamento: avgScore, def_temporizacao: avgScore, def_desarme_tatico: avgScore, def_reacao: avgScore,
        const_qualidade_passe: techScores['Passe|Médio'] || avgScore, const_visao: avgScore, const_apoios: avgScore, const_mobilidade: avgScore, const_circulacao: avgScore, const_quebra_linhas: avgScore, const_tomada_decisao: avgScore,
        ult_movimentacao: avgScore, ult_ataque_espaco: avgScore, ult_1v1: techScores['1x1 Ofensivo|Mudança de direção'] || avgScore, ult_ultimo_passe: avgScore, ult_finalizacao_eficiente: techScores['Finalização|Primeira finalização'] || avgScore, ult_ritmo: avgScore, ult_bolas_paradas: avgScore
      },
      heatmapPoints: [], 
      notes: `[Treino] ${notes}`
    };
    await saveTrainingEntry(entry);
    setNotification(`Atuação de ${selectedAthlete.name} salva!`);
    setTimeout(() => { setNotification(null); setSelectedAthlete(null); }, 1500);
  };

  const handleScoreClick = (fund: string, sub: string, score: number) => {
      setTechScores(prev => ({ ...prev, [`${fund}|${sub}`]: score }));
  };

  if (currentUser && !canEditData(currentUser.role)) return <div className="p-20 text-center"><AlertOctagon className="mx-auto text-red-500" size={48}/><h2 className="text-xl font-black mt-4">Acesso Restrito</h2></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="text-blue-600" size={28} />
        <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Lançamento de Atuação</h2>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Data</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" /></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Categoria</label><select value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Posição</label><select value={selectedPosition} onChange={e=>setSelectedPosition(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Todas</option>{Object.values(Position).map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Buscar Atleta</label><div className="relative"><Search className="absolute left-3 top-3.5 text-gray-400" size={14}/><input type="text" placeholder="Filtrar nome..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
      </div>

      {selectedCategory && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Users size={14}/> Atletas da Categoria</h3>
            <div className="flex gap-4 pb-2">
                {athletes.map(a => (
                    <button key={a.id} onClick={() => handleSelectAthlete(a)} className={`flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedAthlete?.id === a.id ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105' : 'bg-gray-50 text-gray-700 border-gray-100 hover:bg-blue-50'}`}>
                        {a.photoUrl ? <img src={a.photoUrl} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-xs">{a.name.charAt(0)}</div>}
                        <span className="text-[10px] font-black uppercase tracking-tighter truncate max-w-[80px]">{a.name.split(' ')[0]}</span>
                    </button>
                ))}
                {athletes.length === 0 && <p className="text-gray-400 text-xs py-4">Nenhum atleta nesta filtragem.</p>}
            </div>
        </div>
      )}

      {selectedAthlete && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xl">
                  <div className="flex items-center justify-between mb-8 border-b pb-4">
                      <div className="flex items-center gap-4">
                          {selectedAthlete.photoUrl && <img src={selectedAthlete.photoUrl} className="w-14 h-14 rounded-full object-cover border-2 border-blue-50" />}
                          <div>
                              <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Avaliar Atuação: {selectedAthlete.name}</h3>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Critérios de Fundamentos Técnicos (1-5)</p>
                          </div>
                      </div>
                      {notification && <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest animate-pulse">{notification}</div>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {TECH_CONFIG.map((group, idx) => (
                          <div key={idx} className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                               <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                   <Target size={14} className="text-blue-400"/> {group.fundamento}
                               </h4>
                               <div className="space-y-4">
                                   {group.subs.map(sub => (
                                       <div key={sub} className="space-y-2">
                                           <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-gray-600 uppercase">{sub}</span>
                                                <span className="text-[9px] font-black text-blue-600">{techScores[`${group.fundamento}|${sub}`] || '-'}</span>
                                           </div>
                                           <div className="grid grid-cols-5 gap-1">
                                               {[1, 2, 3, 4, 5].map(v => (
                                                   <button key={v} onClick={() => handleScoreClick(group.fundamento, sub, v)} className={`h-8 rounded-lg text-[10px] font-black transition-all border ${techScores[`${group.fundamento}|${sub}`] === v ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-300 border-gray-100'}`}>{v}</button>
                                               ))}
                                           </div>
                                       </div>
                                   ))}
                               </div>
                          </div>
                      ))}
                  </div>

                  <div className="mt-8"><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Observações do Treino</label><textarea className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 h-20 outline-none" placeholder="Feedback qualitativo sobre a sessão..." value={notes} onChange={e=>setNotes(e.target.value)}></textarea></div>
                  <div className="mt-8 flex justify-end"><button onClick={handleSaveEntry} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-10 rounded-2xl shadow-xl flex items-center gap-3 uppercase tracking-widest text-[10px] active:scale-95 transition-all"><Save size={18}/> Salvar Atuação</button></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Training;
