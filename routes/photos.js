const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Salvataggio temporaneo in memoria per la compressione
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 1. Upload Foto con Compressione
router.post('/upload', authMiddleware, upload.single('immagine'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Nessun file selezionato' });

    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
    const uploadsDir = path.join(__dirname, '..', 'uploads');

    // Crea la cartella uploads se non esiste
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const outputPath = path.join(uploadsDir, filename);

    // Compressione dell'immagine con Sharp
    await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    const urlImmagine = `/uploads/${filename}`;
    const descrizione = req.body.descrizione || '';
    const utenteId = req.utente ? req.utente.id : req.user.id;
    const utenteNome = req.utente ? req.utente.nome : req.user.nome;

    const newPhoto = await pool.query(
      'INSERT INTO foto (url_immagine, descrizione, utente_id) VALUES ($1, $2, $3) RETURNING *',
      [urlImmagine, descrizione, utenteId]
    );

    // Log Attività in try-catch separato per evitare il blocco in caso di discrepanze DB
    try {
      await pool.query(
        'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
        [utenteNome, 'UPLOAD_FOTO', `Caricata nuova foto ID: ${newPhoto.rows[0].id}`]
      );
    } catch (logErr) {
      console.error('Errore durante la scrittura del log:', logErr.message);
    }

    res.json(newPhoto.rows[0]);
  } catch (err) {
    console.error('Errore caricamento foto:', err.message);
    res.status(500).json({ msg: 'Errore del server durante il caricamento foto', dettaglio: err.message });
  }
});

// 2. GET tutte le foto
router.get('/', authMiddleware, async (req, res) => {
  const utenteId = req.utente ? req.utente.id : req.user.id;

  try {
    const photos = await pool.query(`
      SELECT 
        f.id, 
        f.url_immagine, 
        f.descrizione, 
        f.utente_id, 
        u.nome AS autore,
        COUNT(l.id)::INT AS num_like,
        BOOL_OR(l.utente_id = $1) AS liked_by_me
      FROM foto f
      JOIN utenti u ON f.utente_id = u.id
      LEFT JOIN likes l ON f.id = l.foto_id
      GROUP BY f.id, u.nome
      ORDER BY f.id DESC
    `, [utenteId]);

    res.json(photos.rows);
  } catch (err) {
    console.error('Errore recupero foto:', err.message);
    res.status(500).json({ msg: 'Errore del server nel recupero foto', dettaglio: err.message });
  }
});

// 3. POST Like Toggle
router.post('/:id/like', authMiddleware, async (req, res) => {
  const fotoId = req.params.id;
  const utenteId = req.utente ? req.utente.id : req.user.id;
  const utenteNome = req.utente ? req.utente.nome : req.user.nome;

  try {
    const checkLike = await pool.query(
      'SELECT * FROM likes WHERE foto_id = $1 AND utente_id = $2',
      [fotoId, utenteId]
    );

    if (checkLike.rows.length > 0) {
      await pool.query(
        'DELETE FROM likes WHERE foto_id = $1 AND utente_id = $2',
        [fotoId, utenteId]
      );
      res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO likes (foto_id, utente_id) VALUES ($1, $2)',
        [fotoId, utenteId]
      );

      try {
        await pool.query(
          'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
          [utenteNome, 'LIKE_FOTO', `Ha messo Mi Piace alla foto ID: ${fotoId}`]
        );
      } catch (logErr) {
        console.error('Errore log like:', logErr.message);
      }

      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Errore gestione like:', err.message);
    res.status(500).json({ msg: 'Errore del server per i like', dettaglio: err.message });
  }
});

// 4. PUT Modifica Foto (Titolo/Descrizione)
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { descrizione } = req.body;
  const utenteId = req.utente ? req.utente.id : req.user.id;

  try {
    const result = await pool.query(
      'UPDATE foto SET descrizione = $1 WHERE id = $2 AND utente_id = $3 RETURNING *',
      [descrizione, id, utenteId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Non sei autorizzato a modificare questo post o il post non esiste.' });
    }

    res.json({ message: 'Post aggiornato con successo!', photo: result.rows[0] });
  } catch (err) {
    console.error('Errore aggiornamento foto:', err.message);
    res.status(500).json({ error: 'Errore del server durante la modifica.', dettaglio: err.message });
  }
});

// 5. DELETE Foto
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const fotoId = req.params.id;
    const utenteId = req.utente ? req.utente.id : req.user.id;
    const utenteRuolo = req.utente ? req.utente.ruolo : req.user.ruolo;
    const utenteNome = req.utente ? req.utente.nome : req.user.nome;

    const photoQuery = await pool.query('SELECT * FROM foto WHERE id = $1', [fotoId]);

    if (photoQuery.rows.length === 0) return res.status(404).json({ msg: 'Foto non trovata' });

    const foto = photoQuery.rows[0];

    if (foto.utente_id !== utenteId && utenteRuolo !== 'admin') {
      return res.status(403).json({ msg: 'Non autorizzato' });
    }

    await pool.query('DELETE FROM foto WHERE id = $1', [fotoId]);

    const filePath = path.join(__dirname, '..', foto.url_immagine);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    try {
      await pool.query(
        'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
        [utenteNome, utenteRuolo === 'admin' ? 'ELIMINAZIONE_FOTO_ADMIN' : 'ELIMINAZIONE_FOTO', `Eliminata foto ID: ${fotoId}`]
      );
    } catch (logErr) {
      console.error('Errore log elimina:', logErr.message);
    }

    res.json({ msg: 'Foto eliminata' });
  } catch (err) {
    console.error('Errore eliminazione foto:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

module.exports = router;