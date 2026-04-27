const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { signToken, authMiddleware } = require('../middleware/auth');

const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || 'group-ng.com,lecotec.gt,loqui.com.gt,uenergy.com').split(',').map(d => d.trim());
const MAX_ADMINS = 3;

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Nombre requerido'),
  body('email').isEmail().withMessage('Correo inválido'),
  body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { name, email, password } = req.body;
  const emailLower = email.toLowerCase().trim();
  const domain = emailLower.split('@')[1];

  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ error: `Dominio no permitido. Usa: ${ALLOWED_DOMAINS.map(d => '@'+d).join(', ')}` });
  }

  try {
    const exists = await query('SELECT id FROM users WHERE email = $1', [emailLower]);
    if (exists.rows.length) return res.status(409).json({ error: 'Este correo ya está registrado' });

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, emailLower, hash, 'user']
    );
    const user = result.rows[0];
    const token = signToken({ id: user.id });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
  try {
    const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = signToken({ id: user.id });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

// PUT /api/auth/password  (change own password)
router.put('/password', authMiddleware, async (req, res) => {
  const { current, newPassword } = req.body;
  if (!current || !newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

module.exports = router;
