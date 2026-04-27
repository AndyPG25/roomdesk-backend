const router = require('express').Router();
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const MAX_ADMINS = 3;
router.use(authMiddleware, adminOnly);

// GET all users
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY role DESC, name ASC'
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Error al obtener usuarios' }); }
});

// DELETE user
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  try {
    const u = await query('SELECT role FROM users WHERE id=$1', [id]);
    if (!u.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (u.rows[0].role === 'admin') return res.status(400).json({ error: 'No puedes eliminar a otro administrador' });
    await query('DELETE FROM notifications WHERE user_id=$1', [id]);
    await query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar usuario' }); }
});

// PATCH role
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['admin','user'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (parseInt(id) === req.user.id && role === 'user')
    return res.status(400).json({ error: 'No puedes quitarte el rol de administrador' });
  try {
    if (role === 'admin') {
      const count = await query("SELECT COUNT(*) FROM users WHERE role='admin'");
      if (parseInt(count.rows[0].count) >= MAX_ADMINS)
        return res.status(400).json({ error: `Máximo ${MAX_ADMINS} administradores permitidos` });
    }
    const result = await query(
      'UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING id,name,email,role,is_active',
      [role, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar rol' }); }
});

// PATCH active status
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
  try {
    const result = await query(
      'UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id,name,email,is_active,role',
      [is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar estado' }); }
});

module.exports = router;
