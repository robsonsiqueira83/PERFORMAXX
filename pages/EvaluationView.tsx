
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getAthletes, getEvaluationSessions, getTechnicalEvaluations, getPhysicalEvaluations, getTrainingEntries 
} from '../services/storageService';
import { Athlete, EvaluationSession, TechnicalEvaluation, PhysicalEvaluation, TrainingEntry } from '../types';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, Cell
} from 'recharts';
import { 
  ArrowLeft, Calendar, User as UserIcon, Target, Activity, TrendingUp, TrendingDown, 
  ArrowRightLeft, Info, Download, Loader2, Zap, LayoutDashboard
} from 'lucide-react';

const EvaluationView: React.FC = () => {
    const { id, sessionId } = useParams<{ id: string, sessionId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    const [athlete, setAthlete] = useState<Athlete | null>(null);
    const [session, setSession] = useState<EvaluationSession | null>(null);
    const [allSessions, setAllSessions] = useState<EvaluationSession[]>([]);
    const [techDetails, setTechDetails] = useState<TechnicalEvaluation[]>([]);
    const [physDetails, setPhysDetails] = useState<PhysicalEvaluation[]>([]);
    
    // Comparação
    const [comparisonSessionId, setComparisonSessionId] = useState<string>('');
    const [compTechDetails, setCompTechDetails] = useState<TechnicalEvaluation[]>([]);
    const [compPhysDetails, setCompPhysDetails] = useState<PhysicalEvaluation[]>([]);

    // Relação com Jogo
    const [gameStats, setGameStats] = useState<{ avgTactical: number, sessionsCount: number } | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!id || !sessionId) return;
            setLoading(true);
            const [athletes, evals, entries] = await Promise.all([
                getAthletes(), getEvaluationSessions(id), getTrainingEntries()
            ]);

            const foundAthlete = athletes.find(a => a.id === id);
            setAthlete(foundAthlete || null);
            setAllSessions(evals);

            const activeSession = evals.find(s => s.id === sessionId);
            if (activeSession) {
                setSession(activeSession);
                const [tech, phys] = await Promise.all([
                    getTechnicalEvaluations(activeSession.id),
                    getPhysicalEvaluations(activeSession.id)
                ]);
                setTechDetails(tech);
                setPhysDetails(phys);
            }

            // Calcula relação com desempenho em jogo (RealTime)
            const athleteEntries = entries.filter(e => e.athleteId === id && e.notes?.includes('TACTICAL_ANALYSIS'));
            if (athleteEntries.length > 0) {
                const tacticalSum = athleteEntries.reduce((acc, curr) => {
                    try {
                        const parsed = JSON.parse(curr.notes || '{}');
                        return acc + (parsed.avgScore || 0);
                    } catch (e) { return acc; }
                }, 0);
                setGameStats({ avgTactical: tacticalSum / athleteEntries.length, sessionsCount: athleteEntries.length });
            }

            setLoading(false);
        };
        load();
    }, [id, sessionId]);

    useEffect(() => {
        const loadComparison = async () => {
            if (!comparisonSessionId) {
                setCompTechDetails([]);
                setCompPhysDetails([]);
                return;
            }
            const [t, p] = await Promise.all([
                getTechnicalEvaluations(comparisonSessionId),
                getPhysicalEvaluations(comparisonSessionId)
            ]);
            setCompTechDetails(t);
            setCompPhysDetails(p);
        };
        loadComparison();
    }, [comparisonSessionId]);

    // --- PROCESSAMENTO PARA GRÁFICOS ---
    const radarTechData = useMemo(() => {
        const groups = ['Passe', 'Domínio e Controle', 'Condução', 'Finalização', '1x1 Ofensivo', '1x1 Defensivo'];
        return groups.map(g => {
            const items = techDetails.filter(t => t.fundamento === g);
            const score = items.length > 0 ? items.reduce((a,b)=>a+b.nota, 0) / items.length : 0;
            const res: any = { subject: g, A: score, fullMark: 5 };
            if (comparisonSessionId) {
                const compItems = compTechDetails.filter(t => t.fundamento === g);
                res.B = compItems.length > 0 ? compItems.reduce((a,b)=>a+b.nota, 0) / compItems.length : 0;
            }
            return res;
        });
    }, [techDetails, compTechDetails, comparisonSessionId]);

    const barTechData = useMemo(() => {
        return techDetails.map(t => ({
            name: t.subfundamento,
            fund: t.fundamento,
            score: t.nota
        })).sort((a,b) => b.score - a.score);
    }, [techDetails]);

    const radarPhysData = useMemo(() => {
        const groups = [
            { name: 'Força', tests: ['Geral', 'Específica da posição'] },
            { name: 'Potência', tests: ['Aceleração', 'Mudança de direção'] },
            { name: 'Velocidade', tests: ['Arranque', 'Velocidade máxima'] },
            { name: 'Resistência', tests: ['Capacidade aeróbia', 'Repetição de esforços'] },
            { name: 'Mobilidade / Estabilidade', tests: ['Quadril', 'Tornozelo', 'Core'] }
        ];
        return groups.map(g => {
            const items = physDetails.filter(p => g.tests.includes(p.capacidade));
            const score = items.length > 0 ? items.reduce((a,b)=>a + (Number(b.scoreNormalizado) || 0), 0) / items.length : 0;
            const res: any = { subject: g.name, A: score, fullMark: 100 };
            if (comparisonSessionId) {
                const compItems = compPhysDetails.filter(p => g.tests.includes(p.capacidade));
                res.B = compItems.length > 0 ? compItems.reduce((a,b)=>a + (Number(b.scoreNormalizado) || 0), 0) / compItems.length : 0;
            }
            return res;
        });
    }, [physDetails, compPhysDetails, comparisonSessionId]);

    const evolutionData = useMemo(() => {
        return [...allSessions].reverse().map(s => ({
            date: new Date(s.date).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}),
            tech: s.scoreTecnico,
            phys: s.scoreFisico / 20 // Normalizado para escala 1-5 na visualização
        }));
    }, [allSessions]);

    const getSemanticClass = (val: number, isTech: boolean) => {
        if (isTech) {
            if (val >= 4.5) return { label: 'Alto Nível', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-600 dark:border-green-800' };
            if (val >= 3.5) return { label: 'Bom', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-500 dark:border-blue-800' };
            if (val >= 2.5) return { label: 'Funcional', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-500 dark:border-yellow-800' };
            return { label: 'Abaixo do Padrão', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-600 dark:border-red-800' };
        } else {
            if (val >= 85) return { label: 'Elite', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-600 dark:border-green-800' };
            if (val >= 70) return { label: 'Bom', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-500 dark:border-blue-800' };
            if (val >= 50) return { label: 'Funcional', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-500 dark:border-yellow-800' };
            return { label: 'Risco / Regressão', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-600 dark:border-red-800' };
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-gray-900"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>;
    if (!athlete || !session) return <div className="p-10 text-center dark:bg-darkBase dark:text-gray-400">Dados não encontrados.</div>;

    const techSem = getSemanticClass(session.scoreTecnico, true);
    const physSem = getSemanticClass(session.scoreFisico, false);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-darkBase pb-32 transition-colors duration-300">
            {/* Header Fixo de Navegação */}
            <div className="bg-white dark:bg-darkCard border-b border-gray-200 dark:border-darkBorder sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-5">
                    <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors bg-gray-50 dark:bg-darkInput p-2 rounded-full border border-gray-100 dark:border-darkBorder"><ArrowLeft size={22}/></button>
                    <div>
                        <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter flex items-center gap-2">Relatório Estruturado TÉC & FÍS</h2>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest">{athlete.name} • {athlete.position}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="relative hidden sm:block">
                        <ArrowRightLeft className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                        <select 
                            value={comparisonSessionId} 
                            onChange={e => setComparisonSessionId(e.target.value)} 
                            className="bg-gray-100 dark:bg-darkInput border-none rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase text-gray-600 dark:text-gray-400 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                        >
                            <option value="">Comparar com...</option>
                            {allSessions.filter(s => s.id !== sessionId).map(s => (
                                <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} - {s.type}</option>
                            ))}
                        </select>
                    </div>
                    <button className="bg-gray-900 dark:bg-darkInput text-white p-2.5 rounded-xl hover:bg-black dark:hover:bg-indigo-900/50 transition-all shadow-md active:scale-95 border border-transparent dark:border-darkBorder"><Download size={20}/></button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-12">
                
                {/* BLOCO 1: RESUMO GERAL */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                    <div className="md:col-span-1 bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col justify-center">
                        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Calendar size={12}/> Dados da Sessão</span>
                        <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter mb-6">{new Date(session.date).toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'})}</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-gray-50/50 dark:bg-darkInput/30 p-4 rounded-2xl border border-gray-50 dark:border-darkBorder">
                                <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Objetivo</span>
                                <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">{session.type}</span>
                            </div>
                            <div className="flex justify-between items-center bg-gray-50/50 dark:bg-darkInput/30 p-4 rounded-2xl border border-gray-50 dark:border-darkBorder">
                                <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Avaliador</span>
                                <span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">ID: {session.evaluatorId.substring(0,8)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col items-center text-center">
                        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Nota Técnica Média</span>
                        <div className="text-7xl font-black text-blue-600 dark:text-blue-400 tracking-tighter mb-3 leading-none">{session.scoreTecnico.toFixed(1)}</div>
                        <span className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${techSem.border} ${techSem.bg} ${techSem.color}`}>{techSem.label}</span>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-darkInput rounded-full mt-8 overflow-hidden">
                            <div className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-1000" style={{ width: `${(session.scoreTecnico / 5) * 100}%` }}></div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col items-center text-center">
                        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Score Físico Global</span>
                        <div className="text-7xl font-black text-green-600 dark:text-green-400 tracking-tighter mb-3 leading-none">{session.scoreFisico.toFixed(0)}%</div>
                        <span className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${physSem.border} ${physSem.bg} ${physSem.color}`}>{physSem.label}</span>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-darkInput rounded-full mt-8 overflow-hidden">
                            <div className="h-full bg-green-600 dark:bg-green-500 transition-all duration-1000" style={{ width: `${session.scoreFisico}%` }}></div>
                        </div>
                    </div>
                </section>

                {/* BLOCO 2: PERFIL TÉCNICO (FUNDAMENTOS) */}
                <section className="space-y-8">
                    <div className="flex items-center gap-4 pb-2 border-b-2 border-blue-100 dark:border-blue-900">
                        <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-100 dark:shadow-none"><Target size={24}/></div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Mapeamento Técnico de Fundamentos</h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <div className="bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm h-[450px]">
                            <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Radar de Dominância Técnica</h4>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarTechData}>
                                    <PolarGrid stroke="#334155" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                    <Radar name="Sessão Atual" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.6} />
                                    {comparisonSessionId && <Radar name="Referência" dataKey="B" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.4} />}
                                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '20px' }} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm overflow-y-auto max-h-[450px] custom-scrollbar">
                            <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Detalhamento por Sub-fundamento</h4>
                            <div className="space-y-5">
                                {barTechData.map((t, idx) => (
                                    <div key={idx} className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-tighter">
                                            <span>{t.fund}: <span className="text-gray-900 dark:text-gray-100 font-black">{t.name}</span></span>
                                            <span className="text-blue-600 dark:text-blue-400 font-mono">Nota {t.score.toFixed(1)}</span>
                                        </div>
                                        <div className="w-full h-3 bg-gray-100 dark:bg-darkInput rounded-full overflow-hidden flex">
                                            <div className={`h-full transition-all duration-1000 ${t.score >= 4 ? 'bg-green-500 dark:bg-green-400' : t.score >= 2.5 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-red-500 dark:bg-red-400'}`} style={{ width: `${(t.score / 5) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* BLOCO 3: PERFIL FÍSICO (CAPACIDADES) */}
                <section className="space-y-8">
                    <div className="flex items-center gap-4 pb-2 border-b-2 border-green-100 dark:border-green-900">
                        <div className="bg-green-600 p-2.5 rounded-2xl text-white shadow-lg shadow-green-100 dark:shadow-none"><Activity size={24}/></div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Perfil de Capacidades Físicas</h2>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                         <div className="bg-white dark:bg-darkCard p-8 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm h-[450px]">
                            <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Equilíbrio Físico (0-100)</h4>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarPhysData}>
                                    <PolarGrid stroke="#334155" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name="Sessão Atual" dataKey="A" stroke="#16a34a" fill="#22c55e" fillOpacity={0.6} />
                                    {comparisonSessionId && <Radar name="Referência" dataKey="B" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.4} />}
                                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '20px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
                            {physDetails.map((p, idx) => (
                                <div key={idx} className="bg-white dark:bg-darkCard p-5 rounded-3xl border border-gray-100 dark:border-darkBorder shadow-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-darkInput/30 transition-colors">
                                    <div className="flex-1">
                                        <h5 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{p.capacidade}</h5>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xl font-black text-gray-800 dark:text-gray-100 tracking-tighter">{p.valorBruto || '--'}</span>
                                            <div className="flex-1 h-2 bg-gray-100 dark:bg-darkInput rounded-full overflow-hidden">
                                                <div className="h-full bg-green-500 dark:bg-green-400 transition-all duration-1000" style={{ width: `${p.scoreNormalizado}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ml-6 text-center min-w-[60px] border-l border-gray-50 dark:border-darkBorder pl-6">
                                        <span className="block text-[9px] font-black text-gray-300 dark:text-gray-600 uppercase mb-0.5">Score</span>
                                        <span className="text-2xl font-black text-green-600 dark:text-green-400">{p.scoreNormalizado.toFixed(0)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* BLOCO 4: EVOLUÇÃO TEMPORAL */}
                <section className="space-y-8">
                    <div className="flex items-center gap-4 pb-2 border-b-2 border-gray-200 dark:border-darkBorder">
                        <div className="bg-gray-800 dark:bg-darkInput p-2.5 rounded-2xl text-white shadow-lg"><TrendingUp size={24}/></div>
                        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter">Histórico e Tendências de Evolução</h2>
                    </div>
                    <div className="bg-white dark:bg-darkCard p-10 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm">
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={evolutionData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 900}} />
                                    <YAxis domain={[0, 5]} hide />
                                    <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', backgroundColor: '#1c2d3c', color: '#fff' }} />
                                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', paddingTop: '30px' }} />
                                    <Line name="Evolução Técnica" type="monotone" dataKey="tech" stroke="#2563eb" strokeWidth={5} dot={{ r: 8, strokeWidth: 3, fill: '#fff', stroke: '#2563eb' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                                    <Line name="Evolução Física" type="monotone" dataKey="phys" stroke="#16a34a" strokeWidth={5} dot={{ r: 8, strokeWidth: 3, fill: '#fff', stroke: '#16a34a' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-50 dark:border-darkBorder">
                            <div className="flex items-start gap-4">
                                <TrendingUp className="text-green-500 dark:text-green-400 shrink-0" size={20} />
                                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium leading-relaxed">A linha <span className="text-blue-600 dark:text-blue-400 font-black">Técnica</span> utiliza a média ponderada de todos os fundamentos avaliados em snapshots de treino controlado.</p>
                            </div>
                            <div className="flex items-start gap-4">
                                <Info className="text-blue-500 dark:text-blue-400 shrink-0" size={20} />
                                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium leading-relaxed">A linha <span className="text-green-600 dark:text-green-400 font-black">Física</span> normaliza os testes laboratoriais e de campo para uma escala visual compatível de desenvolvimento.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* INTEGRAÇÃO COM DESEMPENHO EM JOGO */}
                <section className="bg-gradient-to-br from-blue-950 to-blue-900 dark:from-darkCard dark:to-darkInput rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden border border-transparent dark:border-darkBorder">
                    <div className="absolute top-0 right-0 p-10 opacity-10"><LayoutDashboard size={200} /></div>
                    <div className="flex items-center gap-8 relative z-10">
                        <div className="bg-blue-800/50 dark:bg-darkInput/50 p-6 rounded-[32px] border border-blue-700 dark:border-darkBorder shadow-2xl backdrop-blur-md">
                            <Zap className="text-yellow-400" size={48} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Cruzamento de Dados de Jogo</h3>
                            <p className="text-blue-200 dark:text-gray-400 text-sm mt-2 max-w-sm font-medium">Correlação entre o domínio técnico do snapshot e o impacto tático real observado em partidas monitoradas.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 w-full md:w-auto relative z-10">
                        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-[32px] border border-white/10 dark:border-darkBorder text-center min-w-[180px] shadow-2xl">
                            <span className="block text-[10px] font-black text-blue-300 dark:text-blue-400 uppercase mb-2 tracking-widest">Impacto Tático (Média)</span>
                            <span className="text-4xl font-black tracking-tighter">{(gameStats?.avgTactical || 0).toFixed(2)}</span>
                            <div className="text-[10px] font-bold text-blue-300 dark:text-blue-400 mt-2 uppercase">RealTime Analysis</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-[32px] border border-white/10 dark:border-darkBorder text-center min-w-[180px] shadow-2xl">
                            <span className="block text-[10px] font-black text-blue-300 dark:text-blue-400 uppercase mb-2 tracking-widest">Amostra de Jogos</span>
                            <span className="text-4xl font-black tracking-tighter">{gameStats?.sessionsCount || '0'}</span>
                            <div className="text-[10px] font-bold text-blue-300 dark:text-blue-400 mt-2 uppercase">Partidas Registradas</div>
                        </div>
                    </div>
                </section>

                {/* NOTAS E OBSERVAÇÕES FINAIS */}
                <div className="bg-white dark:bg-darkCard p-10 rounded-[40px] border border-gray-100 dark:border-darkBorder shadow-sm relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 dark:bg-blue-500 transition-all duration-500 group-hover:w-3"></div>
                    <h4 className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3"><Info size={16} className="text-blue-500 dark:text-blue-400"/> Interpretação da Comissão Técnica</h4>
                    <div className="prose prose-blue dark:prose-invert max-w-none">
                        <p className="text-gray-700 dark:text-gray-300 italic text-lg leading-relaxed font-medium">"{session.notes || 'Nenhuma nota de interpretação técnica foi registrada para esta sessão de avaliação.'}"</p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default EvaluationView;
