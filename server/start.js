import 'dotenv/config';
import app, { connectDatabase } from './index.js';

const port = Number(process.env.PORT) || 4000;

try {
  const connected = await connectDatabase();
  console.log(connected ? 'MongoDB conectado.' : 'MONGODB_URI no configurada; se inicia en modo de prueba.');
} catch {
  console.error('No se pudo conectar con MongoDB; se inicia en modo de prueba.');
}

app.listen(port, () => console.log(`Los Osman disponible en http://localhost:${port}`));
