const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Middleware per verificare se l'utente è davvero un Admin
const adminOnly = (req, res, next) => {
  if (req.utente.ruolo !== 'admin') {
    return res.status(403).json({ msg: 'Accesso negato: Riservato agli Amministratori' });
  }
  next();
};

// @route   GET /api/admin/logs
// @desc    Ottieni il registro di tutte le attività (Solo Admin)
router.get('/logs', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await pool.query(
      'SELECT * FROM registro_attivita ORDER BY data_ora DESC LIMIT 100'
    );
    res.json(logs.rows);
  } catch (err) {
    console.error('Errore recupero log:', err.message);
    res.status(500).send('Errore del server');
  }
});

// @route   DELETE /api/admin/photo/:id
// @desc    Elimina qualsiasi foto (Solo Admin)
router.delete('/photo/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const fotoId = req.params.id;
    await pool.query('DELETE FROM foto WHERE id = $1', [fotoId]);

    // Registra l'azione nel Log
    await pool.query(
      'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
      [req.utente.nome, 'ELIMINAZIONE_FOTO_ADMIN', `Foto ID ${fotoId} eliminata dall'Admin`]
    );

    res.json({ msg: 'Foto eliminata con successo dall\'Admin' });
  } catch (err) {
    console.error('Errore eliminazione foto:', err.message);
    res.status(500).send('Errore del server');
  }
});

module.exports = router;