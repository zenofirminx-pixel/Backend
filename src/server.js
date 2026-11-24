import app from './app.js';
import { env } from './config/env.js';
app.listen(env.port, () => console.log(`Pal API écoute sur http://localhost:${env.port}`));
