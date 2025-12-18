
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { getUsers, saveUser } from '../services/storageService';
import { v4 as uuidv4 } from 'uuid';
import { Eye, EyeOff, UserPlus, LogIn, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const GLOBAL_EMAIL = 'robson.jsiqueira@gmail.com';

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
              role: email === GLOBAL_EMAIL ? UserRole.GLOBAL : UserRole.MASTER, 
              avatarUrl: '',
              teamIds: [] 
            };
            
            const response = await saveUser(newUser);
            
            if (response.error) {
                console.error("Erro detalhado Supabase:", response.error);
                if (response.error.code === '23505') { 
                    setError('Este email já está cadastrado.');
                } else if (response.error.message.includes('row-level security')) {
                    setError('Erro de permissão no banco. Verifique as políticas SQL.');
                } else {
                    setError(`Erro ao criar conta: ${response.error.message}`);
                }
            } else {
                onLogin(newUser);
            }
        } else {
            const users = await getUsers();
            const found = users.find(u => u.email === email && u.password === password);
            if (found) {
              // Safety check for hardcoded global access
              if (found.email === GLOBAL_EMAIL && found.role !== UserRole.GLOBAL) {
                  found.role = UserRole.GLOBAL;
                  await saveUser(found); 
              }
              onLogin(found);
            } else {
              setError('Credenciais inválidas.');
            }
        }
    } catch (err: any) {
        console.error("Erro de conexão:", err);
        setError(`Erro de conexão: ${err.message || 'Servidor offline'}`);
    } finally {
        setLoading(false);
    }
  };

  const togglePassword = (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent form submission
      e.stopPropagation();
      setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e3a8a] dark:bg-darkBase p-4 transition-colors">
      <div className="bg-white dark:bg-darkCard rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-transparent dark:border-darkBorder">
        
        {/* Header Section */}
        <div className="bg-white dark:bg-darkCard p-8 pb-0 flex flex-col items-center">
           <img 
             src="https://raw.githubusercontent.com/robsonsiqueira83/PERFORMAXX/main/PERFORMAXX_LOGO.png" 
             alt="PERFORMAXX" 
             className="w-64 max-w-full object-contain mb-2"
           />
           <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm text-center">Gestão de Alta Performance</p>
        </div>

        <div className="p-8">
          <h2 className="text-center font-bold text-gray-800 dark:text-gray-100 mb-6 text-xl uppercase tracking-widest">
             {isRegistering ? 'Cadastro Conta Master' : 'Acesso ao Sistema'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegistering && (
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-400 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#EEEDEC] dark:bg-darkInput border border-gray-300 dark:border-darkBorder rounded-lg p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-500"
                  required={isRegistering}
                  placeholder="Seu nome"
                />
              </div>
            )}

            <div>
               <label className="block text-sm font-bold text-gray-700 dark:text-gray-400 mb-1">Email</label>
               <input 
                 type="email" 
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full bg-[#EEEDEC] dark:bg-darkInput border border-gray-300 dark:border-darkBorder rounded-lg p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-500"
                 required
                 placeholder="seu@email.com"
               />
            </div>

            <div>
               <label className="block text-sm font-bold text-gray-700 dark:text-gray-400 mb-1">Senha</label>
               <div className="relative">
                   <input 
                     type={showPassword ? 'text' : 'password'}
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     className="w-full bg-[#EEEDEC] dark:bg-darkInput border border-gray-300 dark:border-darkBorder rounded-lg p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-blue-500 pr-10"
                     required
                     placeholder="Sua senha"
                   />
                   <button 
                     type="button" 
                     onClick={togglePassword}
                     className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 z-10 p-1 cursor-pointer focus:outline-none"
                     tabIndex={-1}
                   >
                     {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                   </button>
               </div>
            </div>

            {error && <div className="text-red-500 text-sm font-medium text-center bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/30">{error}</div>}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#4ade80] hover:bg-green-500 text-white font-black py-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest text-xs"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (isRegistering ? <UserPlus size={20} /> : <LogIn size={20} />)}
              {loading ? 'Aguarde...' : (isRegistering ? 'CRIAR CONTA MASTER' : 'ENTRAR')}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-gray-100 dark:border-darkBorder pt-4">
             <button 
               type="button"
               onClick={() => {
                 setIsRegistering(!isRegistering);
                 setError('');
                 setName('');
                 setEmail('');
                 setPassword('');
               }} 
               className="text-xs font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors flex items-center justify-center gap-2 mx-auto uppercase tracking-widest"
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
