const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware per abilitare i permessi del browser e leggere i JSON
app.use(cors());
app.use(express.json());

// Rende accessibile la cartella degli uploads per visualizzare le foto via browser
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import e attivazione delle rotte
app.use('/api/auth', require('./routes/auth'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/admin', require('./routes/admin'));

// Rotta di test rapido
app.get('/', (req, res) => {
  res.send('API Foto App in funzione! 🚀');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server avviato sulla porta ${PORT}`);
});