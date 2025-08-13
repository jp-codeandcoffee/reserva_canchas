const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

const db = new sqlite3.Database('./database.db');

// Crear tablas si no existen
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    location TEXT,
    price_per_hour REAL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    field_id INTEGER,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    status TEXT DEFAULT 'Pendiente',
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(field_id) REFERENCES fields(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  message TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

  // Insertar canchas de ejemplo
  db.get("SELECT COUNT(*) as count FROM fields", (err, row) => {
    if (row.count === 0) {
      db.run("INSERT INTO fields (name, location, price_per_hour) VALUES ('Cancha 1', 'Parque Norte', 45000)");
      db.run("INSERT INTO fields (name, location, price_per_hour) VALUES ('Cancha 2', 'Parque Sur', 50000)");
    }
  });
});

// Registro
app.post('/api/register', async (req, res) => {
  const { full_name, email, phone, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  db.run(
    "INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)",
    [full_name, email, phone, hash],
    function (err) {
      if (err) return res.status(400).json({ error: 'Email ya registrado' });
      res.json({ id: this.lastID });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    res.json({ id: user.id, full_name: user.full_name });
  });
});

// Obtener canchas
app.get('/api/fields', (req, res) => {
  db.all("SELECT * FROM fields", (err, rows) => res.json(rows));
});

// Obtener disponibilidad
app.get('/api/availability', (req, res) => {
  const { field_id, date } = req.query;
  db.all(
    `SELECT start_time, end_time FROM reservations WHERE field_id = ? AND date = ? AND status != 'Cancelada'`,
    [field_id, date],
    (err, rows) => res.json(rows)
  );
});

app.post('/api/reservations', (req, res) => {
  const { user_id, field_id, date, start_time, end_time } = req.body;

  // Verificar si ya existe una reserva activa en ese horario
  db.get(
    `SELECT id FROM reservations
     WHERE field_id = ? AND date = ? AND start_time = ? AND status != 'Cancelada'`,
    [field_id, date, start_time],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error al verificar disponibilidad' });
      if (row) return res.status(409).json({ error: 'Horario ya reservado. Elige otro.' });

      // Insertar reserva
      db.run(
        "INSERT INTO reservations (user_id, field_id, date, start_time, end_time) VALUES (?, ?, ?, ?, ?)",
        [user_id, field_id, date, start_time, end_time],
        function (err) {
          if (err) return res.status(500).json({ error: 'Error al reservar' });
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

// Mis reservas
app.get('/api/reservations/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  db.all(
    `SELECT r.*, f.name as field_name FROM reservations r
     JOIN fields f ON r.field_id = f.id
     WHERE r.user_id = ? ORDER BY r.date, r.start_time`,
    [user_id],
    (err, rows) => res.json(rows)
  );
});

// Cancelar reserva
app.delete('/api/reservations/:id', (req, res) => {
  const id = req.params.id;
  db.run("UPDATE reservations SET status = 'Cancelada' WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al cancelar' });
    res.json({ message: 'Cancelada' });
  });
});

app.delete('/api/history/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  db.run(
    "DELETE FROM reservations WHERE user_id = ?",
    [user_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al borrar historial' });
      res.json({ message: 'Historial borrado correctamente' });
    }
  );
});

// Pago Nequi (simulado)
app.post('/api/nequi/pay', (req, res) => {
  const { phone, amount, reference } = req.body;
  // Aquí conectas con la API real de Nequi
  res.json({ qr: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=PAGO-${reference}-${amount}` });
});

// Ruta protegida para administrador
app.get('/api/admin/reservations', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer admin123') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  db.all(
    `SELECT u.full_name, f.name AS field_name, r.date, r.start_time, r.status
     FROM reservations r
     JOIN users u ON r.user_id = u.id
     JOIN fields f ON r.field_id = f.id
     ORDER BY r.date, r.start_time`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al cargar datos' });
      res.json(rows);
    }
  );
});

// Paso 1: Crear reserva (POST)
app.post('/api/reservations', (req, res) => {
  const { user_id, field_id, date, start_time, end_time } = req.body;

  // 1. Verificar que el horario no esté ocupado
  db.get(
    `SELECT id FROM reservations
     WHERE field_id = ? AND date = ? AND start_time = ? AND status != 'Cancelada'`,
    [field_id, date, start_time],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error al verificar disponibilidad' });
      if (row) return res.status(409).json({ error: 'Horario ya reservado. Elige otro.' });

      // 2. Insertar la reserva
      db.run(
        `INSERT INTO reservations (user_id, field_id, date, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
        [user_id, field_id, date, start_time, end_time],
        function (err) {
          if (err) return res.status(500).json({ error: 'Error al reservar' });
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

// Paso 2: Listar todas las reservas (GET /api/admin/reservations) - solo admin
app.get('/api/admin/reservations', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer admin123') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  db.all(
    `SELECT r.id, u.full_name, f.name AS field_name, r.date, r.start_time, r.end_time, r.status
     FROM reservations r
     JOIN users u ON r.user_id = u.id
     JOIN fields f ON r.field_id = f.id
     ORDER BY r.date, r.start_time`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al cargar' });
      res.json(rows);
    }
  );
});

// Paso 3: Editar reserva (solo admin)
app.put('/api/admin/reservations/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer admin123') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { date, start_time, end_time, status } = req.body;
  db.run(
    `UPDATE reservations
     SET date = ?, start_time = ?, end_time = ?, status = ?
     WHERE id = ?`,
    [date, start_time, end_time, status, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar' });
      res.json({ message: 'Reserva actualizada' });
    }
  );
});

// Paso 4: Eliminar reserva (solo admin)
app.delete('/api/admin/reservations/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer admin123') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  db.run(
    `DELETE FROM reservations WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar' });
      res.json({ message: 'Reserva eliminada' });
    }
  );
});

// CRUD de canchas (solo admin)
const protectAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer admin123') {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
};

// GET todas las canchas
app.get('/api/admin/fields', protectAdmin, (req, res) => {
  db.all('SELECT * FROM fields ORDER BY id', [], (err, rows) => res.json(rows));
});

// POST nueva cancha
app.post('/api/admin/fields', protectAdmin, (req, res) => {
  const { name, location, price_per_hour } = req.body;
  db.run(
    'INSERT INTO fields (name, location, price_per_hour) VALUES (?, ?, ?)',
    [name, location, price_per_hour],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al crear' });
      res.json({ id: this.lastID });
    }
  );
});

// PUT editar cancha
app.put('/api/admin/fields/:id', protectAdmin, (req, res) => {
  const { name, location, price_per_hour } = req.body;
  db.run(
    'UPDATE fields SET name = ?, location = ?, price_per_hour = ? WHERE id = ?',
    [name, location, price_per_hour, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar' });
      res.json({ message: 'Cancha actualizada' });
    }
  );
});

// DELETE cancha
app.delete('/api/admin/fields/:id', protectAdmin, (req, res) => {
  db.run('DELETE FROM fields WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar' });
    res.json({ message: 'Cancha eliminada' });
  });
});

// Crear un pago simulado
app.post("/api/payments/create", (req, res) => {
    const { reserva_id, monto } = req.body;
    db.run(
        "INSERT INTO pagos (reserva_id, monto, estado) VALUES (?, ?, 'pendiente')",
        [reserva_id, monto],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ payment_id: this.lastID, estado: "pendiente" });
        }
    );
});

// Confirmar pago simulado
app.post("/api/payments/confirm/:id", (req, res) => {
    const { id } = req.params;
    db.run(
        "UPDATE pagos SET estado = 'pagado' WHERE id = ?",
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ payment_id: id, estado: "pagado" });
        }
    );
});

// Consultar estado de pago
app.get("/api/payments/:id", (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM pagos WHERE id = ?", [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

// Obtener pago por ID de reserva
app.get("/api/payments/by-reserva/:reserva_id", (req, res) => {
    const { reserva_id } = req.params;
    db.get("SELECT * FROM pagos WHERE reserva_id = ?", [reserva_id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row || {});
    });
});

// Ruta para obtener las canchas disponibles
//app.get('/api/fields', (req, res) => {
//  const sql = `SELECT * FROM fields`;
  //db.all(sql, [], (err, rows) => {
    //if (err) {
      //console.error(err.message);
      //res.status(500).json({ error: 'Error al obtener las canchas' });
    //} else {
      //res.json(rows);
   // }
 // });
//});


app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));