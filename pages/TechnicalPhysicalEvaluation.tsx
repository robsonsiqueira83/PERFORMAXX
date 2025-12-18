import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, 
  saveEvaluationSession,
  getEvaluationSessions
} from '../services/storageService';
import { Athlete, EvaluationType, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation, User } from '../types';
import { 
  ArrowLeft, Save, X, Loader2, Calendar as CalendarIcon, Info, ClipboardCheck, TrendingUp, Activity, User as UserIcon, CheckCircle
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

    // Session Data
    const [evalDate, setEvalDate] = useState(new Date().toISOString().split('T')[0]);
    const [evalType, setEvalType] = useState<EvaluationType>(EvaluationType.MENSUAL);
    const [notes, setNotes] = useState('');

    // Tech State
    const [techScores, setTechScores] = useState<Record<string, number>>({});
    // Phys State
    const [physInputs, setPhysInputs] = useState<Record<string, { val: string, score: number }>>({});

    useEffect(() => {
        const storedUser = localStorage.getItem('performax_current_user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));

        const load = async () => {
            setLoading(true);
            const allAthletes = await getAthletes();
            const found = allAthletes.find(a => a.id === id);
            if (found) setAthlete(found);
            setLoading(false);
        };
        load();
    }, [id]);

    const handleTechScore = (fund: string, sub: string, score: number) => {
        setTechScores(prev => ({ ...prev, [`${fund}|${sub}`]: score }));
    };

    const handlePhysInput = (cap: string, value: string, directScore?: number) => {
        // Simple normalization: if value is provided and can be scored, or use direct score 1-5
        let score = directScore || 0;
        if (!directScore) {
            // Placeholder logic for normalization. In a real app, this would use tables based on category/position.
            const num = parseFloat(value);
            if (!isNaN(num)) score = Math.min(5, Math.max(1, num / 20)); // Dummy map
        }
        setPhysInputs(prev => ({ ...prev, [cap]: { val: value, score } }));
    };

    const calculateScores = () => {
        // Fix Error in file pages/TechnicalPhysicalEvaluation.tsx on line 80: Explicitly cast Object.values to number[]
        const techVals = Object.values(techScores) as number[];
        const avgTech = techVals.length > 0 ? (techVals.reduce((a, b) => a + b, 0) / techVals.length) : 0;
        
        // Fix Error in file pages/TechnicalPhysicalEvaluation.tsx on line 82: Explicitly cast Object.values to the specific entry type
        const physVals = (Object.values(physInputs) as { val: string, score: number }[]).map(i => i.score);
        const avgPhys = physVals.length > 0 ? (physVals.reduce((a, b) => a + b, 0) / physVals.length) : 0;
        
        return { avgTech, avgPhys };
    };

    const handleSave = async () => {
        if (!athlete || !currentUser) return;
        setSaving(true);

        const { avgTech, avgPhys } = calculateScores();
        const sessionId = uuidv4();

        const session: EvaluationSession = {
            id: sessionId,
            athleteId: athlete.id,
            date: evalDate,
            type: evalType,
            evaluatorId: currentUser.id,
            scoreTecnico: avgTech,
            scoreFisico: avgPhys,
            notes
        };

        // Fix Error in file pages/TechnicalPhysicalEvaluation.tsx on line 106: Explicitly cast Object.entries to ensure types are correct
        const technicals: TechnicalEvaluation[] = (Object.entries(techScores) as [string, number][]).map(([key, nota]) => {
            const [fundamento, subfundamento] = key.split('|');
            return { sessionId, fundamento, subfundamento, nota };
        });

        // Fix Error in file pages/TechnicalPhysicalEvaluation.tsx on lines 114 and 115: Explicitly cast Object.entries to ensure types are correct
        const physicals: PhysicalEvaluation[] = (Object.entries(physInputs) as [string, { val: string, score: number }][]).map(([capacidade, data]) => ({
            sessionId,
            capacidade,
            valorBruto: data.val,
            scoreNormalizado: (data.score / 5) * 100 // Normalize to 0-100
        }));

        try {
            await saveEvaluationSession(session, technicals, physicals);
            navigate(`/athletes/${athlete.id}`);
        } catch (err) {
            alert("Erro ao salvar avaliação.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
    if (!athlete) return <div className="p-10 text-center">Atleta não encontrado.</div>;

    const fillProgress = (Object.keys(techScores).length + Object.keys(physInputs).length) / (TECH_CONFIG.reduce((a,c)=>a+c.subs.length,0) + PHYS_CONFIG.reduce((a,c)=>a+c.caps.length,0));

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="text-gray-400 hover:text-blue-600"><ArrowLeft size={24}/></button>
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                            <ClipboardCheck className="text-blue-600" /> Avaliação Técnica & Física
                        </h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{athlete.name} • {athlete.position}</p>
                    </div>
                </div>
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200 hidden md:block">
                    <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${fillProgress * 100}%` }}></div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-6 space-y-8">
                
                {/* SEÇÃO 1 – Dados da Sessão */}
                <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-3 pb-2 border-b border-gray-100">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Info size={14}/> Dados da Sessão</h3>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Data da Avaliação</label>
                        <input type="date" value={evalDate} onChange={e=>setEvalDate(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Tipo de Avaliação</label>
                        <select value={evalType} onChange={e=>setEvalType(e.target.value as EvaluationType)} className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500">
                            {Object.values(EvaluationType).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Avaliador</label>
                        <div className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-500 flex items-center gap-2">
                            <UserIcon size={14} /> {currentUser?.name}
                        </div>
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Observações Gerais</label>
                        <textarea value={notes} onChange={e=>setNotes(e.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 h-20" placeholder="Histórico clínico, pontos de destaque ou comportamentais..."></textarea>
                    </div>
                </section>

                {/* SEÇÃO 2 – Avaliação dos Fundamentos Técnicos */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b-2 border-blue-100">
                        <TrendingUp className="text-blue-600" />
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Avaliação Técnica (Fundamentos)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {TECH_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <h4 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <div className="w-2 h-4 bg-blue-600 rounded"></div> {group.fundamento}
                                </h4>
                                <div className="space-y-6">
                                    {group.subs.map(sub => (
                                        <div key={sub} className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-gray-600">{sub}</span>
                                                <span className="text-[10px] font-black text-blue-500 uppercase">{techScores[`${group.fundamento}|${sub}`] ? `Nível ${techScores[`${group.fundamento}|${sub}`]}` : 'Não avaliado'}</span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-1">
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button 
                                                        key={score} 
                                                        onClick={() => handleTechScore(group.fundamento, sub, score)}
                                                        className={`py-3 rounded-lg text-xs font-black transition-all border-2 
                                                            ${techScores[`${group.fundamento}|${sub}`] === score 
                                                                ? 'bg-blue-600 text-white border-blue-700 shadow-inner scale-95' 
                                                                : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-blue-200'}`}
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

                {/* SEÇÃO 3 – Avaliação da Condição Física */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3 pb-2 border-b-2 border-orange-100">
                        <Activity className="text-orange-600" />
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Avaliação Física (Capacidades)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {PHYS_CONFIG.map((group, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h4 className="text-sm font-black text-orange-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <div className="w-2 h-4 bg-orange-600 rounded"></div> {group.cat}
                                </h4>
                                <div className="space-y-6">
                                    {group.caps.map(cap => (
                                        <div key={cap} className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-gray-600">{cap}</span>
                                                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-orange-500 transition-all" style={{ width: `${(physInputs[cap]?.score || 0) * 20}%` }}></div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    placeholder="Valor bruto (ex: 5.2s)" 
                                                    value={physInputs[cap]?.val || ''}
                                                    onChange={e => handlePhysInput(cap, e.target.value)}
                                                    className="flex-1 bg-white border border-gray-300 rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                                                />
                                                <div className="flex gap-1">
                                                    {[1,2,3,4,5].map(s => (
                                                        <button 
                                                            key={s} 
                                                            onClick={() => handlePhysInput(cap, physInputs[cap]?.val || '', s)}
                                                            className={`w-6 h-8 rounded text-[10px] font-black transition-all
                                                                ${physInputs[cap]?.score === s ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-400'}`}
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

            {/* Footer Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-2xl z-40 flex justify-center">
                <div className="max-w-5xl w-full flex gap-4">
                    <button onClick={() => navigate(`/athletes/${id}`)} className="flex-1 bg-gray-100 text-gray-500 font-black py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-gray-200 transition-all">Cancelar</button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                        {saving ? 'Salvando...' : 'Salvar Avaliação Estruturada'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TechnicalPhysicalEvaluation;