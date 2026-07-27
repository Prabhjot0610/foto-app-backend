const { Pool } = require('pg');

// Se la variabile DATABASE_URL è definita (cioè su Render/Cloud), 
// usa quella con connessione SSL. Altrimenti usa la connessione locale.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false, // Importante per la connessione sicura con Neon
        },
      }
    : {
        user: 'postgres',         // Il tuo utente locale di PostgreSQL
        host: 'localhost',
        database: 'foto_app',   // Il nome del tuo database locale
        password: 'lewis', // La tua password locale
        port: 5433,
      }
);

module.exports = pool;