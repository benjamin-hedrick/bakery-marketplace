import { chaosFromEnv } from '@bakery/chaos';
import { BffChaos } from './chaos.ts';
import { loadConfig } from './config.ts';
import { createServer } from './server.ts';

const config = loadConfig();
// Chaos scenarios (ADR-0024): nothing happens unless CHAOS_ENABLED is set, and then only locally or in the dev deployment (the process stops otherwise).
const runtime = chaosFromEnv(process.env, {
  log: (entry) => console.warn(JSON.stringify({ level: 'warn', ...entry })),
});
if (runtime) {
  console.warn(
    JSON.stringify({
      level: 'warn',
      msg: `CHAOS SCENARIO '${runtime.scenario.name}' IS ON (seed ${runtime.scenario.seed}, layers ${Object.keys(runtime.scenario.layers).join(', ')}). Faults are injected on purpose; responses carry X-Chaos-Scenario.`,
    }),
  );
}
createServer(config, runtime ? { chaos: new BffChaos(runtime) } : {}).listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'graphql-bff listening',
      port: config.port,
      catalogUrl: config.catalogUrl,
      orderingUrl: config.orderingUrl,
    }),
  );
});
