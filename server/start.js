import 'dotenv/config';
import app, { connectDatabase } from './index.js';

const preferredPort = Number(process.env.PORT) || 4000;

try {
  const connected = await connectDatabase();
  console.log(connected ? 'MongoDB conectado.' : 'MONGODB_URI no configurada; se inicia en modo de prueba.');
} catch {
  console.error('No se pudo conectar con MongoDB; se inicia en modo de prueba.');
}

const startServer = (port) => new Promise((resolve, reject) => {
  const server = app.listen(port, () => {
    console.log(`Los Osman disponible en http://localhost:${port}`);
    resolve(server);
  });

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      reject(Object.assign(new Error(`Puerto ${port} ocupado.`), { code: 'EADDRINUSE', port }));
      return;
    }
    reject(error);
  });
});

const listenWithFallback = async () => {
  let port = preferredPort;
  while (true) {
    try {
      await startServer(port);
      return;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
      const nextPort = port + 1;
      console.warn(`Puerto ${port} ocupado; intentando ${nextPort}...`);
      port = nextPort;
    }
  }
};

try {
  await listenWithFallback();
} catch (error) {
  console.error(`No se pudo iniciar el servidor en el puerto ${preferredPort}: ${error.message}`);
  process.exitCode = 1;
}
