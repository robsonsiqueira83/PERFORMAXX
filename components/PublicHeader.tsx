import React from 'react';
import { Trophy } from 'lucide-react';
import { Team } from '../types';

interface PublicHeaderProps {
  team?: Team | null;
}

const PublicHeader: React.FC<PublicHeaderProps> = ({ team }) => {
  return (
    <div className="bg-white shadow-sm">
      {/* Main App Bar */}
      <div className="bg-[#1e3a8a] text-white py-4 px-6 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-center md:justify-start gap-3">
          <Trophy className="text-[#4ade80] w-8 h-8" />
          <h1 className="text-2xl font-extrabold tracking-wider">PERFORMAXX</h1>
        </div>
      </div>
      
      {/* Team Context Bar */}
      {team && (
        <div className="bg-white border-b border-gray-200 py-6 px-6">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="w-16 h-16 object-contain" />
            ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold text-xl border-2 border-gray-200">
                    {team.name.charAt(0)}
                </div>
            )}
            <div>
                <h2 className="text-3xl font-bold text-gray-900">{team.name}</h2>
                <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">Área Pública de Desempenho</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicHeader;