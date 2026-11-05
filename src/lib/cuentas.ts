import type { Cuenta, Movimiento } from "../types";

/** Saldo por billetera y remanente sin asignar. Solo incluye movimientos confirmados.
 * El saldo inicial es un ajuste de apertura que no altera gastos ni ingresos.
 * Una transferencia entre billeteras suma y resta el mismo importe.
 */
export function resumenPorCuentas(cuentas: readonly Cuenta[], movimientos: readonly Movimiento[]) {
  // Se calculan centavos enteros para evitar errores por redondeo binario.
  const centavos = (valor: number | string) => Math.round(Number(valor) * 100);
  const saldos = new Map(cuentas.map(c => [c.id, Number.isFinite(Number(c.saldo_inicial)) ? centavos(c.saldo_inicial) : 0]));
  let sinAsignar = 0;
  let movimientosSinAsignar = 0;

  function aplicar(cuentaId: string | null | undefined, importe: number) {
    if (cuentaId && saldos.has(cuentaId)) {
      saldos.set(cuentaId, (saldos.get(cuentaId) || 0) + importe);
      return false;
    }
    sinAsignar += importe;
    return true;
  }

  for (const m of movimientos) {
    if (m.estado !== "confirmado") continue;
    const importe = centavos(m.monto);
    if (!Number.isSafeInteger(importe) || importe <= 0) continue;
    if (m.tipo === "ingreso") {
      if (aplicar(m.cuenta_destino_id, importe)) movimientosSinAsignar++;
    } else if (m.tipo === "gasto" || m.tipo === "inversion") {
      if (aplicar(m.cuenta_origen_id, -importe)) movimientosSinAsignar++;
    } else if (m.tipo === "transferencia") {
      const sinOrigen = aplicar(m.cuenta_origen_id, -importe);
      const sinDestino = aplicar(m.cuenta_destino_id, importe);
      if (sinOrigen || sinDestino) movimientosSinAsignar++;
    }
  }

  const detalle = cuentas.map(c => ({ ...c, saldo: (saldos.get(c.id) || 0) / 100 }));
  const saldoSinAsignar = sinAsignar / 100;
  const saldoTotal = (sinAsignar + [...saldos.values()].reduce((acc, n) => acc + n, 0)) / 100;
  return { detalle, saldoSinAsignar, saldoTotal, movimientosSinAsignar };
}

/** Acepta saldo base cero o positivo, separado de los montos de movimientos (>0). */
export function saldoInicialParaBD(valor: string): string | null {
  const texto = valor.trim().replace(/\s/g, "");
  if (!texto) return "0.00";
  const formatoArgentino = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;
  const formatoDecimalPunto = /^\d+(?:\.\d{1,2})?$/;
  let partes: string[];
  if (formatoArgentino.test(texto)) {
    partes = texto.replace(/\./g, "").split(",");
  } else if (formatoDecimalPunto.test(texto)) {
    partes = texto.split(".");
  } else return null;
  const entero = partes[0].replace(/^0+(?=\d)/, "");
  if (entero.length > 13) return null;
  return entero + "." + (partes[1] ?? "").padEnd(2, "0");
}
