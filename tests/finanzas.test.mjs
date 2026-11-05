import test from "node:test";
import assert from "node:assert/strict";
import { resumenFinanciero } from "../src/lib/finanzas.ts";

const movimiento=(tipo,monto,estado="confirmado")=>({tipo,monto,estado});

test("inversiones disminuyen disponible, no gastos de consumo",()=>{
  assert.deepEqual(resumenFinanciero([
    movimiento("ingreso",200000),
    movimiento("gasto",45000),
    movimiento("inversion",75000),
  ]),{ingresos:200000,gastos:45000,inversiones:75000,balanceDisponible:80000});
});
test("pendientes y descartados no alteran el balance",()=>{
  assert.deepEqual(resumenFinanciero([
    movimiento("ingreso",100000),
    movimiento("inversion",90000,"pendiente_revision"),
    movimiento("gasto",30000,"descartado"),
  ]),{ingresos:100000,gastos:0,inversiones:0,balanceDisponible:100000});
});
test("transferencias propias no se cuentan como entradas ni salidas globales",()=>{
  assert.equal(resumenFinanciero([movimiento("transferencia",45000)]).balanceDisponible,0);
});
test("importes numeric de PostgreSQL admiten representación string",()=>{
  assert.deepEqual(resumenFinanciero([movimiento("inversion","42500.50")]).inversiones,42500.5);
});
test("ningún movimiento devuelve cuatro cifras cero",()=>{
  assert.deepEqual(resumenFinanciero([]),{ingresos:0,gastos:0,inversiones:0,balanceDisponible:0});
});
test("no suma importes negativos, NaN, o cero por error",()=>{
  assert.equal(resumenFinanciero([movimiento("inversion",-5),movimiento("gasto","no-numero"),movimiento("ingreso",0)]).balanceDisponible,0);
});

test("saldo histórico no depende del período elegido para las estadísticas",()=>{
  const historial = [
    {...movimiento("ingreso",200000),fecha:"2026-10-15"},
    {...movimiento("inversion",20000),fecha:"2026-10-20"},
    {...movimiento("gasto",45000),fecha:"2026-11-02"},
    {...movimiento("ingreso",10000),fecha:"2026-11-03"},
    {...movimiento("gasto",8000,"pendiente_revision"),fecha:"2026-11-04"},
  ];
  const noviembre = historial.filter(m=>m.fecha.startsWith("2026-11"));
  assert.equal(resumenFinanciero(historial).balanceDisponible,145000);
  assert.equal(resumenFinanciero(noviembre).balanceDisponible,-35000);
});
