import { loadConfig } from './config.ts';
import { createServer } from './server.ts';

const config = loadConfig();
createServer(config).listen(config.port, () => {
  console.log(
    JSON.stringify({ level: 'info', msg: 'graphql-bff listening', port: config.port, catalogUrl: config.catalogUrl }),
  );
});
