const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = 'chiave_segreta_super_sicura_foto_app_123!';

// 1. Registrazione Utente
router.post('/register', async (req, res) => {
  const { nome, password } = req.body;

  if (!nome || !password) {
    return res.status(400).json({ msg: 'Inserisci nome e password' });
  }

  try {
    const checkUser = await pool.query('SELECT * FROM utenti WHERE LOWER(nome) = LOWER($1)', [nome.trim()]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ msg: 'Questo nome utente è già preso' });
    }

    // Cripta la password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Assegna il ruolo admin se il nome è "admin", altrimenti "utente"
    const ruolo = nome.trim().toLowerCase() === 'admin' ? 'admin' : 'utente';

    const newUser = await pool.query(
      'INSERT INTO utenti (nome, password, ruolo) VALUES ($1, $2, $3) RETURNING id, nome, ruolo',
      [nome.trim(), hashedPassword, ruolo]
    );

    const user = newUser.rows[0];

    // Crea Token JWT
    const token = jwt.sign({ id: user.id, nome: user.nome, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '30d' });

    // Log Attività
    await pool.query(
      'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
      [user.nome, 'REGISTRAZIONE', `Nuovo utente registrato con ruolo: ${user.ruolo}`]
    );

    res.json({ token, user });
  } catch (err) {
    console.error('Errore registrazione:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

// 2. Login Utente
router.post('/login', async (req, res) => {
  const { nome, password } = req.body;

  if (!nome || !password) {
    return res.status(400).json({ msg: 'Inserisci nome e password' });
  }

  try {
    const userQuery = await pool.query('SELECT * FROM utenti WHERE LOWER(nome) = LOWER($1)', [nome.trim()]);

    if (userQuery.rows.length === 0) {
      return res.status(400).json({ msg: 'Utente non trovato' });
    }

    const user = userQuery.rows[0];

    // Se l'utente vecchio non ha una password nel DB
    if (!user.password) {
      return res.status(400).json({ msg: 'Account legacy senza password. Registra un nuovo utente.' });
    }

    // Confronta password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Password errata' });
    }

    // Genera Token JWT (valido 30 giorni)
    const token = jwt.sign({ id: user.id, nome: user.nome, ruolo: user.ruolo }, JWT_SECRET, { expiresIn: '30d' });

    await pool.query(
      'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
      [user.nome, 'LOGIN', 'Accesso effettuato con successo']
    );

    res.json({ token, user: { id: user.id, nome: user.nome, ruolo: user.ruolo } });
  } catch (err) {
    console.error('Errore login:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

// 3. Verifica del Token salvato per il Login Persistente
router.get('/me', async (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ msg: 'Nessun token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ msg: 'Token non valido' });
  }
});

module.exports = router;