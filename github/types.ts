
export interface RutaRecord {
  id: string;
  origen: string;
  destino: string;
  distancia: string;
  fecha: string;
  dia: string;
  weekId: string;
  incidencia?: string;
}

export type TabType = 'calc' | 'historial';

export const DIAS_LABORABLES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const STORAGE_KEY = 'vlc_routelog_v20_stable';
