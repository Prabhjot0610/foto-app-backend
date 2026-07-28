const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'VECCHI_RICORDI';

module.exports = function (req, res, next) {
  // 1. Cerca il token nell'header Authorization oppure in x-auth-token
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    token = req.headers['x-auth-token'];
  }

  // 2. Se non c'è alcun token
  if (!token) {
    return res.status(401).json({ msg: 'Nessun token, autorizzazione negata' });
  }

  try {
    // 3. Verifica il token JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Salva il payload sia in req.utente che in req.user per massima compatibilità
    req.utente = decoded.user || decoded;
    req.user = decoded.user || decoded;

    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token non valido o scaduto' });
  }
};