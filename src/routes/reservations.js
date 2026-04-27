const router = require('express').Router();
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const ROOMS = {
  '301A': { capacity: 3 }, '302A': { capacity: 3 },
  '201':  { capacity: 8 }, '202':  { capacity: 8 },
};

router.use(authMiddleware);

// GET /api/reservations
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const params = isAdmin ? [] : [req.user.id];
    const where  = isAdmin ? '' : 'WHERE r.user_id = $1';
    const result = await query(`
      SELECT r.*, u.name AS user_name, u.email AS user_email,
             a.name AS admin_name
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN users a ON r.approved_by = a.id
      ${where} ORDER BY r.created_at DESC`, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al obtener reservas' }); }
});

// POST /api/reservations
router.post('/', async (req, res) => {
  const { sala, motivo, fecha, participantes, priority } = req.body;
  // Accept both camelCase (from frontend) and snake_case
  const hora_inicio = req.body.hora_inicio || req.body.horaInicio;
  const hora_fin    = req.body.hora_fin    || req.body.horaFin;

  if (!ROOMS[sala])          return res.status(400).json({ error: 'Sala inválida' });
  if (!hora_inicio)          return res.status(400).json({ error: 'Hora de inicio requerida' });
  if (!hora_fin)             return res.status(400).json({ error: 'Hora de fin requerida' });
  if (!fecha)                return res.status(400).json({ error: 'Fecha requerida' });
  if (participantes > ROOMS[sala].capacity)
    return res.status(400).json({ error: `Capacidad máxima de la sala ${sala}: ${ROOMS[sala].capacity} personas` });
  if (hora_inicio >= hora_fin)
    return res.status(400).json({ error: 'Hora fin debe ser mayor a hora inicio' });

  const conflict = await query(`
    SELECT id FROM reservations
    WHERE sala=$1 AND fecha=$2 AND status='Aprobado'
      AND NOT (hora_fin<=$3 OR hora_inicio>=$4)`, [sala, fecha, hora_inicio, hora_fin]);
  if (conflict.rows.length)
    return res.status(409).json({ error: 'La sala ya tiene una reserva aprobada en ese horario' });

  try {
    const seq = await query("SELECT nextval('reservation_seq') AS n");
    const code = `RV-${String(seq.rows[0].n).padStart(3, '0')}`;
    const result = await query(`
      INSERT INTO reservations (code,sala,motivo,user_id,fecha,hora_inicio,hora_fin,participantes,priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [code, sala, motivo, req.user.id, fecha, hora_inicio, hora_fin, participantes, priority || 'Media']);
    const rv = { ...result.rows[0], user_name: req.user.name, user_email: req.user.email };

    // Notify all admins in-app
    const admins = await query("SELECT id FROM users WHERE role='admin' AND is_active=true");
    for (const adm of admins.rows) {
      await query("INSERT INTO notifications (user_id,icon,message,rv_code) VALUES ($1,$2,$3,$4)",
        [adm.id, '🏢', `<b>${req.user.name}</b> solicitó la Sala <b>${sala}</b> para el ${fecha}`, code]);
    }
    res.status(201).json(rv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al crear reserva' }); }
});

// PATCH /api/reservations/:id/status
router.patch('/:id/status', adminOnly, async (req, res) => {
  const { status, admin_note } = req.body;
  if (!['Aprobado','Rechazado'].includes(status))
    return res.status(400).json({ error: 'Estado inválido' });
  try {
    const result = await query(`
      UPDATE reservations SET status=$1, admin_note=$2, approved_by=$3, updated_at=NOW()
      WHERE id=$4 RETURNING *`, [status, admin_note || null, req.user.id, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    const rv = result.rows[0];
    const icon = status === 'Aprobado' ? '✅' : '❌';
    await query("INSERT INTO notifications (user_id,icon,message,rv_code) VALUES ($1,$2,$3,$4)",
      [rv.user_id, icon,
       `Tu reserva <b>${rv.code}</b> fue <b>${status.toLowerCase()}</b> por ${req.user.name}`,
       rv.code]);
    const u = await query('SELECT name,email FROM users WHERE id=$1', [rv.user_id]);
    res.json({ ...rv, user_name: u.rows[0]?.name, user_email: u.rows[0]?.email });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al actualizar reserva' }); }
});

module.exports = router;