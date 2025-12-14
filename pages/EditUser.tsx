import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useConfirm } from '../contexts/ConfirmationContext';
import { UserRole, User } from '../types';
import { processProfilePhoto } from '../services/imageUtils';
import { 
    ArrowLeft, Save, Trash2, Camera, Loader2, User as UserIcon, 
    Mail, Sparkles, Key, ExternalLink, CheckCircle2, AlertOctagon,
    Check, Briefcase, Shield
} from 'lucide-react';

export const EditUser: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { users, user: currentUser, updateUser, deleteUser, logout, teams } = useAuth();
    const { showNotification } = useNotification();
    const { requestConfirmation } = useConfirm();
    
    const [formData, setFormData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isMaster = currentUser?.role === UserRole.MASTER;

    useEffect(() => {
        // Aguarda users carregar se estiver vazio, ou processa se já tiver dados
        if (users.length > 0 && userId) {
            const foundUser = users.find(u => u.id === userId);
            
            if (foundUser) {
                // Security check
                const canEdit = isMaster || currentUser?.id === foundUser.id;
                
                if (!canEdit) {
                    showNotification('error', 'Acesso Negado', 'Você não tem permissão para editar este usuário.');
                    navigate('/team');
                    return;
                }
                
                // Deep copy to avoid mutating context directly and ensure teamIds is array
                const userCopy = JSON.parse(JSON.stringify(foundUser));
                userCopy.teamIds = Array.isArray(userCopy.teamIds) ? userCopy.teamIds : [];
                
                setFormData(userCopy);
            } else {
                // Se não achou usuário mas users já carregou, volta.
                showNotification('error', 'Erro', 'Usuário não encontrado.');
                navigate('/team');
            }
            setIsLoading(false);
        } else if (users.length === 0) {
            // Ainda carregando users... mantem loading
            setIsLoading(true);
        }
    }, [userId, users, currentUser, isMaster, navigate, showNotification]);

    // Render loading state
    if (isLoading || !formData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="animate-spin text-indigo-600 mb-2" size={32} />
                <p className="text-gray-500 font-medium">Carregando perfil...</p>
            </div>
        );
    }

    const isSelf = currentUser?.id === formData.id;
    const isGuest = formData.ownerId !== currentUser?.id;

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !formData) return;

        setIsProcessingImage(true);
        try {
            const processedImage = await processProfilePhoto(file);
            setFormData(prev => prev ? ({ ...prev, photoUrl: processedImage }) : null);
        } catch (error) {
            showNotification('error', 'Erro na Imagem', 'Falha ao processar a imagem.');
        } finally {
            setIsProcessingImage(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData) {
            await updateUser(formData.id, formData);
            showNotification('success', 'Salvo', 'Perfil atualizado com sucesso.');
            navigate('/team');
        }
    };

    const handleDeleteAccount = () => {
        if (!formData || !currentUser) return;

        if (isSelf && isMaster) {
            const userTeams = teams.filter(t => t.ownerId === currentUser.id);
            if (userTeams.length > 0) {
                showNotification('error', 'Exclusão Bloqueada', `Você ainda possui ${userTeams.length} equipes cadastradas. Exclua-as primeiro.`);
                return;
            }
        }

        const confirmMessage = isSelf 
          ? "ATENÇÃO: Esta ação é irreversível e apagará todos os seus dados. Tem certeza absoluta?" 
          : `Tem certeza que deseja remover o usuário ${formData.name} do sistema?`;

        requestConfirmation({
            title: "Excluir Conta",
            message: confirmMessage,
            onConfirm: async () => {
                  await deleteUser(formData.id);
                  if (isSelf) {
                      logout();
                      navigate('/login');
                  } else {
                      showNotification('success', 'Usuário Removido', 'O usuário foi excluído com sucesso.');
                      navigate('/team');
                  }
            },
            type: 'danger',
            confirmLabel: 'Excluir Permanentemente'
        });
    };

    const toggleTeamSelection = (teamId: string) => {
        if (!formData) return;
        let currentTeams = Array.isArray(formData.teamIds) ? [...formData.teamIds] : [];
  
        if (teamId === 'all') {
            if (currentTeams.includes('all')) {
                currentTeams = [];
            } else {
                currentTeams = ['all'];
            }
        } else {
            if (currentTeams.includes('all')) {
                currentTeams = [teamId];
            } else {
                if (currentTeams.includes(teamId)) {
                    currentTeams = currentTeams.filter(id => id !== teamId);
                } else {
                    currentTeams.push(teamId);
                }
            }
        }
        setFormData({ ...formData, teamIds: currentTeams });
    };

    // Safe accessors for rendering
    const safeTeamIds = formData.teamIds || [];

    return (
        <div className="max-w-4xl mx-auto pb-10 animate-fade-in">
            <button onClick={() => navigate('/team')} className="flex items-center text-gray-500 hover:text-gray-800 mb-6 font-medium">
                <ArrowLeft size={16} className="mr-1" /> Voltar para Equipe
            </button>

            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-8 text-white">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                            <Shield size={32} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black">Editar Perfil</h1>
                            <p className="text-indigo-100 font-medium">
                                {isGuest ? 'Gerenciando acesso de usuário convidado' : 'Gerencie dados pessoais e permissões'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <form onSubmit={handleSave} className="space-y-8">
                        
                        <div className="grid md:grid-cols-3 gap-8">
                            {/* Coluna da Esquerda: Foto */}
                            <div className="md:col-span-1 flex flex-col items-center space-y-4">
                                <div 
                                    className={`relative group w-40 h-40 rounded-full overflow-hidden border-4 border-gray-100 shadow-lg ${isSelf ? 'cursor-pointer hover:border-indigo-100' : ''}`}
                                    onClick={() => isSelf && fileInputRef.current?.click()}
                                >
                                    {formData.photoUrl ? (
                                        <img src={formData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
                                            <UserIcon size={64} />
                                        </div>
                                    )}
                                    
                                    {isSelf && (
                                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isProcessingImage ? <Loader2 className="animate-spin text-white" /> : <Camera className="text-white mb-1" />}
                                            <span className="text-white text-xs font-bold uppercase tracking-wide">Alterar</span>
                                        </div>
                                    )}
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    disabled={!isSelf}
                                />
                                {isSelf && <p className="text-xs text-gray-500 text-center max-w-[150px]">Clique na foto para alterar.</p>}
                            </div>

                            {/* Coluna da Direita: Dados */}
                            <div className="md:col-span-2 space-y-6">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome Completo</label>
                                        <div className="relative">
                                            <UserIcon size={18} className="absolute left-3 top-3.5 text-gray-400" />
                                            <input 
                                                type="text"
                                                required
                                                value={formData.name}
                                                onChange={e => setFormData({...formData, name: e.target.value})}
                                                disabled={!isSelf}
                                                className={`w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isSelf ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-800'}`}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">E-mail</label>
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-3 top-3.5 text-gray-400" />
                                            <input 
                                                type="email"
                                                required
                                                value={formData.email}
                                                onChange={e => setFormData({...formData, email: e.target.value})}
                                                disabled={!isSelf}
                                                className={`w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isSelf ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-800'}`}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* API Key Section */}
                                {isSelf && (
                                    <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                                        {isMaster ? (
                                            <>
                                                <label className="block text-xs font-bold text-purple-700 uppercase mb-2 flex items-center gap-1">
                                                    <Sparkles size={14} /> Chave de API da Organização (Master)
                                                </label>
                                                <div className="flex gap-2 mb-2">
                                                    <div className="relative flex-1">
                                                        <Key size={18} className="absolute left-3 top-3.5 text-purple-400" />
                                                        <input 
                                                            type="password"
                                                            placeholder="Cole a API Key do Gemini aqui..."
                                                            value={formData.geminiApiKey || ''}
                                                            onChange={e => setFormData({...formData, geminiApiKey: e.target.value})}
                                                            className="w-full pl-10 pr-4 py-3 border border-purple-200 bg-white rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-800"
                                                        />
                                                    </div>
                                                    <a 
                                                        href="https://aistudio.google.com/api-keys" 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="bg-yellow-500 text-white hover:bg-yellow-600 rounded-xl px-4 flex items-center justify-center transition-colors font-bold text-xs gap-1 shadow-sm whitespace-nowrap"
                                                    >
                                                        <ExternalLink size={16} /> Gerar Chave
                                                    </a>
                                                </div>
                                                <div className="bg-white/50 border border-purple-100 rounded-lg p-3">
                                                    <p className="text-xs text-green-700 font-bold flex items-center gap-1 mb-1">
                                                        <CheckCircle2 size={14} /> Nível 1 - Gratuito Garantido
                                                    </p>
                                                    <p className="text-[11px] text-gray-600 leading-tight">
                                                        O sistema está travado nos modelos Gemini Flash, garantindo o uso do plano gratuito do Google AI Studio.
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-2 rounded-lg border border-purple-100">
                                                    <Sparkles className="text-purple-500" size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-purple-900">IA Gerenciada pela Organização</h4>
                                                    <p className="text-xs text-purple-700">Você utiliza a chave configurada pelo Master da equipe.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Permissions Section */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1 flex items-center gap-1">
                                        <Briefcase size={14} /> Equipes com Acesso
                                    </label>
                                    <div className="border border-gray-200 rounded-xl bg-gray-50 p-2 max-h-60 overflow-y-auto">
                                        {/* Global Access Option */}
                                        <div 
                                            onClick={() => toggleTeamSelection('all')}
                                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border mb-1 ${safeTeamIds.includes('all') ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-white'}`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${safeTeamIds.includes('all') ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                                                <Check size={14} strokeWidth={3} />
                                            </div>
                                            <span className={`text-sm font-bold ${safeTeamIds.includes('all') ? 'text-indigo-900' : 'text-gray-600'}`}>🌐 Acesso Global (Todas)</span>
                                        </div>

                                        {teams.map(team => {
                                            const isSelected = safeTeamIds.includes(team.id);
                                            const isAll = safeTeamIds.includes('all');
                                            return (
                                                <div 
                                                    key={team.id}
                                                    onClick={() => !isAll && toggleTeamSelection(team.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-lg transition-all border mb-1 ${isAll ? 'opacity-50 cursor-not-allowed border-transparent' : 'cursor-pointer'} ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-white'}`}
                                                >
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                                                        <Check size={14} strokeWidth={3} />
                                                    </div>
                                                    <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-600'}`}>{team.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                            <button 
                                type="button"
                                onClick={() => navigate('/team')}
                                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                disabled={isProcessingImage}
                                className={`px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors flex items-center gap-2 ${isProcessingImage ? 'opacity-70 cursor-wait' : ''}`}
                            >
                                <Save size={20} /> Salvar Alterações
                            </button>
                        </div>
                    </form>

                    {/* DANGER ZONE */}
                    <div className="mt-10 bg-red-50 rounded-xl p-6 border border-red-100 flex items-start gap-4">
                        <div className="bg-white p-3 rounded-full text-red-600 shadow-sm">
                            <AlertOctagon size={24} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-red-800 uppercase text-sm tracking-wider mb-1">Zona de Perigo</h4>
                            <p className="text-sm text-red-700 mb-4 leading-relaxed">
                                {isGuest 
                                    ? "Você pode remover o acesso deste convidado à sua organização, mas não pode excluir a conta dele." 
                                    : `Esta ação excluirá permanentemente a conta e todos os dados associados. ${isSelf ? "Recomendamos que você remova todas as equipes e membros antes de prosseguir." : ""}`
                                }
                            </p>
                            
                            {isSelf && (
                                <button 
                                    type="button"
                                    onClick={handleDeleteAccount}
                                    className="px-5 py-2.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Trash2 size={14} /> Excluir Minha Conta
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};