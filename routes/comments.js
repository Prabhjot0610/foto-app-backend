const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

// @route   POST /api/comments
// @desc    Aggiungi un commento a una foto
router.post('/', authMiddleware, async (req, res) => {
  const { testo, foto_id } = req.body;

  if (!testo || !testo.trim() || !foto_id) {
    return res.status(400).json({ msg: 'Testo del commento e foto_id sono obbligatori' });
  }

  // Supporto per sia req.utente che req.user
  const utenteObj = req.utente || req.user || {};
  const utenteId = utenteObj.id;
  const utenteNome = utenteObj.nome || utenteObj.username || 'Utente Sconosciuto';

  if (!utenteId) {
    return res.status(401).json({ msg: 'Utente non autenticato' });
  }

  try {
    const newComment = await pool.query(
      `INSERT INTO commenti (testo, foto_id, utente_id) 
       VALUES ($1, $2, $3) 
       RETURNING id, testo, foto_id, utente_id`,
      [testo.trim(), foto_id, utenteId]
    );

    const commentWithUser = {
      ...newComment.rows[0],
      autore: utenteNome
    };

    // Log Attività in try-catch isolato
    try {
      await pool.query(
        'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
        [utenteNome, 'NUOVO_COMMENTO', `Ha commentato la foto ID: ${foto_id}`]
      );
    } catch (logErr) {
      console.error('⚠️ Log commento fallito (ignorato):', logErr.message);
    }

    res.json(commentWithUser);
  } catch (err) {
    console.error('Errore inserimento commento:', err.message);
    res.status(500).json({ msg: 'Errore del server durante l\'inserimento del commento', errore: err.message });
  }
});

// @route   GET /api/comments/:foto_id
// @desc    Recupera tutti i commenti di una foto
router.get('/:foto_id', authMiddleware, async (req, res) => {
  try {
    const comments = await pool.query(
      `SELECT commenti.id, commenti.testo, commenti.utente_id, utenti.nome AS autore
       FROM commenti
       JOIN utenti ON commenti.utente_id = utenti.id
       WHERE commenti.foto_id = $1
       ORDER BY commenti.id ASC`,
      [req.params.foto_id]
    );

    res.json(comments.rows);
  } catch (err) {
    console.error('Errore recupero commenti:', err.message);
    res.status(500).json({ msg: 'Errore del server durante il recupero dei commenti', errore: err.message });
  }
});

// @route   DELETE /api/comments/:id
// @desc    Elimina un commento (Autore o Admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const commentId = req.params.id;
    const utenteObj = req.utente || req.user || {};
    const utenteId = utenteObj.id;
    const utenteRuolo = utenteObj.ruolo;
    const utenteNome = utenteObj.nome || 'Utente';

    const commentQuery = await pool.query('SELECT * FROM commenti WHERE id = $1', [commentId]);

    if (commentQuery.rows.length === 0) {
      return res.status(404).json({ msg: 'Commento non trovato' });
    }

    const commento = commentQuery.rows[0];

    // Verifica permessi
    if (commento.utente_id !== utenteId && utenteRuolo !== 'admin') {
      return res.status(403).json({ msg: 'Non autorizzato' });
    }

    await pool.query('DELETE FROM commenti WHERE id = $1', [commentId]);

    // Log Attività
    try {
      await pool.query(
        'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
        [utenteNome, utenteRuolo === 'admin' ? 'ELIMINAZIONE_COMMENTO_ADMIN' : 'ELIMINAZIONE_COMMENTO', `Eliminato commento ID: ${commentId}`]
      );
    } catch (logErr) {
      console.error('⚠️ Log elimina commento fallito (ignorato):', logErr.message);
    }

    res.json({ msg: 'Commento eliminato' });
  } catch (err) {
    console.error('Errore eliminazione commento:', err.message);
    res.status(500).json({ msg: 'Errore del server durante l\'eliminazione del commento', errore: err.message });
  }
});

module.exports = router;