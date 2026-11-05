import test from "node:test";
import assert from "node:assert/strict";
import { resumenFinanciero } from "../src/lib/finanzas.ts";
import { resumenPorCuentas, saldoInicialParaBD } from "../src/lib/cuentas.ts";

const cuenta = (id, saldo_inicial = "0.00", activa = true) => ({ id, nombre: id, tipo: "billetera", moneda: "ARS", activa, saldo_inicial });
const mov = (tipo, monto, origen = null, destino = null, estado = "confirmado") => ({
  tipo, monto, cuenta_origen_id: origen, cuenta_destino_id: destino, estado,
});

test("los saldos de billeteras concilian con el balance histórico cuando no hay apertura", () => {
  const cuentas = [cuenta("mp"), cuenta("efectivo", 0, false)];
  const movimientos = [
    mov("ingreso", "100.00", null, "mp"),
    mov("gasto", "20.00", "mp"),
    mov("inversion", "10.00", "efectivo"),
    mov("transferencia", "40.00", "mp", "efectivo"),
  ];
  const r = resumenPorCuentas(cuentas, movimientos);
  assert.deepEqual(r.detalle.map(x => x.saldo), [40, 30]);
  assert.equal(r.saldoSinAsignar, 0);
  assert.equal(r.saldoTotal, resumenFinanciero(movimientos).balanceDisponible);
});

test("sin asignar mantiene el historial existente sin modificarlo", () => {
  const movimientos = [
    mov("ingreso", "120000.50"),
    mov("gasto", "1500.25"),
    mov("inversion", 3000),
    mov("transferencia", 500),
  ];
  const r = resumenPorCuentas([], movimientos);
  assert.equal(r.saldoTotal, 115500.25);
  assert.equal(r.saldoSinAsignar, 115500.25);
  assert.equal(r.movimientosSinAsignar, 4);
});

test("transferencias propias no cambian el total, incluso con una cuenta sin asignar", () => {
  const movimientos = [mov("ingreso", 500, null, "a"), mov("transferencia", 100, "a", null)];
  const r = resumenPorCuentas([cuenta("a"), cuenta("b")], movimientos);
  assert.equal(r.detalle[0].saldo, 400);
  assert.equal(r.saldoSinAsignar, 100);
  assert.equal(r.saldoTotal, 500);
});

test("pendientes, descartados e importes no válidos no afectan billeteras", () => {
  const movimientos = [
    mov("ingreso", 100, null, "a", "pendiente_revision"),
    mov("gasto", 80, "a", null, "descartado"),
    mov("ingreso", "no-numero", null, "a"),
    mov("ingreso", 10, null, "a"),
  ];
  const r = resumenPorCuentas([cuenta("a", "150.25")], movimientos);
  assert.equal(r.saldoTotal, 160.25);
});

test("los saldos de apertura se contabilizan una sola vez, sin crear ingresos", () => {
  const movimientos = [mov("gasto", "0.10", "a")];
  const r = resumenPorCuentas([cuenta("a", "150.30"), cuenta("b", 20)], movimientos);
  assert.deepEqual(r.detalle.map(x => x.saldo), [150.2, 20]);
  assert.equal(r.saldoTotal, 170.2);
  assert.equal(resumenFinanciero(movimientos).ingresos, 0);
});

test("saldo inicial acepta formato ARS y rechaza importes ambiguos", () => {
  assert.equal(saldoInicialParaBD("1.500,25"), "1500.25");
  assert.equal(saldoInicialParaBD("1.000"), "1000.00");
  assert.equal(saldoInicialParaBD("12.345"), "12345.00");
  assert.equal(saldoInicialParaBD("1500.25"), "1500.25");
  assert.equal(saldoInicialParaBD(""), "0.00");
  assert.equal(saldoInicialParaBD("-10"), null);
  assert.equal(saldoInicialParaBD("1,123"), null);
});
