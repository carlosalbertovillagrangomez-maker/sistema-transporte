import React, { useState } from 'react';
import { Truck, User, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulamos una verificación de red de 1.5 segundos
    setTimeout(() => {
      // Validación simple (Puedes cambiar la contraseña aquí)
      if (email === 'admin@logistica.com' && password === 'admin123') {
        onLogin(); // ¡Éxito!
      } else {
        setError('Credenciales incorrectas. Intenta: admin@logistica.com / admin123');
        setIsLoading(false);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-slate-900">
      
      {/* IMAGEN DE FONDO */}
      <div className="absolute inset-0 overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80" 
          alt="Logistics Background" 
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40"></div>
      </div>

      {/* TARJETA DE LOGIN */}
      <div className="relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out]">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4 rotate-3 hover:rotate-6 transition">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bienvenido</h1>
          <p className="text-slate-400 text-sm mt-2">Sistema de Control Logístico</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase ml-1">Correo Corporativo</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-400" />
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-600 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-slate-500"
                placeholder="admin@logistica.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase ml-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-600 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition placeholder-slate-500"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-xs text-center font-medium animate-pulse">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
            <p className="text-xs text-slate-500">
                ¿Olvidaste tu contraseña? <a href="#" className="text-blue-400 hover:text-blue-300 transition">Contactar Soporte</a>
            </p>
        </div>

      </div>
      
      <div className="absolute bottom-6 text-slate-500 text-xs">
         © 2026 Logistics Pro System • v2.1 Security Layer
      </div>

    </div>
  );
}