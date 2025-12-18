
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getAthletes, getCategories, saveTrainingEntry, saveTrainingSession, getTrainingSessions
} from '../services/storageService';
import { Athlete, Category, TrainingEntry, TrainingSession, Position, User, canEditData } from '../types';
import { Save, Users, ClipboardList, Loader2, Search, Target, AlertOctagon, Activity, Shield } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TECH_CONFIG = [
    { fundamento: 'Passe', subs: ['Curto', 'Médio', 'Longo'] },
    { fundamento: 'Domínio e Controle', subs: ['Orientado', 'Sob pressão'] },
    { fundamento: 'Condução', subs: ['Espaço curto', 'Progressão'] },
    { fundamento: 'Finalização', subs: ['Bola rolando', 'Primeira finalização'] },
    { fundamento: '1x1 Ofensivo', subs: ['Drible curto', 'Mudança de direção'] },
    { fundamento: '1x1 Defensivo', subs: ['Desarme', 'Postura corporal'] }
];

const PHYS_QUICK_CONFIG = [
    { cat: 'Velocidade', subs: ['Arranque', 'Vel. Final'] },
    { cat: 'Força', subs: ['Explosão', 'Contenção'] },
    { cat: 'Resistência', subs: ['Aeróbia', 'Recuperação'] },
    { cat: 'Coordenação', subs: ['Agilidade', 'Equilíbrio'] }
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

  const [scores, setScores] = useState<Record<string, number>>({});
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
    setScores({});
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

    const techVals = Object.entries(scores).filter(([k]) => !k.startsWith('Phys|')).map(([,v]) => v);
    // Explicitly cast to number[] and type reduce parameters to resolve arithmetic operation error on line 99/101
    const avgTech = techVals.length > 0 ? (techVals as number[]).reduce((a: number, b: number) => a + b, 0) / techVals.length : 5;

    const entry: TrainingEntry = {
      id: uuidv4(), sessionId: sessionIdToUse, athleteId: selectedAthlete.id,
      technical: {
        controle_bola: scores['Passe|Longo'] || avgTech, // Mapeamento genérico para não quebrar interface antiga
        conducao: scores['Condução|Progressão'] || avgTech,
        passe: scores['Passe|Curto'] || avgTech,
        recepcao: scores['Domínio e Controle|Sob pressão'] || avgTech,
        drible: scores['1x1 Ofensivo|Drible curto'] || avgTech,
        finalizacao: scores['Finalização|Bola rolando'] || avgTech,
        cruzamento: avgTech,
        desarme: scores['1x1 Defensivo|Desarme'] || avgTech,
        interceptacao: scores['1x1 Defensivo|Postura corporal'] || avgTech
      },
      physical: {
        velocidade: scores['Phys|Velocidade|Arranque'] || 5,
        agilidade: scores['Phys|Coordenação|Agilidade'] || 5,
        resistencia: scores['Phys|Resistência|Aeróbia'] || 5,
        forca: scores['Phys|Força|Explosão'] || 5,
        coordenacao: scores['Phys|Coordenação|Equilíbrio'] || 5,
        mobilidade: 5, estabilidade: 5
      },
      tactical: {
        def_posicionamento: avgTech, def_pressao: avgTech, def_cobertura: avgTech, def_fechamento: avgTech, def_temporizacao: avgTech, def_desarme_tatico: avgTech, def_reacao: avgTech,
        const_qualidade_passe: avgTech, const_visao: avgTech, const_apoios: avgTech, const_mobilidade: avgTech, const_circulacao: avgTech, const_quebra_linhas: avgTech, const_tomada_decisao: avgTech,
        ult_movimentacao: avgTech, ult_ataque_espaco: avgTech, ult_1v1: avgTech, ult_ultimo_passe: avgTech, ult_finalizacao_eficiente: avgTech, ult_ritmo: avgTech, ult_bolas_paradas: avgTech
      },
      heatmapPoints: [], 
      notes: `[Treino] ${notes}`
    };
    await saveTrainingEntry(entry);
    setNotification(`Atuação de ${selectedAthlete.name} salva!`);
    setTimeout(() => { setNotification(null); setSelectedAthlete(null); }, 1500);
  };

  const handleScoreClick = (key: string, score: number) => {
      setScores(prev => ({ ...prev, [key]: score }));
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
                              <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Avaliar: {selectedAthlete.name}</h3>
                                <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{selectedAthlete.position}</span>
                              </div>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Atuação baseada em fundamentos e físico (1-5)</p>
                          </div>
                      </div>
                      {notification && <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest animate-pulse">{notification}</div>}
                  </div>

                  {/* FUNDAMENTOS TÉCNICOS */}
                  <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Target size={16}/> Fundamentos Técnicos</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                      {TECH_CONFIG.map((group, idx) => (
                          <div key={idx} className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                               <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-4">{group.fundamento}</h4>
                               <div className="space-y-4">
                                   {group.subs.map(sub => {
                                       const key = `${group.fundamento}|${sub}`;
                                       return (
                                       <div key={sub} className="space-y-2">
                                           <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-gray-600 uppercase">{sub}</span>
                                                <span className="text-[9px] font-black text-blue-600">{scores[key] || '-'}</span>
                                           </div>
                                           <div className="grid grid-cols-5 gap-1">
                                               {[1, 2, 3, 4, 5].map(v => (
                                                   <button key={v} onClick={() => handleScoreClick(key, v)} className={`h-8 rounded-lg text-[10px] font-black transition-all border ${scores[key] === v ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-300 border-gray-100'}`}>{v}</button>
                                               ))}
                                           </div>
                                       </div>
                                   )})}
                               </div>
                          </div>
                      ))}
                  </div>

                  {/* CONDIÇÃO FÍSICA */}
                  <h4 className="text-[11px] font-black text-orange-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Activity size={16}/> Condição Física</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {PHYS_QUICK_CONFIG.map((group, idx) => (
                          <div key={idx} className="bg-orange-50/30 p-5 rounded-2xl border border-orange-100">
                               <h4 className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-4">{group.cat}</h4>
                               <div className="space-y-4">
                                   {group.subs.map(sub => {
                                       const key = `Phys|${group.cat}|${sub}`;
                                       return (
                                       <div key={sub} className="space-y-2">
                                           <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-gray-600 uppercase">{sub}</span>
                                                <span className="text-[9px] font-black text-orange-600">{scores[key] || '-'}</span>
                                           </div>
                                           <div className="grid grid-cols-5 gap-1">
                                               {[1, 2, 3, 4, 5].map(v => (
                                                   <button key={v} onClick={() => handleScoreClick(key, v)} className={`h-8 rounded-lg text-[10px] font-black transition-all border ${scores[key] === v ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-gray-300 border-gray-100'}`}>{v}</button>
                                               ))}
                                           </div>
                                       </div>
                                   )})}
                               </div>
                          </div>
                      ))}
                  </div>

                  <div className="mt-8 pt-8 border-t border-gray-100"><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Observações do Treino</label><textarea className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 h-20 outline-none" placeholder="Feedback qualitativo sobre a sessão..." value={notes} onChange={e=>setNotes(e.target.value)}></textarea></div>
                  <div className="mt-8 flex justify-end"><button onClick={handleSaveEntry} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-10 rounded-2xl shadow-xl flex items-center gap-3 uppercase tracking-widest text-[10px] active:scale-95 transition-all"><Save size={18}/> Salvar Atuação</button></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Training;
