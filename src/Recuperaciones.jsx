import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Phone, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const formatRequestedAt = (value) => {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
};

const getTargetCollection = (request) => (
    request?.accountCollection ||
    (request?.accountType === 'Conductor' ? 'conductores' : 'clientes')
);

const generateTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const random = new Uint32Array(12);
    crypto.getRandomValues(random);
    return Array.from(random, number => alphabet[number % alphabet.length]).join('');
};

export default function Recuperaciones({ currentUser }) {
    const [requests, setRequests] = useState([]);
    const [loadingId, setLoadingId] = useState('');
    const [lastTemporaryPassword, setLastTemporaryPassword] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'recuperacionesCuenta'), orderBy('requestedAt', 'desc'));
        return onSnapshot(
            q,
            snapshot => {
                setRequests(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
            },
            error => console.error('No se pudieron cargar recuperaciones:', error)
        );
    }, []);

    const pending = useMemo(
        () => requests.filter(item => item?.status === 'Pendiente'),
        [requests]
    );

    const resolveRequest = async (request) => {
        if (!request?.accountId || !request?.id) return;

        const confirmed = window.confirm(
            'Antes de continuar valida la identidad del usuario por el canal operativo registrado.\n\n¿Deseas emitir una contraseña temporal?'
        );
        if (!confirmed) return;

        const temporaryPassword = generateTemporaryPassword();
        const now = new Date().toISOString();
        setLoadingId(request.id);

        try {
            await updateDoc(
                doc(db, getTargetCollection(request), request.accountId),
                {
                    password: temporaryPassword,
                    passwordResetRequired: true,
                    passwordResetIssuedAt: now
                }
            );

            await updateDoc(doc(db, 'recuperacionesCuenta', request.id), {
                status: 'Resuelta',
                resolvedAt: now,
                resolvedBy: currentUser?.name || currentUser?.email || 'Despachador'
            });

            setLastTemporaryPassword({
                name: request.displayName || request.accountType || 'Usuario',
                phone: request.phone || '',
                password: temporaryPassword
            });
        } catch (error) {
            console.error('No fue posible restablecer la cuenta:', error);
            alert('No fue posible completar el restablecimiento. Revisa la conexión e inténtalo otra vez.');
        } finally {
            setLoadingId('');
        }
    };

    return (
        <div className="h-full overflow-y-auto p-4 md:p-6 bg-slate-50">
            <div className="max-w-5xl mx-auto space-y-5">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-800">Recuperación administrada de cuentas</h2>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                Esta opción mantiene la autenticación actual por teléfono + contraseña sin agregar costo de SMS. Verifica la identidad antes de emitir una contraseña temporal. Al iniciar sesión, Cliente o Conductor deberá crear una nueva contraseña.
                            </p>
                        </div>
                    </div>
                </div>

                {lastTemporaryPassword && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                        <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Contraseña temporal emitida</p>
                        <p className="text-sm font-bold text-slate-800 mt-2">{lastTemporaryPassword.name} · {lastTemporaryPassword.phone || 'sin teléfono'}</p>
                        <div className="mt-3 bg-white border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                            <code className="text-lg font-black tracking-widest text-slate-900">{lastTemporaryPassword.password}</code>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(lastTemporaryPassword.password)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider"
                            >
                                Copiar
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">Comunícala únicamente al usuario cuya identidad acabas de validar. Por seguridad, no se conserva en esta pantalla al recargar.</p>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Solicitudes pendientes</p>
                        <p className="text-2xl font-black text-slate-800">{pending.length}</p>
                    </div>
                    <RefreshCw className="w-5 h-5 text-slate-300" />
                </div>

                {pending.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400">
                        <KeyRound className="w-9 h-9 mx-auto mb-3" />
                        <p className="font-black">No hay recuperaciones pendientes</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {pending.map(request => (
                            <div key={request.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                    <UserRound className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-black text-slate-800 truncate">{request.displayName || 'Usuario'}</p>
                                        <span className="px-2 py-1 rounded-full bg-orange-50 text-orange-600 text-[9px] font-black uppercase tracking-wider">{request.accountType || 'Cuenta'}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" /> {request.phone || 'Sin teléfono'}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">{formatRequestedAt(request.requestedAt)}</p>
                                </div>
                                <button
                                    type="button"
                                    disabled={loadingId === request.id}
                                    onClick={() => resolveRequest(request)}
                                    className="px-4 py-3 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {loadingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                    Restablecer
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
