-- =============================================================================
-- 0004 — La deuda de cada persona = la suma de sus creditos
--
-- La app ya no lee `clientes.saldo_actual` para mostrar ni para validar cupo:
-- la deuda de una persona se calcula sumando TODOS sus creditos vivos
-- (estado PENDIENTE / PARCIAL / VENCIDO con saldo > 0). `saldo_actual` queda
-- como espejo desnormalizado, util solo para detectar descuadres.
--
-- Esta migracion pone el espejo al dia una vez: si por un GREATEST(0, ...) o por
-- una anulacion vieja quedo corto, el cliente aparecia debiendo de menos —o
-- desaparecia de la cartera con facturas todavia sin cobrar—.
--
-- No toca creditos ni abonos: no cambia ninguna deuda real, solo el acumulado.
-- Idempotente: correrla dos veces no hace nada la segunda vez.
-- =============================================================================

UPDATE clientes c
   SET saldo_actual = COALESCE((SELECT SUM(cr.saldo_usd) FROM creditos cr
                                 WHERE cr.cliente_id = c.id
                                   AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO')
                                   AND cr.saldo_usd > 0), 0)
 WHERE c.eliminado_en IS NULL
   AND c.saldo_actual <> COALESCE((SELECT SUM(cr.saldo_usd) FROM creditos cr
                                    WHERE cr.cliente_id = c.id
                                      AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO')
                                      AND cr.saldo_usd > 0), 0);

-- La cartera, el buscador de clientes y el chequeo de cupo en el POS suman los
-- creditos vivos de cada persona. El indice parcial cubre exactamente ese filtro
-- —sin recorrer los ya pagados— y lleva saldo_usd dentro, asi que la suma sale
-- del indice sin tocar la tabla.
CREATE INDEX IF NOT EXISTS ix_creditos_deuda_cliente
  ON creditos (cliente_id, saldo_usd)
  WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO') AND saldo_usd > 0;
