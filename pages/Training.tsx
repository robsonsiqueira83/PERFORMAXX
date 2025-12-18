
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getAthletes, getCategories, saveTrainingEntry, saveTrainingSession, getTrainingSessions, getTrainingEntries
} from '../services/storageService';
import { Athlete, Category, TrainingEntry, TrainingSession, Position, HeatmapPoint, User, canEditData } from '../types';
import HeatmapField from '../components/HeatmapField';
import { Save, CheckCircle, Users, ClipboardList, FileText, Loader2, Search, Filter, AlertOctagon, Target, Activity, TrendingUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

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

  const [techStats, setTechStats] = useState<Record<string, number>>({});
  const [physStats, setPhysStats] = useState<Record<string, number>>({});
  const [tactStats, setTactStats] = useState<Record<string, number>>({});
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
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
    setTechStats({});
    setPhysStats({});
    setTactStats({});
    setHeatmapPoints([]); 
    setNotes('');
  };

  const handleSaveEntry = async () => {
    if (!selectedAthlete || !selectedCategory || !date) return;
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
        sessionIdToUse = uuidv4();
        await saveTrainingSession({ id: sessionIdToUse, date, categoryId: selectedCategory, teamId, description: 'Atuação Regular' });
        setCurrentSessionId(sessionIdToUse);
    }

    const entry: TrainingEntry = {
      id: uuidv4(), sessionId: sessionIdToUse, athleteId: selectedAthlete.id,
      technical: {
        controle_bola: techStats.controle_bola || 5, conducao: techStats.conducao || 5, passe: techStats.passe || 5,
        recepcao: techStats.recepcao || 5, drible: techStats.drible || 5, finalizacao: techStats.finalizacao || 5,
        cruzamento: techStats.cruzamento || 5, desarme: techStats.desarme || 5, interceptacao: techStats.interceptacao || 5
      },
      physical: {
        velocidade: physStats.velocidade || 5, agilidade: physStats.agilidade || 5, resistencia: physStats.resistencia || 5,
        forca: physStats.forca || 5, coordenacao: physStats.coordenacao || 5, mobilidade: physStats.mobilidade || 5, estabilidade: physStats.estabilidade || 5
      },
      tactical: {
        def_posicionamento: tactStats.def_posicionamento || 5, def_pressao: tactStats.def_pressao || 5, def_cobertura: tactStats.def_cobertura || 5,
        def_fechamento: tactStats.def_fechamento || 5, def_temporizacao: tactStats.def_temporizacao || 5, def_desarme_tatico: tactStats.def_desarme_tatico || 5,
        def_reacao: tactStats.def_reacao || 5, const_qualidade_passe: tactStats.const_qualidade_passe || 5, const_visao: tactStats.const_visao || 5, const_apoios: tactStats.const_apoios || 5,
        const_mobilidade: tactStats.const_mobilidade || 5, const_circulacao: tactStats.const_circulacao || 5, const_quebra_linhas: tactStats.const_quebra_linhas || 5,
        const_tomada_decisao: tactStats.const_tomada_decisao || 5, ult_movimentacao: tactStats.ult_movimentacao || 5, ult_ataque_espaco: tactStats.ult_ataque_espaco || 5, ult_1v1: tactStats.ult_1v1 || 5,
        ult_ultimo_passe: tactStats.ult_ultimo_passe || 5, ult_finalizacao_eficiente: tactStats.ult_finalizacao_eficiente || 5,
        ult_ritmo: tactStats.ult_ritmo || 5, ult_bolas_paradas: tactStats.ult_bolas_paradas || 5
      },
      heatmapPoints, notes
    };
    await saveTrainingEntry(entry);
    setNotification(`Atuação salva!`);
    setTimeout(() => { setNotification(null); navigate(`/athletes/${selectedAthlete.id}`); }, 600);
  };

  const renderScoreRow = (label: string, key: string, store: any, setStore: any) => (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-gray-50 last:border-0 gap-2">
          <span className="text-[11px] font-bold text-gray-600 uppercase tracking-tighter">{label}</span>
          <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                  <button key={v} onClick={() => setStore({...store, [key]: v})} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all border ${store[key] === v ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-white text-gray-300 border-gray-200 hover:border-indigo-200'}`}>{v}</button>
              ))}
          </div>
      </div>
  );

  if (currentUser && !canEditData(currentUser.role)) return <div className="p-20 text-center"><AlertOctagon className="mx-auto text-red-500" size={48}/><h2 className="text-xl font-black mt-4">Acesso Restrito</h2></div>;

  return (
    <div className="space-y-6">
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
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Users size={14}/> Lista de Seleção</h3>
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
                              <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Avaliar {selectedAthlete.name}</h3>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Padrão de Avaliação Estruturada (Snapshot)</p>
                          </div>
                      </div>
                      {notification && <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest animate-pulse">{notification}</div>}
                  </div>

                  <div className="mb-10"><HeatmapField points={heatmapPoints} onChange={setHeatmapPoints} label="Zona de Atuação Predominante" perspective={true} /></div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                           <h4 className="text-[11px] font-black text-blue-700 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={14}/> Fundamentos</h4>
                           {renderScoreRow('Controle', 'controle_bola', techStats, setTechStats)}
                           {renderScoreRow('Passe', 'passe', techStats, setTechStats)}
                           {renderScoreRow('Drible', 'drible', techStats, setTechStats)}
                           {renderScoreRow('Finalização', 'finalizacao', techStats, setTechStats)}
                           {renderScoreRow('Desarme', 'desarme', techStats, setTechStats)}
                       </div>
                       <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                           <h4 className="text-[11px] font-black text-green-700 uppercase tracking-widest mb-4 flex items-center gap-2"><Activity size={14}/> Físico</h4>
                           {renderScoreRow('Velocidade', 'velocidade', physStats, setPhysStats)}
                           {renderScoreRow('Agilidade', 'agilidade', physStats, setPhysStats)}
                           {renderScoreRow('Força', 'forca', physStats, setPhysStats)}
                           {renderScoreRow('Coordenação', 'coordenacao', physStats, setPhysStats)}
                           {renderScoreRow('Resistência', 'resistencia', physStats, setPhysStats)}
                       </div>
                       <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                           <h4 className="text-[11px] font-black text-purple-700 uppercase tracking-widest mb-4 flex items-center gap-2"><TrendingUp size={14}/> Tático (Jogo)</h4>
                           {renderScoreRow('Posicionamento', 'def_posicionamento', tactStats, setTactStats)}
                           {renderScoreRow('Visão', 'const_visao', tactStats, setTactStats)}
                           {renderScoreRow('Transição', 'const_mobilidade', tactStats, setTactStats)}
                           {renderScoreRow('Tomada Decisão', 'const_tomada_decisao', tactStats, setTactStats)}
                           {renderScoreRow('Compactação', 'def_fechamento', tactStats, setTactStats)}
                       </div>
                  </div>

                  <div className="mt-8"><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Observações Técnicas</label><textarea className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 h-24 outline-none" placeholder="Análise qualitativa..." value={notes} onChange={e=>setNotes(e.target.value)}></textarea></div>
                  <div className="mt-8 flex justify-end"><button onClick={handleSaveEntry} className="bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-10 rounded-2xl shadow-xl flex items-center gap-3 uppercase tracking-widest text-[10px] active:scale-95 transition-all"><Save size={18}/> Finalizar e Salvar Atuação</button></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Training;
