import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { getUsers, saveUser } from '../services/storageService';
import { v4 as uuidv4 } from 'uuid';
import { Eye, EyeOff, Trophy, UserPlus, LogIn, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        if (isRegistering) {
            if (!name || !email || !password) {
              setError('Preencha todos os campos.');
              setLoading(false);
              return;
            }

            const newUser: User = {
              id: uuidv4(),
              name,
              email,
              password,
              role: UserRole.MASTER,
              avatarUrl: ''
            };
            await saveUser(newUser);
            onLogin(newUser);
        } else {
            const users = await getUsers();
            const found = users.find(u => u.email === email && u.password === password);
            if (found) {
              onLogin(found);
            } else {
              setError('Credenciais inválidas.');
            }
        }
    } catch (err) {
        setError('Erro de conexão com servidor.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e3a8a] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header Section */}
        <div className="bg-white p-8 pb-0 flex flex-col items-center">
           <Trophy className="text-[#4ade80] w-16 h-16 mb-4" />
           <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-wider">PERFORMAXX</h1>
           <p className="text-gray-500 mt-2 text-sm text-center">Gestão de Alta Performance</p>
        </div>

        <div className="p-8">
          <h2 className="text-center font-bold text-gray-800 mb-6 text-xl">
             {isRegistering ? 'Cadastro Conta Master' : 'Acesso ao Sistema'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#EEEDEC] border border-gray-300 rounded-lg p-3 text-gray-800 focus:outline-none focus:border-blue-500"
                  required={isRegistering}
                  placeholder="Seu nome"
                />
              </div>
            )}

            <div>
               <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
               <input 
                 type="email" 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full bg-[#EEEDEC] border border-gray-300 rounded-lg p-3 text-gray-800 focus:outline-none focus:border-blue-500"
                 required
                 placeholder="seu@email.com"
               />
            </div>

            <div className="relative">
               <label className="block text-sm font-bold text-gray-700 mb-1">Senha</label>
               <input 
                 type={showPassword ? "text" : "password"} 
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full bg-[#EEEDEC] border border-gray-300 rounded-lg p-3 text-gray-800 focus:outline-none focus:border-blue-500 pr-10"
                 required
                 placeholder="Sua senha"
               />
               <button 
                 type="button"
                 onClick={() => setShowPassword(!showPassword)}
                 className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                 tabIndex={-1}
               >
                 {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
               </button>
            </div>

            {error && <div className="text-red-500 text-sm font-medium text-center bg-red-50 p-2 rounded">{error}</div>}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#4ade80] hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (isRegistering ? <UserPlus size={20} /> : <LogIn size={20} />)}
              {loading ? 'Aguarde...' : (isRegistering ? 'CRIAR CONTA MASTER' : 'ENTRAR')}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-gray-100 pt-4">
             <button 
               type="button"
               onClick={() => {
                 setIsRegistering(!isRegistering);
                 setError('');
                 setName('');
                 setEmail('');
                 setPassword('');
               }} 
               className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center justify-center gap-2 mx-auto"
             >
                {isRegistering ? 'Voltar para Login' : 'Novo cadastro de conta Master'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;