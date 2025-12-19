
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  saveEvaluationSession
} from '../services/storageService';
import { Athlete, EvaluationType, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation, User, UserRole } from '../types';
import { 
  ArrowLeft, Save, Loader2, Calendar as CalendarIcon, Info, ClipboardCheck, TrendingUp, Activity, User as UserIcon, CheckCircle, Target, AlertCircle
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
    const [errorModal, setErrorModal] = useState<string | null>(null);

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
            setErrorModal("Sessão inválida ou usuário não autenticado.");
            return;
        }

        setSaving(true);
        const { avgTech, avgPhysNormalized } = calculateScores();
        const sessionId = uuidv4();

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
            await saveEvaluationSession(session, technicals, physicals);
            navigate(`/athletes/${athlete.id}`);
        } catch (err: any) { 
            console.error("Erro detalhado:", err);
            setErrorModal(err.message || "Erro inesperado ao salvar os dados."); 
        } finally { 
            setSaving(false); 
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-darkBase"><Loader2 className="animate-spin text-blue-600" /></div>;
    if (!athlete) return <div className="p-10 text-center text-gray-500 dark:text-gray-400 dark:bg-darkBase min-h-screen">Atleta não encontrado.</div>;

    const fillProgress = (Object.keys(techScores).length + Object.keys(physInputs).length) / (TECH_CONFIG.reduce((a,c)=>a+c.subs.length,0) + PHYS_CONFIG.reduce((a,c)=>a+c.caps.length,0));

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-darkBase pb-32 transition-colors">
            <div className="bg-white dark:bg-darkCard border-b border-gray-200 dark:border-darkBorder sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm transition-colors">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><ArrowLeft size={24}/></button>
                    <div className="flex items-center gap-4">
                        {athlete.photoUrl ? (
                            <img src={athlete.photoUrl} className="w-12 h-12 rounded-full object-cover border-2 border-blue-50 dark:border-darkBorder shadow-sm" alt={athlete.name} />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-darkInput flex items-center justify-center font-black text-blue-600 dark:text-blue-400 uppercase border dark:border-darkBorder">{athlete.name.charAt(0)}</div>
                        )}
                        <div>
                            <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter flex items-center gap-2">
                                <ClipboardCheck className="text-blue-600 dark:text-blue-400" size={20} /> Avaliação Estruturada
                            </h2>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">{athlete.name} • {athlete.position}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Preenchimento</span>
                        <div className="w-24 h-1.5 bg-gray-100 dark:bg-darkInput rounded-full mt-0.5 overflow-hidden">
                            <div className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-700" style={{ width: `${fillProgress * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-10 animate-fade-in">
                <section className="bg-white dark:bg-darkCard p-6 rounded-2xl border border-gray-200 dark:border-darkBorder shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 transition-colors">
                    <div className="md:col-span-3 pb-2 border-b border-gray-100 dark:border-darkBorder">
                        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> Contexto da Avaliação</h3>
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Data</label>
                        <input type="date" value={evalDate} onChange={e=>setEvalDate(e.target.value)} className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Objetivo</label>
                        <select value={evalType} onChange={e=>setEvalType(e.target.value as EvaluationType)} className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                            {Object.values(EvaluationType).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Avaliador</label>
                        <div className="w-full bg-gray-100 dark:bg-darkInput/50 border border-gray-200 dark:border-darkBorder rounded-xl p-3 text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <UserIcon size={12} /> {currentUser?.name || 'Sistema'}
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Observações Qualitativas</label>
                        <textarea value={notes} onChange={e=>setNotes(e.target.value)} className="w-full bg-gray-50 dark:bg-darkInput border border-gray-200 dark:border-darkBorder dark:text-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 h-16 outline-none" placeholder="Notas sobre histórico, comportamento ou objetivos específicos..."></textarea>
                    </div>
                </section>

                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b-2 border-blue-100 dark:border-blue-900/50">
                        <TrendingUp className="text-blue-600 dark:text-blue-400" />
                        <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Fundamentos Técnicos (1-5)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {TECH_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white dark:bg-darkCard p-6 rounded-2xl border border-gray-200 dark:border-darkBorder shadow-sm transition-colors">
                                <h4 className="text-[11px] font-black text-blue-900 dark:text-blue-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                    <Target size={14} className="text-blue-400"/> {group.fundamento}
                                </h4>
                                <div className="space-y-6">
                                    {group.subs.map(sub => (
                                        <div key={sub} className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tighter">{sub}</span>
                                                <span className="text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest">{techScores[`${group.fundamento}|${sub}`] ? `Nota ${techScores[`${group.fundamento}|${sub}`]}` : 'Pendente'}</span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button 
                                                        key={score} 
                                                        onClick={() => handleTechScore(group.fundamento, sub, score)}
                                                        className={`py-3 rounded-lg text-[10px] font-black transition-all border-2 
                                                            ${techScores[`${group.fundamento}|${sub}`] === score 
                                                                ? 'bg-blue-600 dark:bg-indigo-600 text-white border-blue-700 dark:border-indigo-400 shadow-lg scale-95' 
                                                                : 'bg-gray-50 dark:bg-darkInput text-gray-300 dark:text-gray-600 border-gray-100 dark:border-darkBorder hover:border-blue-200 dark:hover:border-indigo-500'}`}
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

                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b-2 border-orange-100 dark:border-orange-900/50">
                        <Activity className="text-orange-600 dark:text-orange-400" />
                        <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Condição Física & Laboratorial</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {PHYS_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white dark:bg-darkCard p-6 rounded-2xl border border-gray-200 dark:border-darkBorder shadow-sm transition-colors">
                                <h4 className="text-[11px] font-black text-orange-900 dark:text-orange-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-3 bg-orange-600 dark:bg-orange-500 rounded-full"></div> {group.cat}
                                </h4>
                                <div className="space-y-5">
                                    {group.caps.map(cap => (
                                        <div key={cap} className="space-y-3 p-4 bg-gray-50/50 dark:bg-darkInput/50 rounded-xl border border-gray-100 dark:border-darkBorder">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{cap}</span>
                                                <div className="flex gap-0.5">
                                                    {[1,2,3,4,5].map(s => (
                                                        <div key={s} className={`h-1 w-3 rounded-full ${physInputs[cap]?.score >= s ? 'bg-orange-500 dark:bg-orange-400' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex w-full">
                                                <div className="flex gap-1 w-full">
                                                    {[1,2,3,4,5].map(s => (
                                                        <button 
                                                            key={s} 
                                                            onClick={() => handlePhysInput(cap, '', s)}
                                                            className={`flex-1 h-10 rounded-lg text-[10px] font-black transition-all
                                                                ${physInputs[cap]?.score === s ? 'bg-orange-600 dark:bg-orange-700 text-white shadow-md' : 'bg-white dark:bg-darkCard text-gray-300 dark:text-gray-600 border border-gray-200 dark:border-darkBorder hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
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

            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-darkCard border-t border-gray-200 dark:border-darkBorder p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-40 flex justify-center transition-colors">
                <div className="max-w-4xl w-full flex gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="flex-1 bg-gray-50 dark:bg-darkInput text-gray-400 dark:text-gray-500 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">Cancelar</button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="flex-[2] bg-blue-600 dark:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-blue-700 dark:hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 border-b-4 border-blue-900 dark:border-emerald-900"
                    >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        {saving ? 'Gravando...' : 'Salvar Avaliação Estruturada'}
                    </button>
                </div>
            </div>

            {/* ALERTA PADRONIZADO PARA ERROS */}
            {errorModal && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
                     <div className="bg-white dark:bg-darkCard dark:border dark:border-darkBorder rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                         <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                            <AlertCircle size={32} />
                         </div>
                         <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 mb-2 uppercase tracking-tighter">Erro na Gravação</h3>
                         <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest leading-relaxed">{errorModal}</p>
                         <button onClick={() => setErrorModal(null)} className="text-white font-black py-3 px-8 rounded-2xl transition-all w-full mt-6 shadow-lg uppercase tracking-widest text-[10px] bg-indigo-600 hover:bg-indigo-700">Tentar Novamente</button>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default TechnicalPhysicalEvaluation;
