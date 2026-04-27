const nodemailer = require('nodemailer');

// Configure transporter based on email provider
function createTransporter() {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  if (provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App password
      },
    });
  }

  if (provider === 'office365') {
    return nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { ciphers: 'SSLv3' },
    });
  }

  // Generic SMTP (servidor propio)
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const transporter = createTransporter();

const FROM = `"RoomDesk 🏢" <${process.env.EMAIL_USER}>`;
const LOGO = '🏢';

// ── Email templates ────────────────────────────────────────────

function baseTemplate(title, content) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
    <div style="background: #0f1117; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
      <h1 style="color: #4f8ef7; margin: 0; font-size: 20px;">${LOGO} RoomDesk</h1>
      <p style="color: #8892a4; margin: 4px 0 0; font-size: 12px; letter-spacing: 1px;">SISTEMA DE RESERVA DE SALAS</p>
    </div>
    <div style="background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #e0e0e0;">
      <h2 style="color: #1a1a2e; margin-top: 0; font-size: 18px;">${title}</h2>
      ${content}
    </div>
    <p style="text-align: center; color: #aaa; font-size: 11px; margin-top: 16px;">
      Este correo fue enviado automáticamente por RoomDesk. Por favor no respondas a este mensaje.
    </p>
  </div>`;
}

function reservationCard(rv) {
  const statusColors = { Pendiente: '#fbbf24', Aprobado: '#34d399', Rechazado: '#f87171' };
  const color = statusColors[rv.status] || '#888';
  return `
  <table style="width:100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
    <tr><td style="padding: 8px; color: #666; width: 130px;">Código</td><td style="padding: 8px; font-weight: bold; font-family: monospace;">${rv.code}</td></tr>
    <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">Sala</td><td style="padding: 8px; font-weight: bold;">${rv.sala}</td></tr>
    <tr><td style="padding: 8px; color: #666;">Fecha</td><td style="padding: 8px;">${rv.fecha}</td></tr>
    <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">Horario</td><td style="padding: 8px;">${rv.hora_inicio} – ${rv.hora_fin}</td></tr>
    <tr><td style="padding: 8px; color: #666;">Participantes</td><td style="padding: 8px;">${rv.participantes} personas</td></tr>
    <tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">Motivo</td><td style="padding: 8px;">${rv.motivo}</td></tr>
    <tr><td style="padding: 8px; color: #666;">Estado</td><td style="padding: 8px;"><span style="background:${color}22; color:${color}; padding: 3px 10px; border-radius: 20px; font-weight: bold; font-size: 12px;">${rv.status}</span></td></tr>
    ${rv.admin_note ? `<tr style="background:#f9f9f9"><td style="padding: 8px; color: #666;">Nota</td><td style="padding: 8px; color: #555; font-style: italic;">${rv.admin_note}</td></tr>` : ''}
  </table>`;
}

// ── Send functions ─────────────────────────────────────────────

async function sendWelcome(user) {
  await transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: '✅ Bienvenido a RoomDesk — Cuenta creada',
    html: baseTemplate('¡Bienvenido a RoomDesk!', `
      <p style="color:#444;">Hola <strong>${user.name}</strong>,</p>
      <p style="color:#444;">Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión y solicitar reservas de salas de reunión.</p>
      <div style="background:#f0f7ff; border-left: 4px solid #4f8ef7; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
        <p style="margin:0; color:#1a3a6e; font-size: 13px;"><strong>Tu correo registrado:</strong> ${user.email}</p>
      </div>
      <p style="color:#444;">Si tienes alguna duda, contacta al administrador del sistema.</p>
    `),
  });
}

async function sendNewReservationToAdmin(adminEmail, adminName, reservation, requesterName) {
  await transporter.sendMail({
    from: FROM,
    to: adminEmail,
    subject: `🔔 Nueva solicitud de sala — ${reservation.sala} | ${reservation.code}`,
    html: baseTemplate('Nueva solicitud de reserva pendiente', `
      <p style="color:#444;">Hola <strong>${adminName}</strong>,</p>
      <p style="color:#444;"><strong>${requesterName}</strong> ha solicitado una reserva que requiere tu aprobación:</p>
      ${reservationCard(reservation)}
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.APP_URL || 'http://localhost:3000'}" 
           style="background:#4f8ef7; color:white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
          Revisar en RoomDesk →
        </a>
      </div>
    `),
  });
}

async function sendStatusUpdate(userEmail, userName, reservation) {
  const isApproved = reservation.status === 'Aprobado';
  const icon = isApproved ? '✅' : '❌';
  const title = isApproved ? 'Tu reserva fue aprobada' : 'Tu reserva fue rechazada';
  const color = isApproved ? '#34d399' : '#f87171';

  await transporter.sendMail({
    from: FROM,
    to: userEmail,
    subject: `${icon} Reserva ${reservation.status} — ${reservation.sala} | ${reservation.code}`,
    html: baseTemplate(title, `
      <p style="color:#444;">Hola <strong>${userName}</strong>,</p>
      <p style="color:#444;">El administrador ha ${isApproved ? 'aprobado' : 'rechazado'} tu solicitud de reserva:</p>
      ${reservationCard(reservation)}
      ${isApproved ? `
        <div style="background:#f0fff8; border-left: 4px solid #34d399; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin:0; color:#065f46; font-size: 13px;">✅ La sala queda reservada para ti en el horario indicado.</p>
        </div>` : `
        <div style="background:#fff5f5; border-left: 4px solid #f87171; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin:0; color:#991b1b; font-size: 13px;">❌ Puedes enviar una nueva solicitud con diferente horario o sala.</p>
        </div>`}
    `),
  });
}

async function sendPasswordReset(email, token) {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '🔐 Restablecer contraseña — RoomDesk',
    html: baseTemplate('Restablece tu contraseña', `
      <p style="color:#444;">Recibimos una solicitud para restablecer tu contraseña.</p>
      <p style="color:#444;">Haz clic en el botón para crear una nueva. El enlace expira en <strong>1 hora</strong>.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" style="background:#4f8ef7; color:white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Restablecer contraseña
        </a>
      </div>
      <p style="color:#999; font-size: 12px;">Si no solicitaste esto, ignora este correo.</p>
    `),
  });
}

async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('✅ Email service ready');
    return true;
  } catch (err) {
    console.warn('⚠️  Email service not configured:', err.message);
    return false;
  }
}

module.exports = {
  sendWelcome,
  sendNewReservationToAdmin,
  sendStatusUpdate,
  sendPasswordReset,
  verifyConnection,
};
