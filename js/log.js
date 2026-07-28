/**
 * Log só no console (painel de debug removido).
 */
export function log(event, data) {
  if (data !== undefined) {
    console.log(`[mmd] ${event}`, data);
  } else {
    console.log(`[mmd] ${event}`);
  }
}
