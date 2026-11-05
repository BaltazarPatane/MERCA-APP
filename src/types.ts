export type Movimiento = {
  id: string;
  tipo: "gasto" | "ingreso" | "transferencia" | "inversion";
  monto: number | string;
  moneda: string;
  fecha: string;
  hora: string | null;
  descripcion: string | null;
  destinatario: string | null;
  estado: "pendiente_revision" | "confirmado" | "descartado";
  categoria_id: string | null;
  cuenta_origen_id?: string | null;
  cuenta_destino_id?: string | null;
};

export type Cuenta = {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  activa: boolean;
  // PostgreSQL numeric(15,2) se devuelve como string en algunas consultas.
  saldo_inicial: number | string;
};

export type Categoria = {
  id: string;
  nombre: string;
  tipo: "gasto" | "ingreso" | "inversion";
  activa: boolean;
  color: string | null;
};

// Convierte valores en formato argentino sin usar punto flotante para enviarlos
// a la columna PostgreSQL numeric(15,2).
export function montoParaBD(valor: string): string | null {
  const v = valor.trim().replace(/\s/g, "");
  let partes: string[] | null = null;

  if (/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(v)) {
    partes = v.replace(/\./g, "").split(",");
  } else if (/^\d+(?:\.\d{1,2})?$/.test(v)) {
    partes = v.split(".");
  }

  if (!partes) return null;
  const entero = partes[0].replace(/^0+(?=\d)/, "");
  const decimal = (partes[1] ?? "").padEnd(2, "0");
  if (entero.length > 13 || !/[1-9]/.test(entero + decimal)) return null;
  return entero + "." + decimal;
}
