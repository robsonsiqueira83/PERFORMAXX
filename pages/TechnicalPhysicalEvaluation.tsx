
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  saveEvaluationSession
} from '../services/storageService';
import { Athlete, EvaluationType, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation, User } from '../types';
import { 
  ArrowLeft, Save, X, Loader2, Calendar as CalendarIcon, Info, ClipboardCheck, TrendingUp, Activity, User as UserIcon, CheckCircle, Target
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TECH_CONFIG = [
    { fundamento: 'Passe', subs: ['Curto', 'Médio', 'Longo'] },
    { fundamento: 'Domínio e Controle', subs: ['Orientado', 'Sob pressão'] },
    { fundamento: 'Condução', subs: ['Espaço curto', 'Progressão'] },
    { fundamento: 'Finalização', subs: ['Bola rolando', 'Primeira finalização'] },
    { fundamento: '1x1 Ofensivo', subs: ['Drible curto', 'Mudança de direção'] },
    { fundamento: '1x1 Defensivo', subs: ['Desarme', 'Postura corporal'] }
];

const PHYS_CONFIG = [
    { cat: 'Força', caps: ['Geral', 'Específica da posição'] },
    { cat: 'Potência', caps: ['Aceleração', 'Mudança de direção'] },
    { cat: 'Velocidade', caps: ['Arranque', 'Velocidade máxima'] },
    { cat: 'Resistência', caps: ['Capacidade aeróbia', 'Repetição de esforços'] },
    { cat: 'Mobilidade / Estabilidade', caps: ['Quadril', 'Tornozelo', 'Core'] }
];

const TechnicalPhysicalEvaluation: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [athlete, setAthlete] = useState<Athlete | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [evalDate, setEvalDate] = useState(new Date().toISOString().split('T')[0]);
    const [evalType, setEvalType] = useState<EvaluationType>(EvaluationType.MENSUAL);
    const [notes, setNotes] = useState('');

    const [techScores, setTechScores] = useState<Record<string, number>>({});
    const [physInputs, setPhysInputs] = useState<Record<string, { val: string, score: number }>>({});

    useEffect(() => {
        const storedUser = localStorage.getItem('performax_current_user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));

        const load = async () => {
            setLoading(true);
            try {
                const allAthletes = await getAthletes();
                const found = allAthletes.find(a => a.id === id);
                if (found) setAthlete(found);
            } catch (err) {
                console.error("Erro ao carregar atleta:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const handleTechScore = (fund: string, sub: string, score: number) => {
        setTechScores(prev => ({ ...prev, [`${fund}|${sub}`]: score }));
    };

    const handlePhysInput = (cap: string, value: string, directScore?: number) => {
        let score = directScore || 0;
        if (!directScore) {
            const num = parseFloat(value.replace(',', '.'));
            if (!isNaN(num)) score = Math.min(5, Math.max(1, num / 2)); 
        }
        setPhysInputs(prev => ({ ...prev, [cap]: { val: value, score } }));
    };

    const calculateScores = () => {
        const techVals = Object.values(techScores) as number[];
        const avgTech = techVals.length > 0 ? (techVals.reduce((a, b) => a + b, 0) / techVals.length) : 0;
        
        const physVals = (Object.values(physInputs) as { val: string, score: number }[]).map(i => i.score);
        const avgPhysRaw = physVals.length > 0 ? (physVals.reduce((a, b) => a + b, 0) / physVals.length) : 0;
        const avgPhysNormalized = (avgPhysRaw / 5) * 100;
        
        return { avgTech, avgPhysNormalized };
    };

    const handleSave = async () => {
        if (!athlete || !currentUser) {
            alert("Sessão inválida ou usuário não autenticado.");
            return;
        }

        setSaving(true);
        const { avgTech, avgPhysNormalized } = calculateScores();
        const sessionId = uuidv4();

        // Preparação cuidadosa dos dados para o DB
        const session: EvaluationSession = {
            id: sessionId, 
            athleteId: athlete.id, 
            date: evalDate, 
            type: evalType,
            evaluatorId: currentUser.id, 
            scoreTecnico: avgTech, 
            scoreFisico: avgPhysNormalized, 
            notes
        };

        const technicals: TechnicalEvaluation[] = (Object.entries(techScores) as [string, number][]).map(([key, nota]) => {
            const [fundamento, subfundamento] = key.split('|');
            return { sessionId, fundamento, subfundamento, nota };
        });

        const physicals: PhysicalEvaluation[] = (Object.entries(physInputs) as [string, { val: string, score: number }][]).map(([capacidade, data]) => ({
            sessionId, 
            capacidade, 
            valorBruto: data.val,
            scoreNormalizado: (data.score / 5) * 100
        }));

        try {
            // Persistência coordenada
            await saveEvaluationSession(session, technicals, physicals);
            navigate(`/athletes/${athlete.id}`);
        } catch (err: any) { 
            console.error("Erro técnico detalhado:", err);
            // Mensagem de erro mais rica
            alert(`Erro ao salvar avaliação: ${err.message || "Erro de conexão"}. Verifique as permissões de gravação.`); 
        } finally { 
            setSaving(false); 
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
    if (!athlete) return <div className="p-10 text-center text-gray-500">Atleta não encontrado.</div>;

    const fillProgress = (Object.keys(techScores).length + Object.keys(physInputs).length) / (TECH_CONFIG.reduce((a,c)=>a+c.subs.length,0) + PHYS_CONFIG.reduce((a,c)=>a+c.caps.length,0));

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-400 hover:text-blue-600 transition-colors"><ArrowLeft size={24}/></button>
                    <div className="flex items-center gap-4">
                        {athlete.photoUrl ? (
                            <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover border-2 border-blue-50 shadow-sm" alt={athlete.name} />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 uppercase">{athlete.name.charAt(0)}</div>
                        )}
                        <div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                                <ClipboardCheck className="text-blue-600" size={20} /> Avaliação Estruturada
                            </h2>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{athlete.name} • {athlete.position}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Preenchimento</span>
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${fillProgress * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-10 animate-fade-in">
                {/* Cabeçalho de Contexto */}
                <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-3 pb-2 border-b border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> Contexto da Sessão</h3>
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Data da Avaliação</label>
                        <input type="date" value={evalDate} onChange={e=>setEvalDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Objetivo</label>
                        <select value={evalType} onChange={e=>setEvalType(e.target.value as EvaluationType)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                            {Object.values(EvaluationType).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Avaliador Responsável</label>
                        <div className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-xs font-bold text-gray-500 flex items-center gap-2">
                            <UserIcon size={12} /> {currentUser?.name || 'Sistema'}
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notas da Sessão</label>
                        <textarea value={notes} onChange={e=>setNotes(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 h-16 outline-none" placeholder="Contexto de treino, condições de campo ou observações comportamentais..."></textarea>
                    </div>
                </section>

                {/* Fundamentos */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b-2 border-blue-100">
                        <TrendingUp className="text-blue-600" />
                        <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Fundamentos Técnicos (1-5)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {TECH_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-5 flex items-center gap-2">
                                    <Target size={14} className="text-blue-400"/> {group.fundamento}
                                </h4>
                                <div className="space-y-6">
                                    {group.subs.map(sub => (
                                        <div key={sub} className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-gray-600">{sub}</span>
                                                <span className="text-[9px] font-black text-blue-500 uppercase">{techScores[`${group.fundamento}|${sub}`] ? `Nota ${techScores[`${group.fundamento}|${sub}`]}` : 'Pendente'}</span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button 
                                                        key={score} 
                                                        onClick={() => handleTechScore(group.fundamento, sub, score)}
                                                        className={`py-3 rounded-lg text-[10px] font-black transition-all border-2 
                                                            ${techScores[`${group.fundamento}|${sub}`] === score 
                                                                ? 'bg-blue-600 text-white border-blue-700 shadow-lg scale-95' 
                                                                : 'bg-gray-50 text-gray-300 border-gray-100 hover:border-blue-200'}`}
                                                    >
                                                        {score}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Física */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b-2 border-orange-100">
                        <Activity className="text-orange-600" />
                        <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Capacidades Físicas</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {PHYS_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h4 className="text-[11px] font-black text-orange-900 uppercase tracking-widest mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-3 bg-orange-600 rounded-full"></div> {group.cat}
                                </h4>
                                <div className="space-y-5">
                                    {group.caps.map(cap => (
                                        <div key={cap} className="space-y-3 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-500 uppercase">{cap}</span>
                                                <div className="flex gap-0.5">
                                                    {[1,2,3,4,5].map(s => (
                                                        <div key={s} className={`h-1 w-3 rounded-full ${physInputs[cap]?.score >= s ? 'bg-orange-500' : 'bg-gray-200'}`}></div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Valor bruto (ex: 30m, 5kg)" 
                                                    value={physInputs[cap]?.val || ''}
                                                    onChange={e => handlePhysInput(cap, e.target.value)}
                                                    className="flex-1 bg-white border border-gray-200 rounded-lg p-3 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                                                />
                                                <div className="flex gap-1">
                                                    {[1,2,3,4,5].map(s => (
                                                        <button 
                                                            key={s} 
                                                            onClick={() => handlePhysInput(cap, physInputs[cap]?.val || '', s)}
                                                            className={`w-7 h-10 rounded-lg text-[10px] font-black transition-all
                                                                ${physInputs[cap]?.score === s ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-300 border border-gray-200'}`}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-40 flex justify-center">
                <div className="max-w-4xl w-full flex gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="flex-1 bg-gray-50 text-gray-400 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-100 transition-all">Cancelar</button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        {saving ? 'Consolidando...' : 'Salvar Avaliação Estruturada'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TechnicalPhysicalEvaluation;
