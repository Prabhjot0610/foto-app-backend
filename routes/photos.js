const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp'); // ⚡ Importato Sharp
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Salvataggio temporaneo in memoria per la compressione
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload Foto con Compressione Automaticamente
router.post('/upload', authMiddleware, upload.single('immagine'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Nessun file selezionato' });

    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
    const outputPath = path.join(__dirname, '..', 'uploads', filename);

    // ⚡ Compressione dell'immagine con Sharp (ridimensionamento max 1200px, qualità 80%)
    await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    const urlImmagine = `/uploads/${filename}`;
    const descrizione = req.body.descrizione || '';

    const newPhoto = await pool.query(
      'INSERT INTO foto (url_immagine, descrizione, utente_id) VALUES ($1, $2, $3) RETURNING *',
      [urlImmagine, descrizione, req.utente.id]
    );

    await pool.query(
      'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
      [req.utente.nome, 'UPLOAD_FOTO', `Caricata nuova foto ID: ${newPhoto.rows[0].id}`]
    );

    res.json(newPhoto.rows[0]);
  } catch (err) {
    console.error('Errore caricamento foto:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

// GET foto con Like
router.get('/', authMiddleware, async (req, res) => {
  try {
    const photos = await pool.query(`
      SELECT 
        f.id, 
        f.url_immagine, 
        f.descrizione, 
        f.data_caricamento, 
        f.utente_id, 
        u.nome AS autore,
        COUNT(l.id)::INT AS num_like,
        BOOL_OR(l.utente_id = $1) AS liked_by_me
      FROM foto f
      JOIN utenti u ON f.utente_id = u.id
      LEFT JOIN like_foto l ON f.id = l.foto_id
      GROUP BY f.id, u.nome
      ORDER BY f.data_caricamento DESC
    `, [req.utente.id]);

    res.json(photos.rows);
  } catch (err) {
    console.error('Errore recupero foto:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

// POST Like Toggle
router.post('/:id/like', authMiddleware, async (req, res) => {
  const fotoId = req.params.id;
  const utenteId = req.utente.id;

  try {
    const checkLike = await pool.query(
      'SELECT * FROM like_foto WHERE foto_id = $1 AND utente_id = $2',
      [fotoId, utenteId]
    );

    if (checkLike.rows.length > 0) {
      await pool.query(
        'DELETE FROM like_foto WHERE foto_id = $1 AND utente_id = $2',
        [fotoId, utenteId]
      );
      res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO like_foto (foto_id, utente_id) VALUES ($1, $2)',
        [fotoId, utenteId]
      );

      await pool.query(
        'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
        [req.utente.nome, 'LIKE_FOTO', `Ha messo Mi Piace alla foto ID: ${fotoId}`]
      );

      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Errore gestione like:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});

// DELETE Foto
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const fotoId = req.params.id;
    const photoQuery = await pool.query('SELECT * FROM foto WHERE id = $1', [fotoId]);

    if (photoQuery.rows.length === 0) return res.status(404).json({ msg: 'Foto non trovata' });

    const foto = photoQuery.rows[0];

    if (foto.utente_id !== req.utente.id && req.utente.ruolo !== 'admin') {
      return res.status(403).json({ msg: 'Non autorizzato' });
    }

    await pool.query('DELETE FROM foto WHERE id = $1', [fotoId]);

    const filePath = path.join(__dirname, '..', foto.url_immagine);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query(
      'INSERT INTO registro_attivita (utente_nome, azione, dettagli) VALUES ($1, $2, $3)',
      [req.utente.nome, req.utente.ruolo === 'admin' ? 'ELIMINAZIONE_FOTO_ADMIN' : 'ELIMINAZIONE_FOTO', `Eliminata foto ID: ${fotoId}`]
    );

    res.json({ msg: 'Foto eliminata' });
  } catch (err) {
    console.error('Errore eliminazione foto:', err.message);
    res.status(500).json({ msg: 'Errore del server' });
  }
});
// Rotta per modificare titolo e descrizione di una foto
router.put('/:id', autenticaToken, async (req, res) => {
  const { id } = req.params;
  const { titolo, descrizione } = req.body;

  try {
    // Aggiorna solo se la foto appartiene all'utente loggato
    const result = await pool.query(
      'UPDATE photos SET titolo = $1, descrizione = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [titolo, descrizione, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Non sei autorizzato a modificare questo post o il post non esiste.' });
    }

    res.json({ message: 'Post aggiornato con successo!', photo: result.rows[0] });
  } catch (err) {
    console.error('Errore aggiornamento foto:', err);
    res.status(500).json({ error: 'Errore del server durante la modifica.' });
  }
});

module.exports = router;