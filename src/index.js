require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { initDB } = require('./db/schema');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/reservations',  require('./routes/reservations'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`✅ RoomDesk API on port ${PORT}`);
    console.log(`   Domains: ${process.env.ALLOWED_DOMAINS}`);
  });
}
start().catch(err => { console.error(err); process.exit(1); });
