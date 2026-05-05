const API = '/api';
let token = localStorage.getItem('token') || '';

function fmtMoney(n) { return new Intl.NumberFormat('vi-VN').format(n) + 'đ'; }

function authHeader() { return token ? { Authorization: `Bearer ${token}` } : {}; }

function renderAuth() {
  const authArea = document.getElementById('authArea');
  if (token) {
    authArea.innerHTML = `<button onclick="logout()">Đăng xuất</button> <button onclick="loadMyBookings()">Vé của tôi</button>`;
  } else {
    authArea.innerHTML = `
      <input id="name" placeholder="Tên" />
      <input id="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Mật khẩu" />
      <button onclick="register()">Đăng ký</button>
      <button onclick="login()">Đăng nhập</button>
    `;
  }
}

async function register() {
  const body = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
  };
  const res = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) return alert(data.message);
  token = data.token; localStorage.setItem('token', token); renderAuth();
}

async function login() {
  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
  };
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) return alert(data.message);
  token = data.token; localStorage.setItem('token', token); renderAuth();
}

function logout() { token = ''; localStorage.removeItem('token'); renderAuth(); }

async function searchTrips() {
  const q = new URLSearchParams({
    from: document.getElementById('from').value,
    to: document.getElementById('to').value,
    date: document.getElementById('date').value,
    sort: document.getElementById('sort').value,
  });
  const res = await fetch(`${API}/trips/search?${q}`);
  const trips = await res.json();
  const el = document.getElementById('tripList');
  el.innerHTML = trips.map(t => `
    <div class="trip">
      <div class="row"><strong>${t.from_city} → ${t.to_city}</strong><strong>${fmtMoney(t.price)}</strong></div>
      <div class="muted">${t.operator_name} | ${t.bus_type} | ⭐ ${t.rating}</div>
      <div class="muted">Đi: ${new Date(t.depart_time).toLocaleString('vi-VN')} - Đến: ${new Date(t.arrive_time).toLocaleString('vi-VN')}</div>
      <div class="muted">Ghế trống: ${t.available_seats}/${t.total_seats}</div>
      <div class="row">
        <input id="name-${t.id}" placeholder="Tên hành khách" />
        <input id="phone-${t.id}" placeholder="SĐT" />
        <input id="seat-${t.id}" type="number" min="1" max="${t.available_seats}" value="1" />
        <button onclick="book(${t.id})">Đặt vé</button>
      </div>
    </div>
  `).join('') || '<p>Không có chuyến phù hợp.</p>';
}

async function book(trip_id) {
  if (!token) return alert('Vui lòng đăng nhập trước khi đặt vé');
  const body = {
    trip_id,
    seat_count: Number(document.getElementById(`seat-${trip_id}`).value),
    passenger_name: document.getElementById(`name-${trip_id}`).value,
    passenger_phone: document.getElementById(`phone-${trip_id}`).value,
  };
  const res = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return alert(data.message);
  alert('Đặt vé thành công');
  searchTrips();
}

async function loadMyBookings() {
  const res = await fetch(`${API}/bookings/my`, { headers: authHeader() });
  const bookings = await res.json();
  document.getElementById('myBookingsSection').style.display = 'block';
  document.getElementById('myBookings').innerHTML = bookings.map(b => `
    <div class="trip">
      <strong>${b.from_city} → ${b.to_city}</strong>
      <div class="muted">Nhà xe: ${b.operator_name}</div>
      <div class="muted">SL ghế: ${b.seat_count} | Tổng tiền: ${fmtMoney(b.total_amount)}</div>
      <div class="muted">Trạng thái: ${b.status} | Mã vé: #${b.id}</div>
    </div>
  `).join('') || '<p>Bạn chưa có vé nào.</p>';
}

renderAuth();
searchTrips();
