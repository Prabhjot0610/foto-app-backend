const jwt = require('jsonwebtoken');
const JWT_SECRET = 'VECCHI_RICORDI';

module.exports = function (req, res, next) {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return res.status(401).json({ msg: 'Nessun token, autorizzazione negata' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.utente = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token non valido o scaduto' });
  }
};