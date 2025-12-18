
import React from 'react';
import { Team } from '../types';

interface PublicHeaderProps {
  team?: Team | null;
}

const PublicHeader: React.FC<PublicHeaderProps> = ({ team }) => {
  return (
    <div className="bg-white dark:bg-darkCard shadow-sm sticky top-0 z-50 transition-colors">
      {/* Top Bar */}
      <div className="bg-[#1e3a8a] text-white py-4 px-6 border-b border-blue-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <img 
             src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO3.png" 
             alt="PERFORMAXX" 
             className="h-8 object-contain"
           />
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 hidden md:block">Performance Intelligence</span>
        </div>
      </div>
      
      {/* Context Bar */}
      {team && (
        <div className="bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder py-5 px-6">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="w-14 h-14 object-contain rounded-xl border border-gray-100 dark:border-darkBorder shadow-sm" />
            ) : (
                <div className="w-14 h-14 bg-indigo-50 dark:bg-darkInput rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl border border-indigo-100 dark:border-darkBorder">
                    {team.name.charAt(0)}
                </div>
            )}
            <div>
                <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tighter leading-none">{team.name}</h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest mt-1">Portal Público de Transparência e Desempenho</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicHeader;
