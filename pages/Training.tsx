import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getAthletes, getCategories, saveTrainingEntry, saveTrainingSession, getTrainingSessions
} from '../services/storageService';
import { Athlete, Category, TrainingEntry, TrainingSession } from '../types';
import StatSlider from '../components/StatSlider';
import { Save, CheckCircle, Users, ClipboardList, FileText, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TrainingProps {
  teamId: string;
}

const Training: React.FC<TrainingProps> = ({ teamId }) => {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Session State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Stats State
  const [stats, setStats] = useState({
    controle: 5, passe: 5, finalizacao: 5, drible: 5, cabeceio: 5, posicao: 5,
    velocidade: 5, agilidade: 5, forca: 5, resistencia: 5, coordenacao: 5, equilibrio: 5
  });
  
  // New Notes State
  const [notes, setNotes] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        const [c, a] = await Promise.all([getCategories(), getAthletes()]);
        setCategories(c.filter(item => item.teamId === teamId));
        setAllAthletes(a.filter(item => item.teamId === teamId));
        setLoading(false);
    };
    init();
  }, [teamId]);

  // Auto-list athletes and manage session creation when date/category changes
  useEffect(() => {
    if (selectedCategory && date) {
      setAthletes(allAthletes.filter(a => a.categoryId === selectedCategory));
      
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
  }, [selectedCategory, date, teamId, allAthletes]);

  const handleSelectAthlete = (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    setStats({
        controle: 5, passe: 5, finalizacao: 5, drible: 5, cabeceio: 5, posicao: 5,
        velocidade: 5, agilidade: 5, forca: 5, resistencia: 5, coordenacao: 5, equilibrio: 5
    });
    setNotes(''); // Reset notes
  };

  const handleSaveEntry = async () => {
    if (!selectedAthlete || !selectedCategory || !date) return;

    let sessionIdToUse = currentSessionId;

    // If session doesn't exist yet, create it now
    if (!sessionIdToUse) {
        sessionIdToUse = uuidv4();
        const session: TrainingSession = {
          id: sessionIdToUse,
          date,
          categoryId: selectedCategory,
          teamId,
          description: 'Treino Regular'
        };
        await saveTrainingSession(session);
        setCurrentSessionId(sessionIdToUse);
    }

    const entry: TrainingEntry = {
      id: uuidv4(),
      sessionId: sessionIdToUse,
      athleteId: selectedAthlete.id,
      technical: {
        controle: stats.controle,
        passe: stats.passe,
        finalizacao: stats.finalizacao,
        drible: stats.drible,
        cabeceio: stats.cabeceio,
        posicao: stats.posicao
      },
      physical: {
        velocidade: stats.velocidade,
        agilidade: stats.agilidade,
        forca: stats.forca,
        resistencia: stats.resistencia,
        coordenacao: stats.coordenacao,
        equilibrio: stats.equilibrio
      },
      notes: notes // Save notes
    };

    await saveTrainingEntry(entry);
    
    // Notify and Redirect
    setNotification(`Dados salvos para ${selectedAthlete.name}!`);
    setTimeout(() => {
        setNotification(null);
        navigate(`/athletes/${selectedAthlete.id}`);
    }, 500); 
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500";

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="text-green-500" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">Lançamento de Treino</h2>
      </div>

      {/* Header Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Data do Treino</label>
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
              <option value="">Selecione a Categoria...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
                            <span className="text-sm font-medium text-center leading-tight">{athlete.name}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 italic">Nenhum atleta nesta categoria.</p>
            )}
        </div>
      )}

      {/* Evaluation Form */}
      {selectedAthlete && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-fade-in">
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                  <div className="flex items-center gap-4">
                      {selectedAthlete.photoUrl && <img src={selectedAthlete.photoUrl} className="w-12 h-12 rounded-full object-cover" />}
                      <div>
                          <h3 className="text-xl font-bold text-gray-800">Avaliação: {selectedAthlete.name}</h3>
                          <p className="text-sm text-gray-500">Preencha as notas abaixo</p>
                      </div>
                  </div>
                  {notification && (
                      <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2 animate-pulse">
                          <CheckCircle size={18} /> {notification}
                      </div>
                  )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                      <h4 className="text-sm uppercase font-bold text-gray-500 mb-4 flex items-center gap-2 border-b pb-1">
                          Aspectos Técnicos
                      </h4>
                      <StatSlider label="Controle" value={stats.controle} onChange={v => setStats({...stats, controle: v})} />
                      <StatSlider label="Passe" value={stats.passe} onChange={v => setStats({...stats, passe: v})} />
                      <StatSlider label="Finalização" value={stats.finalizacao} onChange={v => setStats({...stats, finalizacao: v})} />
                      <StatSlider label="Drible" value={stats.drible} onChange={v => setStats({...stats, drible: v})} />
                      <StatSlider label="Cabeceio" value={stats.cabeceio} onChange={v => setStats({...stats, cabeceio: v})} />
                      <StatSlider label="Posição" value={stats.posicao} onChange={v => setStats({...stats, posicao: v})} />
                  </div>
                  <div>
                      <h4 className="text-sm uppercase font-bold text-gray-500 mb-4 flex items-center gap-2 border-b pb-1">
                          Aspectos Físicos
                      </h4>
                      <StatSlider label="Velocidade" value={stats.velocidade} onChange={v => setStats({...stats, velocidade: v})} />
                      <StatSlider label="Agilidade" value={stats.agilidade} onChange={v => setStats({...stats, agilidade: v})} />
                      <StatSlider label="Força" value={stats.forca} onChange={v => setStats({...stats, forca: v})} />
                      <StatSlider label="Resistência" value={stats.resistencia} onChange={v => setStats({...stats, resistencia: v})} />
                      <StatSlider label="Coordenação" value={stats.coordenacao} onChange={v => setStats({...stats, coordenacao: v})} />
                      <StatSlider label="Equilíbrio" value={stats.equilibrio} onChange={v => setStats({...stats, equilibrio: v})} />
                  </div>
              </div>

              <div className="mt-6">
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