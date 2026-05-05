const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('database.db');

db.prepare('DELETE FROM bookings').run();
db.prepare('DELETE FROM trips').run();
db.prepare('DELETE FROM routes').run();
db.prepare('DELETE FROM users').run();

const routes = [
  ['TP.HCM', 'Đà Lạt', 320],
  ['TP.HCM', 'Nha Trang', 430],
  ['Hà Nội', 'Sapa', 315],
  ['Đà Nẵng', 'Huế', 95]
];

const insertRoute = db.prepare('INSERT INTO routes(from_city, to_city, distance_km) VALUES (?, ?, ?)');
for (const r of routes) insertRoute.run(...r);

const trips = [
  [1, 'Anh Khôi Limousine', 'Limousine 34 phòng', '2026-05-08T22:00:00', '2026-05-09T05:30:00', 380000, 34, 34, 4.8, JSON.stringify(['Wifi', 'Nước suối', 'Chăn'])],
  [2, 'Luxury Express', 'Giường nằm 40 chỗ', '2026-05-08T21:00:00', '2026-05-09T06:00:00', 320000, 40, 40, 4.4, JSON.stringify(['Wifi', 'Sạc USB'])],
  [3, 'Sapa VIP', 'Cabin đôi', '2026-05-10T23:00:00', '2026-05-11T05:00:00', 450000, 22, 22, 4.9, JSON.stringify(['WC', 'Màn hình riêng'])],
  [4, 'Miền Trung Bus', 'Ghế ngồi 29 chỗ', '2026-05-09T09:00:00', '2026-05-09T11:30:00', 150000, 29, 29, 4.2, JSON.stringify(['Máy lạnh'])]
];

const insertTrip = db.prepare(`
  INSERT INTO trips(route_id, operator_name, bus_type, depart_time, arrive_time, price, total_seats, available_seats, rating, amenities)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const t of trips) insertTrip.run(...t);

const hash = bcrypt.hashSync('admin123', 10);
db.prepare('INSERT INTO users(name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin@ankhoi.vn', hash, 'admin');

console.log('Seed data created. Admin: admin@ankhoi.vn / admin123');
