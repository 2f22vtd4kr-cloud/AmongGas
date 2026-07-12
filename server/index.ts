import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { AmongGasRoom } from './rooms/AmongGasRoom';

const port = Number(process.env.PORT ?? 5001);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: 'colyseus' });
});

const httpServer = createServer(app);

const gameServer = new Server({ server: httpServer });
gameServer.define('among_gas', AmongGasRoom);

gameServer.listen(port).then(() => {
  console.log(`[AmongGas] Colyseus 0.17 server running on port ${port}`);
  console.log(`[AmongGas] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
});
