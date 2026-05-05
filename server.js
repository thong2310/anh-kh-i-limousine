const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const db = new Database('database.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  distance_km INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  operator_name TEXT NOT NULL,
  bus_type TEXT NOT NULL,
  depart_time TEXT NOT NULL,
  arrive_time TEXT NOT NULL,
  price INTEGER NOT NULL,
  total_seats INTEGER NOT NULL,
  available_seats INTEGER NOT NULL,
  rating REAL NOT NULL DEFAULT 4.5,
  amenities TEXT NOT NULL,
  FOREIGN KEY(route_id) REFERENCES routes(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trip_id INTEGER NOT NULL,
  seat_count INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  passenger_name TEXT NOT NULL,
  passenger_phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(trip_id) REFERENCES trips(id)
);
`);

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

const signToken = (user) => jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Thiếu token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

const admin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Không có quyền' });
  next();
};

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Thiếu thông tin' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ message: 'Email đã tồn tại' });

  const password_hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users(name, email, password_hash) VALUES (?, ?, ?)').run(name, email, password_hash);
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Sai email hoặc mật khẩu' });
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/routes', (req, res) => {
  res.json(db.prepare('SELECT * FROM routes').all());
});

app.get('/api/trips/search', (req, res) => {
  const { from, to, date, sort = 'price_asc' } = req.query;
  let orderBy = 't.price ASC';
  if (sort === 'price_desc') orderBy = 't.price DESC';
  if (sort === 'rating_desc') orderBy = 't.rating DESC';
  if (sort === 'depart_asc') orderBy = 't.depart_time ASC';

  const rows = db.prepare(`
    SELECT t.*, r.from_city, r.to_city
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    WHERE (? IS NULL OR r.from_city = ?)
      AND (? IS NULL OR r.to_city = ?)
      AND (? IS NULL OR substr(t.depart_time, 1, 10) = ?)
    ORDER BY ${orderBy}
  `).all(from || null, from || null, to || null, to || null, date || null, date || null);

  res.json(rows);
});

app.post('/api/bookings', auth, (req, res) => {
  const { trip_id, seat_count, passenger_name, passenger_phone } = req.body;
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip_id);
  if (!trip) return res.status(404).json({ message: 'Không tìm thấy chuyến xe' });
  if (trip.available_seats < seat_count) return res.status(400).json({ message: 'Không đủ ghế' });

  const total_amount = trip.price * seat_count;
  const tx = db.transaction(() => {
    db.prepare('UPDATE trips SET available_seats = available_seats - ? WHERE id = ?').run(seat_count, trip_id);
    return db.prepare(`
      INSERT INTO bookings(user_id, trip_id, seat_count, total_amount, status, passenger_name, passenger_phone)
      VALUES (?, ?, ?, ?, 'confirmed', ?, ?)
    `).run(req.user.id, trip_id, seat_count, total_amount, passenger_name, passenger_phone);
  });

  const result = tx();
  res.status(201).json({ id: result.lastInsertRowid, message: 'Đặt vé thành công' });
});

app.get('/api/bookings/my', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, t.operator_name, t.depart_time, t.arrive_time, r.from_city, r.to_city
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN routes r ON r.id = t.route_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/admin/trips', auth, admin, (req, res) => {
  const { route_id, operator_name, bus_type, depart_time, arrive_time, price, total_seats, amenities } = req.body;
  const info = db.prepare(`
    INSERT INTO trips(route_id, operator_name, bus_type, depart_time, arrive_time, price, total_seats, available_seats, amenities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(route_id, operator_name, bus_type, depart_time, arrive_time, price, total_seats, total_seats, JSON.stringify(amenities || []));
  res.status(201).json({ id: info.lastInsertRowid });
});

app.get('/api/admin/bookings', auth, admin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.name as user_name, u.email, t.operator_name
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN trips t ON t.id = b.trip_id
    ORDER BY b.created_at DESC
  `).all();
  res.json(rows);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
