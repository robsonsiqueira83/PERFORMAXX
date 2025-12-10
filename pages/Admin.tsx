import React, { useState, useEffect } from 'react';
import { 
  getTeams, saveTeam, deleteTeam, 
  getCategories, saveCategory, deleteCategory
} from '../services/storageService';
import { Team, Category, UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Plus, Save, Settings, Loader2, ExternalLink, Link as LinkIcon, Copy } from 'lucide-react';

interface AdminProps {
  userRole: UserRole;
  currentTeamId: string;
}

const Admin: React.FC<AdminProps> = ({ userRole, currentTeamId }) => {
  const [activeTab, setActiveTab] = useState<'teams' | 'categories'>('teams');
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Editing State
  const [editingTeam, setEditingTeam] = useState<Partial<Team> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  const canEdit = ['MASTER', 'TECNICO', 'AUXILIAR', 'SCOUT'].includes(userRole);
  const canDelete = ['MASTER', 'TECNICO', 'AUXILIAR'].includes(userRole);

  useEffect(() => {
    refreshData();
  }, [currentTeamId]);

  const refreshData = async () => {
    setLoading(true);
    const t = await getTeams();
    setTeams(t);
    
    const c = await getCategories();
    setCategories(c.filter(item => item.teamId === currentTeamId));
    setLoading(false);
  };

  // --- Handlers for Team ---
  const handleSaveTeam = async () => {
    if (!editingTeam?.name) return;
    await saveTeam({ id: editingTeam.id || uuidv4(), name: editingTeam.name, logoUrl: editingTeam.logoUrl } as Team);
    setEditingTeam(null);
    await refreshData();
  };

  const handleDeleteTeam = async (id: string) => {
    if(confirm("Tem certeza que deseja excluir este time?")) {
        await deleteTeam(id);
        await refreshData();
    }
  };

  // --- Handlers for Category ---
  const handleSaveCategory = async () => {
    if (!editingCategory?.name) return;
    await saveCategory({ id: editingCategory.id || uuidv4(), name: editingCategory.name, teamId: currentTeamId } as Category);
    setEditingCategory(null);
    await refreshData();
  };

  const handleDeleteCategory = async (id: string) => {
      if(confirm("Excluir categoria?")) {
        await deleteCategory(id);
        await refreshData();
      }
  };

  const inputClass = "w-full bg-gray-100 border border-gray-300 text-black rounded p-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (loading && teams.length === 0) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center gap-2">
         <Settings className="text-blue-600" />
         <h2 className="text-2xl font-bold text-gray-800">Administração</h2>
      </div>
      
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
         <button onClick={() => setActiveTab('teams')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'teams' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>Times</button>
         <button onClick={() => setActiveTab('categories')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'categories' ? 'border-b-2 border-blue-600 text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>Categorias</button>
      </div>

      <div className="p-6">
        
        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <div>
            <div className="mb-6 flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">Gerenciar Times</h3>
               {canEdit && <button onClick={() => setEditingTeam({})} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><Plus size={16}/> Novo Time</button>}
            </div>
            
            {editingTeam && (
               <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <input type="text" placeholder="Nome do Time" className={inputClass} value={editingTeam.name || ''} onChange={e => setEditingTeam({...editingTeam, name: e.target.value})} />
                     <button onClick={handleSaveTeam} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700">Salvar</button>
                  </div>
               </div>
            )}

            <div className="space-y-2">
               {teams.map(team => {
                 const publicLink = `https://performaxx.vercel.app/#/p/team/${team.id}`;
                 
                 return (
                    <div key={team.id} className="flex flex-col md:flex-row justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 w-full">
                            <span className="font-medium text-gray-800 whitespace-nowrap min-w-[120px]">{team.name}</span>
                            
                            {/* Public Link Box */}
                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1.5 w-full sm:max-w-md shadow-sm">
                                <LinkIcon size={12} className="text-gray-400 flex-shrink-0" />
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={publicLink} 
                                    className="text-xs text-gray-600 bg-transparent border-none focus:outline-none flex-1 min-w-0"
                                    onClick={(e) => e.currentTarget.select()}
                                />
                                <div className="flex items-center border-l border-gray-200 pl-1 ml-1 gap-1 flex-shrink-0">
                                    <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(publicLink);
                                          alert('Link copiado!');
                                        }}
                                        className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                                        title="Copiar Link"
                                    >
                                        <Copy size={14} />
                                    </button>
                                    <a 
                                        href={publicLink} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                                        title="Abrir em nova aba"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto justify-end">
                        {canEdit && <button onClick={() => setEditingTeam(team)} className="text-blue-600 p-2 hover:bg-blue-50 rounded"><Edit size={16}/></button>}
                        {canDelete && teams.length > 1 && <button onClick={() => handleDeleteTeam(team.id)} className="text-red-600 p-2 hover:bg-red-50 rounded"><Trash2 size={16}/></button>}
                        </div>
                    </div>
                 );
               })}
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
           <div>
             <div className="mb-6 flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">Categorias ({teams.find(t => t.id === currentTeamId)?.name})</h3>
               {canEdit && <button onClick={() => setEditingCategory({})} className="bg-[#4ade80] hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><Plus size={16}/> Nova Categoria</button>}
            </div>

            {editingCategory && (
               <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <input type="text" placeholder="Nome (Ex: Sub-13)" className={inputClass} value={editingCategory.name || ''} onChange={e => setEditingCategory({...editingCategory, name: e.target.value})} />
                     <button onClick={handleSaveCategory} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700">Salvar</button>
                  </div>
               </div>
            )}

            <div className="space-y-2">
               {categories.map(cat => (
                 <div key={cat.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="font-medium text-gray-800">{cat.name}</span>
                    <div className="flex gap-2">
                       {canEdit && <button onClick={() => setEditingCategory(cat)} className="text-blue-600 p-2 hover:bg-blue-50 rounded"><Edit size={16}/></button>}
                       {canDelete && <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-600 p-2 hover:bg-red-50 rounded"><Trash2 size={16}/></button>}
                    </div>
                 </div>
               ))}
            </div>
           </div>
        )}

      </div>
    </div>
  );
};

export default Admin;