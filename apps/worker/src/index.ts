import { parseServerConfig } from '@portfolio-pilot/config/server';

parseServerConfig(process.env);
const roles = ['ingestion', 'outbox', 'agent'] as const;
const role = process.env.WORKER_ROLE || 'ingestion';
if (!roles.includes(role as typeof roles[number])) throw new Error(`Invalid WORKER_ROLE: ${role}`);
console.log(`PortfolioPilot worker role: ${role}`);
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`PortfolioPilot worker stopping (${signal})`);
  process.exitCode = 0;
  clearInterval(keepAlive);
  if (process.connected) process.disconnect();
}
const keepAlive = setInterval(() => {}, 60_000);
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', (message: unknown) => { if (message === 'shutdown') shutdown('IPC'); });
