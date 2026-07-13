import { createServer } from 'node:http';
import { createApp, initializeDataset } from './app.js';
import { loadConfig } from './config.js';
import { createObservationStore } from './database.js';

const config = loadConfig();
const store = createObservationStore(config.databasePath);
initializeDataset(config, store);
const server = createServer(createApp(config, store));

server.listen(config.port, () => console.log(`Pricing Intelligence Lab listening on http://localhost:${config.port}`));

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  server.close(() => {
    store.close();
    process.exitCode = 0;
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
