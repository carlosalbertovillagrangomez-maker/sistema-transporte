import React, { useState } from 'react';
import { User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. LLAVE MAESTRA (Para que el dueño siempre pueda entrar)
      if (email.trim().toLowerCase() === 'admin@triplogix.com' && password === 'admin123') {
        onLogin({ id: 'superadmin', name: 'Administrador Principal', role: 'SuperAdmin', email: 'admin@triplogix.com' });
        return;
      }

      // 2. VALIDACIÓN REAL CONTRA FIREBASE (Colección: administradores)
      const q = query(collection(db, "administradores"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        throw new Error('Usuario no encontrado en el sistema.');
      }

      const userData = { id: snap.docs[0].id, ...snap.docs[0].data() };

      if (userData.password !== password) {
        throw new Error('Contraseña incorrecta.');
      }

      if (userData.status === 'Inactivo') {
        throw new Error('Tu cuenta ha sido suspendida.');
      }

      // Éxito: Pasamos el usuario completo a la App
      onLogin(userData);

    } catch (err) {
      setError(err.message || 'Error al iniciar sesión.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-slate-900 font-sans">
      
      {/* IMAGEN DE FONDO LOGÍSTICA */}
      <div className="absolute inset-0 overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80" 
          alt="Logistics Background" 
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/90 to-slate-900/60"></div>
      </div>

      {/* TARJETA DE LOGIN */}
      <div className="relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl animate-[fadeIn_0.5s_ease-out]">
        
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/logo.png" 
            alt="TripLogix Logo" 
            className="w-28 h-28 object-contain drop-shadow-xl mb-4"
          />
          <h1 className="text-3xl font-black text-white tracking-widest uppercase">
            Trip<span className="text-orange-500">Logix</span>
          </h1>
          <p className="text-slate-400 font-bold tracking-widest text-[10px] uppercase mt-2">
            Portal de Despacho Corporativo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase ml-1">Correo Corporativo</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-500" />
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-900/60 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition placeholder-slate-600 font-medium"
                placeholder="admin@triplogix.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase ml-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500" />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-900/60 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition placeholder-slate-600 font-medium"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center font-bold animate-pulse">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Verificando...
              </>
            ) : (
              <>
                Iniciar Sesión <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                ¿Problemas de acceso? <a href="#" className="text-orange-400 hover:text-orange-300 transition ml-1">Contactar Soporte IT</a>
            </p>
        </div>

      </div>
      
      <div className="absolute bottom-6 text-slate-600 font-bold tracking-widest uppercase text-[9px]">
         © 2026 TripLogix • v3.0 Security Layer
      </div>

    </div>
  );
}