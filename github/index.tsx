import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';

interface RutaRecord {
  id: string;
  origen: string;
  destino: string;
  distancia: string;
  fecha: string;
  dia: string;
  weekId: string;
}

const DIAS_LABORABLES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const STORAGE_KEY = 'vlc_routelog_v20_stable';

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

const formatDateKey = (d: Date) => d.toISOString().split('T')[0];

const getWeekRangeLabel = (mondayStr: string) => {
  const monday = new Date(mondayStr);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return `${monday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - ${saturday.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;
};

const App = () => {
  const [pestaña, setPestaña] = useState<'calc' | 'historial'>('calc');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [distancia, setDistancia] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [historial, setHistorial] = useState<RutaRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const currentMondayStr = useMemo(() => formatDateKey(getMonday(new Date())), []);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState(currentMondayStr);

  const listaSemanas = useMemo(() => {
    const semanas = [];
    for (let i = 0; i < 8; i++) {
      const d = getMonday(new Date());
      d.setDate(d.getDate() - (i * 7));
      semanas.push(formatDateKey(d));
    }
    return semanas;
  }, [currentMondayStr]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setHistorial(JSON.parse(saved)); } catch (e) { console.error("Error al cargar historial"); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historial));
  }, [historial]);

  const calcularKmReal = async () => {
    const orig = origen.trim();
    const dest = destino.trim();

    if (!orig || !dest) {
      setError("Introduce origen y destino.");
      return;
    }

    setCargando(true);
    setError(null);
    setDistancia(null);

    const cache = historial.find(r => 
      r.origen.toLowerCase() === orig.toLowerCase() && 
      r.destino.toLowerCase() === dest.toLowerCase()
    );

    if (cache) {
      const hoy = new Date();
      const diaNum = hoy.getDay();
      const nuevo: RutaRecord = {
        ...cache,
        id: crypto.randomUUID(),
        fecha: hoy.toLocaleDateString('es-ES'),
        dia: DIAS_LABORABLES[diaNum === 0 ? 5 : diaNum - 1] || 'Sábado',
        weekId: currentMondayStr
      };
      setDistancia(cache.distancia);
      setHistorial(prev => [nuevo, ...prev]);
      setOrigen(''); setDestino('');
      setCargando(false);
      return;
    }

    try {
      // Usamos process.env.API_KEY que Vite inyectará durante el build
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("No se detectó la clave de API en el entorno.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Actúa como un GPS preciso en Valencia, España. Calcula la distancia de conducción más rápida entre "${orig}, Valencia" y "${dest}, Valencia". Responde SOLAMENTE con el número seguido de "km" (ejemplo: 5.4 km).`,
      });

      const text = response.text || "";
      const match = text.match(/(\d+[.,]?\d*)\s*km/i) || text.match(/(\d+[.,]?\d*)/);
      
      if (match) {
        const num = match[1].replace(',', '.');
        const kmVal = `${num} km`;
        setDistancia(kmVal);

        const hoy = new Date();
        const diaNum = hoy.getDay();
        const nuevo: RutaRecord = {
          id: crypto.randomUUID(),
          origen: orig,
          destino: dest,
          distancia: kmVal,
          fecha: hoy.toLocaleDateString('es-ES'),
          dia: DIAS_LABORABLES[diaNum === 0 ? 5 : diaNum - 1] || 'Sábado',
          weekId: currentMondayStr
        };

        setHistorial(prev => [nuevo, ...prev]);
        setOrigen(''); setDestino('');
      } else {
        throw new Error("Respuesta de IA no válida.");
      }
    } catch (err: any) {
      console.error("Error API:", err);
      setError("Error: No se pudo calcular. Revisa la API_KEY en los ajustes de Cloudflare.");
    } finally {
      setCargando(false);
    }
  };

  const borrarItem = (id: string) => setHistorial(prev => prev.filter(r => r.id !== id));

  const descargarExcel = () => {
    const data = historial.filter(r => r.weekId === semanaSeleccionada);
    if (!data.length) return alert("No hay datos en esta semana.");

    const rows: any[] = [];
    DIAS_LABORABLES.forEach(dia => {
      const filtrados = data.filter(r => r.dia === dia);
      rows.push({ DÍA: `--- ${dia.toUpperCase()} ---`, ORIGEN: '', DESTINO: '', KM: '' });
      if (!filtrados.length) {
        rows.push({ DÍA: '(Sin rutas)', ORIGEN: '-', DESTINO: '-', KM: '-' });
      } else {
        filtrados.forEach(f => rows.push({ DÍA: f.fecha, ORIGEN: f.origen, DESTINO: f.destino, KM: f.distancia }));
      }
      rows.push({});
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Log_Rutas");
    XLSX.writeFile(wb, `VLC_RouteLog_${semanaSeleccionada}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <div className="max-w-xl mx-auto px-4 pt-10">
        
        <header className="text-center mb-8 animate-fade-in">
          <div className="bg-indigo-600 w-16 h-16 rounded-[2rem] shadow-xl flex items-center justify-center mx-auto mb-4 transform rotate-2">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tighter">VLC Route<span className="text-indigo-600">Log</span></h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Gestión de Kilometraje • Valencia</p>
        </header>

        <nav className="flex bg-white p-1 rounded-[2rem] mb-8 shadow-sm border border-slate-100">
          <button 
            onClick={() => setPestaña('calc')} 
            className={`flex-1 py-4 rounded-[1.8rem] font-black text-xs transition-all ${pestaña === 'calc' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            NUEVA RUTA
          </button>
          <button 
            onClick={() => setPestaña('historial')} 
            className={`flex-1 py-4 rounded-[1.8rem] font-black text-xs transition-all ${pestaña === 'historial' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            HISTORIAL
          </button>
        </nav>

        <main className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[500px]">
          {pestaña === 'calc' ? (
            <div className="p-8 space-y-6 animate-fade-in">
              <div className="space-y-4">
                <div className="group">
                  <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-4 mb-2 block group-focus-within:text-indigo-400 transition-colors">Origen</label>
                  <input 
                    type="text" 
                    value={origen} 
                    onChange={e => setOrigen(e.target.value)} 
                    placeholder="Calle, Número o Lugar" 
                    className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 outline-none font-bold text-slate-700 focus:border-indigo-400 focus:bg-white transition-all shadow-inner" 
                  />
                </div>
                <div className="group">
                  <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-4 mb-2 block group-focus-within:text-indigo-400 transition-colors">Destino</label>
                  <input 
                    type="text" 
                    value={destino} 
                    onChange={e => setDestino(e.target.value)} 
                    placeholder="Calle, Número o Lugar" 
                    className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 outline-none font-bold text-slate-700 focus:border-indigo-400 focus:bg-white transition-all shadow-inner" 
                  />
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-[10px] font-black text-center border border-rose-100">
                  {error}
                </div>
              )}

              <button 
                onClick={calcularKmReal} 
                disabled={cargando} 
                className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white font-black py-5 rounded-[1.8rem] text-lg shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                {cargando ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : null}
                {cargando ? 'PROCESANDO...' : 'REGISTRAR RUTA'}
              </button>

              {distancia && (
                <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-center shadow-2xl shadow-indigo-100 animate-fade-in">
                  <span className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Recorrido Estimado</span>
                  <div className="text-7xl font-black text-white my-3 tracking-tighter">{distancia}</div>
                  <div className="text-[10px] font-bold text-indigo-100 opacity-60">Ruta añadida al historial automáticamente</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full animate-fade-in">
              <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <select 
                  value={semanaSeleccionada} 
                  onChange={e => setSemanaSeleccionada(e.target.value)} 
                  className="w-full sm:w-auto bg-white border-2 border-slate-200 rounded-xl px-4 py-2 font-black text-slate-700 text-[10px] outline-none shadow-sm cursor-pointer"
                >
                  {listaSemanas.map(w => (
                    <option key={w} value={w}>{w === currentMondayStr ? 'SEMANA ACTUAL' : getWeekRangeLabel(w)}</option>
                  ))}
                </select>
                <button 
                  onClick={descargarExcel} 
                  className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] hover:bg-indigo-700 shadow-md uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Exportar XLSX
                </button>
              </div>
              
              <div className="overflow-y-auto p-6 space-y-8 custom-scrollbar max-h-[600px]">
                {DIAS_LABORABLES.map(dia => {
                  const items = historial.filter(r => r.weekId === semanaSeleccionada && r.dia === dia);
                  return (
                    <div key={dia} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-6 w-6 rounded-lg flex items-center justify-center font-black text-[9px] ${items.length ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                          {dia[0]}
                        </div>
                        <h3 className={`text-[10px] font-black uppercase tracking-widest ${items.length ? 'text-slate-800' : 'text-slate-200'}`}>
                          {dia}
                        </h3>
                        <div className="h-px bg-slate-50 flex-1"></div>
                      </div>
                      
                      <div className="grid gap-2 pl-9">
                        {items.length === 0 ? (
                          <div className="text-[9px] font-bold text-slate-200 uppercase italic py-2">Sin actividad registrada</div>
                        ) : (
                          items.map(r => (
                            <div key={r.id} className="bg-white border-2 border-slate-50 rounded-2xl p-4 flex items-center justify-between group hover:border-indigo-100 transition-all shadow-sm hover:shadow-md">
                              <div className="min-w-0 pr-4">
                                <div className="text-[12px] font-black text-slate-800 truncate">{r.origen}</div>
                                <div className="text-[9px] font-bold text-slate-400 truncate mt-0.5 flex items-center gap-1">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  {r.destino}
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-4">
                                <div className="text-xl font-black text-slate-900 tracking-tighter">{r.distancia}</div>
                                <button 
                                  onClick={() => borrarItem(r.id)} 
                                  className="text-slate-200 hover:text-rose-500 transition-colors p-1"
                                  title="Eliminar ruta"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        <footer className="mt-8 text-center">
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">© 2025 VLC Logistic Solutions</p>
        </footer>

      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);