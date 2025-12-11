import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getAthletes, getCategories, saveTrainingEntry, saveTrainingSession, getTrainingSessions, getTrainingEntries
} from '../services/storageService';
import { Athlete, Category, TrainingEntry, TrainingSession, Position, HeatmapPoint, User, canEditData } from '../types';
import StatSlider from '../components/StatSlider';
import HeatmapField from '../components/HeatmapField';
import { Save, CheckCircle, Users, ClipboardList, FileText, Loader2, Search, Filter, AlertOctagon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TrainingProps {
  teamId: string;
}

const Training: React.FC<TrainingProps> = ({ teamId }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // New Filters
  const [selectedPosition, setSelectedPosition] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Session State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const getDefaultStats = () => ({
    velocidade: 5, agilidade: 5, resistencia: 5, forca: 5, coordenacao: 5, mobilidade: 5, estabilidade: 5,
    controle_bola: 5, conducao: 5, passe: 5, recepcao: 5, drible: 5, finalizacao: 5, cruzamento: 5, desarme: 5, interceptacao: 5,
    def_posicionamento: 5, def_pressao: 5, def_cobertura: 5, def_fechamento: 5, def_temporizacao: 5, def_desarme_tatico: 5, def_reacao: 5,
    const_qualidade_passe: 5, const_visao: 5, const_apoios: 5, const_mobilidade: 5, const_circulacao: 5, const_quebra_linhas: 5, const_tomada_decisao: 5,
    ult_movimentacao: 5, ult_ataque_espaco: 5, ult_1v1: 5, ult_ultimo_passe: 5, ult_finalizacao_eficiente: 5, ult_ritmo: 5, ult_bolas_paradas: 5
  });

  // Stats State
  const [stats, setStats] = useState(getDefaultStats());
  
  // Heatmap State
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);

  // New Notes State
  const [notes, setNotes] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    // Permission check
    const storedUser = localStorage.getItem('performax_current_user');
    if (storedUser) {
        const u = JSON.parse(storedUser);
        setCurrentUser(u);
    }

    const init = async () => {
        setLoading(true);
        const [c, a] = await Promise.all([getCategories(), getAthletes()]);
        setCategories(c.filter(item => item.teamId === teamId));
        setAllAthletes(a.filter(item => item.teamId === teamId));
        setLoading(false);
    };
    init();
  }, [teamId]);

  // Auto-list athletes and manage session creation when filters change
  useEffect(() => {
    if (selectedCategory && date) {
      let filtered = allAthletes.filter(a => a.categoryId === selectedCategory);
      if (selectedPosition) filtered = filtered.filter(a => a.position === selectedPosition);
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(a => a.name.toLowerCase().includes(lowerTerm));
      }
      setAthletes(filtered);
      
      const checkSession = async () => {
          const s = await getTrainingSessions();
          const existingSessions = s.filter(s => s.date === date && s.categoryId === selectedCategory && s.teamId === teamId);
          if (existingSessions.length > 0) {
            setCurrentSessionId(existingSessions[0].id);
          } else {
             setCurrentSessionId(null);
          }
      };
      checkSession();

    } else {
      setAthletes([]);
      setCurrentSessionId(null);
    }
    setSelectedAthlete(null);
  }, [selectedCategory, date, teamId, allAthletes, selectedPosition, searchTerm]);

  const handleSelectAthlete = async (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    setLoading(true); 
    
    try {
        const allEntries = await getTrainingEntries();
        const athleteEntries = allEntries.filter(e => e.athleteId === athlete.id);
        
        // --- NEW LOGIC: CALCULATE AVERAGES ---
        if (athleteEntries.length > 0) {
             const defaultKeys = getDefaultStats();
             const newStats: any = {};
             
             Object.keys(defaultKeys).forEach(key => {
                 let sum = 0;
                 let count = 0;
                 
                 athleteEntries.forEach(entry => {
                     // Check technical, physical, then tactical
                     // Casting to any to access dynamic properties for calculation
                     const val = (entry.technical as any)[key] ?? (entry.physical as any)[key] ?? (entry.tactical as any)?.[key];
                     
                     if (val !== undefined && val !== null) {
                         sum += Number(val);
                         count++;
                     }
                 });
                 
                 if (count > 0) {
                     // Calculate Average and Round to nearest 0.5
                     newStats[key] = Math.round((sum / count) * 2) / 2;
                 } else {
                     newStats[key] = 5; // Fallback
                 }
             });
             
             setStats(newStats);
        } else {
            setStats(getDefaultStats());
        }
        
        // Reset Heatmap and Notes for new entry
        setHeatmapPoints([]); 
        setNotes('');

    } catch (e) {
        console.error("Error calculating averages", e);
        setStats(getDefaultStats());
        setHeatmapPoints([]);
    }

    setLoading(false);
  };

  const handleSaveEntry = async () => {
    if (!selectedAthlete || !selectedCategory || !date) return;

    let sessionIdToUse = currentSessionId;

    if (!sessionIdToUse) {
        sessionIdToUse = uuidv4();
        const session: TrainingSession = {
          id: sessionIdToUse,
          date,
          categoryId: selectedCategory,
          teamId,
          description: 'Atuação Regular'
        };
        await saveTrainingSession(session);
        setCurrentSessionId(sessionIdToUse);
    }

    const entry: TrainingEntry = {
      id: uuidv4(),
      sessionId: sessionIdToUse,
      athleteId: selectedAthlete.id,
      technical: {
        controle_bola: stats.controle_bola, conducao: stats.conducao, passe: stats.passe,
        recepcao: stats.recepcao, drible: stats.drible, finalizacao: stats.finalizacao,
        cruzamento: stats.cruzamento, desarme: stats.desarme, interceptacao: stats.interceptacao
      },
      physical: {
        velocidade: stats.velocidade, agilidade: stats.agilidade, resistencia: stats.resistencia,
        forca: stats.forca, coordenacao: stats.coordenacao, mobilidade: stats.mobilidade, estabilidade: stats.estabilidade
      },
      tactical: {
        def_posicionamento: stats.def_posicionamento, def_pressao: stats.def_pressao, def_cobertura: stats.def_cobertura,
        def_fechamento: stats.def_fechamento, def_temporizacao: stats.def_temporizacao, def_desarme_tatico: stats.def_desarme_tatico,
        def_reacao: stats.def_reacao,
        const_qualidade_passe: stats.const_qualidade_passe, const_visao: stats.const_visao, const_apoios: stats.const_apoios,
        const_mobilidade: stats.const_mobilidade, const_circulacao: stats.const_circulacao, const_quebra_linhas: stats.const_quebra_linhas,
        const_tomada_decisao: stats.const_tomada_decisao,
        ult_movimentacao: stats.ult_movimentacao, ult_ataque_espaco: stats.ult_ataque_espaco, ult_1v1: stats.ult_1v1,
        ult_ultimo_passe: stats.ult_ultimo_passe, ult_finalizacao_eficiente: stats.ult_finalizacao_eficiente,
        ult_ritmo: stats.ult_ritmo, ult_bolas_paradas: stats.ult_bolas_paradas
      },
      heatmapPoints: heatmapPoints,
      notes: notes
    };

    await saveTrainingEntry(entry);
    
    setNotification(`Dados salvos para ${selectedAthlete.name}!`);
    setTimeout(() => {
        setNotification(null);
        navigate(`/athletes/${selectedAthlete.id}`);
    }, 500); 
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500";

  // Permission Block
  if (currentUser && !canEditData(currentUser.role)) {
      return (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center p-6 bg-red-50 rounded-xl border border-red-100">
              <AlertOctagon size={48} className="text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-red-700">Acesso Restrito</h2>
              <p className="text-red-600 mt-2">Seu perfil ({currentUser.role}) não possui permissão para lançar atuações.</p>
              <button onClick={() => navigate('/')} className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors">
                  Voltar ao Dashboard
              </button>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="text-green-500" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">Lançamento de Atuações</h2>
      </div>

      {/* Header Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Data da Atuação</label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Categoria</label>
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Posição (Filtro)</label>
            <div className="relative">
                <select 
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Todas</option>
                  {Object.values(Position).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <Filter className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={18} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Buscar Atleta</label>
            <div className="relative">
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nome do atleta..."
                  className={inputClass}
                />
                <Search className="absolute right-3 top-3 text-gray-400" size={18} />
            </div>
          </div>
      </div>

      {/* Athlete Selection */}
      {selectedCategory && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="text-blue-600" /> Selecione o Atleta
            </h3>
            {athletes.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {athletes.map(athlete => (
                        <button 
                            key={athlete.id}
                            onClick={() => handleSelectAthlete(athlete)}
                            className={`p-4 rounded-xl flex flex-col items-center gap-2 border transition-all ${
                                selectedAthlete?.id === athlete.id 
                                    ? 'border-green-500 bg-green-50 shadow-md transform scale-105' 
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            }`}
                        >
                            {athlete.photoUrl ? (
                                <img src={athlete.photoUrl} alt={athlete.name} className="w-16 h-16 rounded-full object-cover" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-400">
                                    {athlete.name.charAt(0)}
                                </div>
                            )}
                            <span className="text-sm font-medium text-center leading-tight text-black">{athlete.name}</span>
                            <span className="text-xs text-gray-500">{athlete.position}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 italic">Nenhum atleta encontrado com os filtros atuais.</p>
            )}
        </div>
      )}

      {/* Evaluation Form */}
      {loading && selectedAthlete && <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>}

      {!loading && selectedAthlete && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-fade-in">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                  <div className="flex items-center gap-4">
                      {selectedAthlete.photoUrl && <img src={selectedAthlete.photoUrl} className="w-12 h-12 rounded-full object-cover" />}
                      <div>
                          <h3 className="text-xl font-bold text-gray-800">Avaliação: {selectedAthlete.name}</h3>
                          <p className="text-sm text-gray-500">Preencha os indicadores abaixo</p>
                      </div>
                  </div>
                  {notification && (
                      <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 animate-pulse">
                          <CheckCircle size={18} /> {notification}
                      </div>
                  )}
              </div>

              {/* Heatmap Input */}
              <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                   <HeatmapField 
                      points={heatmapPoints} 
                      onChange={setHeatmapPoints} 
                      label="Mapa de Calor (Toque para marcar)" 
                   />
                   <p className="text-xs text-gray-500 mt-2 text-center">Clique no campo para marcar as principais zonas de atuação do atleta.</p>
              </div>

              {/* TACTICAL BLOCKS */}
              <div className="space-y-8 mb-8">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                       {/* Defendendo */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">
                               Tático: Defendendo
                           </h4>
                           <StatSlider label="Posicionamento" value={stats.def_posicionamento} onChange={v => setStats({...stats, def_posicionamento: v})} />
                           <StatSlider label="Pressão na bola" value={stats.def_pressao} onChange={v => setStats({...stats, def_pressao: v})} />
                           <StatSlider label="Cobertura" value={stats.def_cobertura} onChange={v => setStats({...stats, def_cobertura: v})} />
                           <StatSlider label="Fechamento linhas" value={stats.def_fechamento} onChange={v => setStats({...stats, def_fechamento: v})} />
                           <StatSlider label="Temporização" value={stats.def_temporizacao} onChange={v => setStats({...stats, def_temporizacao: v})} />
                           <StatSlider label="Desarme tempo certo" value={stats.def_desarme_tatico} onChange={v => setStats({...stats, def_desarme_tatico: v})} />
                           <StatSlider label="Reação pós-perda" value={stats.def_reacao} onChange={v => setStats({...stats, def_reacao: v})} />
                       </div>

                       {/* Construindo */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">
                               Tático: Construindo
                           </h4>
                           <StatSlider label="Qualidade Passe" value={stats.const_qualidade_passe} onChange={v => setStats({...stats, const_qualidade_passe: v})} />
                           <StatSlider label="Visão de Jogo" value={stats.const_visao} onChange={v => setStats({...stats, const_visao: v})} />
                           <StatSlider label="Apoios/Linhas" value={stats.const_apoios} onChange={v => setStats({...stats, const_apoios: v})} />
                           <StatSlider label="Mobilidade receber" value={stats.const_mobilidade} onChange={v => setStats({...stats, const_mobilidade: v})} />
                           <StatSlider label="Circulação bola" value={stats.const_circulacao} onChange={v => setStats({...stats, const_circulacao: v})} />
                           <StatSlider label="Quebra de linhas" value={stats.const_quebra_linhas} onChange={v => setStats({...stats, const_quebra_linhas: v})} />
                           <StatSlider label="Decisão sob pressão" value={stats.const_tomada_decisao} onChange={v => setStats({...stats, const_tomada_decisao: v})} />
                       </div>

                       {/* Último Terço */}
                       <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                           <h4 className="text-sm uppercase font-bold text-purple-700 mb-4 border-b border-purple-200 pb-2">
                               Tático: Último Terço
                           </h4>
                           <StatSlider label="Mov. sem bola" value={stats.ult_movimentacao} onChange={v => setStats({...stats, ult_movimentacao: v})} />
                           <StatSlider label="Ataque ao espaço" value={stats.ult_ataque_espaco} onChange={v => setStats({...stats, ult_ataque_espaco: v})} />
                           <StatSlider label="Capacidade 1x1" value={stats.ult_1v1} onChange={v => setStats({...stats, ult_1v1: v})} />
                           <StatSlider label="Último passe" value={stats.ult_ultimo_passe} onChange={v => setStats({...stats, ult_ultimo_passe: v})} />
                           <StatSlider label="Finalização efic." value={stats.ult_finalizacao_eficiente} onChange={v => setStats({...stats, ult_finalizacao_eficiente: v})} />
                           <StatSlider label="Ritmo decisão" value={stats.ult_ritmo} onChange={v => setStats({...stats, ult_ritmo: v})} />
                           <StatSlider label="Bolas paradas" value={stats.ult_bolas_paradas} onChange={v => setStats({...stats, ult_bolas_paradas: v})} />
                       </div>
                   </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Fundamentos */}
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <h4 className="text-sm uppercase font-bold text-blue-700 mb-4 border-b border-blue-200 pb-2">
                          Fundamentos
                      </h4>
                      <StatSlider label="Controle de bola" value={stats.controle_bola} onChange={v => setStats({...stats, controle_bola: v})} />
                      <StatSlider label="Condução" value={stats.conducao} onChange={v => setStats({...stats, conducao: v})} />
                      <StatSlider label="Passe" value={stats.passe} onChange={v => setStats({...stats, passe: v})} />
                      <StatSlider label="Recepção orient." value={stats.recepcao} onChange={v => setStats({...stats, recepcao: v})} />
                      <StatSlider label="Drible" value={stats.drible} onChange={v => setStats({...stats, drible: v})} />
                      <StatSlider label="Finalização" value={stats.finalizacao} onChange={v => setStats({...stats, finalizacao: v})} />
                      <StatSlider label="Cruzamento" value={stats.cruzamento} onChange={v => setStats({...stats, cruzamento: v})} />
                      <StatSlider label="Desarme" value={stats.desarme} onChange={v => setStats({...stats, desarme: v})} />
                      <StatSlider label="Interceptação" value={stats.interceptacao} onChange={v => setStats({...stats, interceptacao: v})} />
                  </div>

                  {/* Physical */}
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                      <h4 className="text-sm uppercase font-bold text-orange-700 mb-4 border-b border-orange-200 pb-2">
                          Condição Física
                      </h4>
                      <StatSlider label="Velocidade" value={stats.velocidade} onChange={v => setStats({...stats, velocidade: v})} />
                      <StatSlider label="Agilidade" value={stats.agilidade} onChange={v => setStats({...stats, agilidade: v})} />
                      <StatSlider label="Resistência" value={stats.resistencia} onChange={v => setStats({...stats, resistencia: v})} />
                      <StatSlider label="Força/Potência" value={stats.forca} onChange={v => setStats({...stats, forca: v})} />
                      <StatSlider label="Coordenação" value={stats.coordenacao} onChange={v => setStats({...stats, coordenacao: v})} />
                      <StatSlider label="Mobilidade" value={stats.mobilidade} onChange={v => setStats({...stats, mobilidade: v})} />
                      <StatSlider label="Estabilidade Core" value={stats.estabilidade} onChange={v => setStats({...stats, estabilidade: v})} />
                  </div>
              </div>

              <div className="mt-8">
                  <h4 className="text-sm uppercase font-bold text-gray-500 mb-2 flex items-center gap-2">
                     <FileText size={16} /> Observações (Opcional)
                  </h4>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500 h-24"
                    placeholder="Adicione notas sobre o desempenho..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  ></textarea>
              </div>

              <div className="mt-8 flex justify-end">
                  <button 
                    onClick={handleSaveEntry}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg transform active:scale-95 transition-all flex items-center gap-2 text-lg"
                  >
                      <Save size={24} /> Salvar Avaliação
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default Training;