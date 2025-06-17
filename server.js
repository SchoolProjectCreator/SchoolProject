const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const app = express();
const dbPath = path.resolve('database.db');
console.log('Using database at:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Failed to open database:', err.message);
});

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
const upload = multer({ dest: 'uploads/' });

// Create table if not exists
db.run(`CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  loan REAL NOT NULL,
  repaid REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  email TEXT,
  phone TEXT
)`, (err) => {
  if (err) {
    console.error('Table creation error:', err.message);
  } else {
    console.log('Clients table ensured.');
    migrateDatabase();
  }
});
function migrateDatabase() {
  db.serialize(() => {
    db.all("PRAGMA table_info(clients)", (err, columns) => {
      if (err) return;
      const colNames = columns.map(col => col.name);
      if (!colNames.includes('email')) {
        db.run('ALTER TABLE clients ADD COLUMN email TEXT');
      }
      if (!colNames.includes('phone')) {
        db.run('ALTER TABLE clients ADD COLUMN phone TEXT');
      }
    });
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_name_created ON clients(name, created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)');
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Get clients
app.get('/api/clients', (req, res) => {
  db.all('SELECT * FROM clients', [], (err, rows) => {
    if (err) {
      console.error('Error fetching clients:', err.message);
      return res.status(500).json([]);
    }
    res.json(Array.isArray(rows) ? rows : []);
  });
});

// Add client (upsert: update if exists, else insert)
app.post('/api/clients', (req, res) => {
  const { name, loan, email, phone } = req.body;
  if (!name || loan === undefined || loan === null || isNaN(Number(loan))) {
    return res.status(400).json({ error: 'Name and valid loan amount are required.' });
  }
  // Try to update first (by name)
  db.run(
    'UPDATE clients SET loan = ?, email = ?, phone = ? WHERE name = ?',
    [loan, email, phone, name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update client.' });
      }
      if (this.changes > 0) {
        // Updated existing client
        return res.status(200).json({ updated: true, name, loan, email, phone });
      } else {
        // Insert new client
        db.run(
          'INSERT INTO clients (name, loan, repaid, created_at, email, phone) VALUES (?, ?, 0, datetime("now","localtime"), ?, ?)',
          [name, loan, email, phone],
          function (err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to add client.' });
            }
            res.status(201).json({ id: this.lastID, name, loan, email, phone });
          }
        );
      }
    }
  );
});

// Update client repayment
app.put('/api/clients/:id/repaid', (req, res) => {
  const id = req.params.id;
  const { repaid } = req.body;
  if (repaid === undefined || isNaN(Number(repaid))) {
    return res.status(400).json({ error: 'Valid repaid amount is required.' });
  }
  db.run(
    'UPDATE clients SET repaid = repaid + ? WHERE id = ?',
    [repaid, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update repayment.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Client not found.' });
      }
      res.json({ message: 'Repayment updated successfully.' });
    }
  );
});

// Add client update endpoint (PUT)
app.put('/api/clients/:id', (req, res) => {
  const id = req.params.id;
  const { name, loan, email, phone } = req.body;
  if (!name || loan === undefined || loan === null || isNaN(Number(loan))) {
    return res.status(400).json({ error: 'Name and valid loan amount are required.' });
  }
  db.run(
    'UPDATE clients SET name = ?, loan = ?, email = ?, phone = ? WHERE id = ?',
    [name, loan, email, phone, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update client.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Client not found.' });
      }
      res.json({ message: 'Client updated successfully.' });
    }
  );
});

// Delete client
app.delete('/api/clients/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM clients WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete client.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }
    res.json({ message: 'Client deleted successfully.' });
  });
});

// Backup clients
app.get('/api/backup', (req, res) => {
  db.all('SELECT * FROM clients', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    fs.writeFile('clients-backup.json', JSON.stringify(rows, null, 2), err => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, count: rows.length, file: 'clients-backup.json' });
    });
  });
});

// Download backup
app.get('/api/backup/download', (req, res) => {
  res.download('clients-backup.json', 'clients-backup.json', err => {
    if (err) res.status(500).json({ error: 'Download failed' });
  });
});

// Restore from backup file
app.post('/api/restore', (req, res) => {
  fs.readFile('clients-backup.json', 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    let clients;
    try {
      clients = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in backup file.' });
    }
    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: 'Backup is not an array.' });
    }
    for (const c of clients) {
      if (!c.name || typeof c.name !== 'string' || !('loan' in c) || isNaN(Number(c.loan))) {
        return res.status(400).json({ error: 'Invalid client object in backup.' });
      }
    }
    let inserted = 0, failed = 0, skipped = 0;
    const insertNext = (i) => {
      if (i >= clients.length) {
        return res.json({ success: true, inserted, failed, skipped });
      }
      const c = Object.assign({}, clients[i]);
      delete c.id;
      db.get('SELECT id FROM clients WHERE name = ? AND created_at = ?', [c.name, c.created_at], (err, row) => {
        if (row) {
          skipped++;
          insertNext(i + 1);
        } else {
          db.run('INSERT INTO clients (name, loan, repaid, created_at, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [c.name, c.loan, c.repaid || 0, c.created_at || new Date().toISOString(), c.email || null, c.phone || null],
            function(err) {
              if (err) {
                failed++;
              } else {
                inserted++;
              }
              insertNext(i + 1);
            }
          );
        }
      });
    };
    insertNext(0);
  });
});

// Restore from uploaded file
app.post('/api/restore/upload', upload.single('backup'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  fs.readFile(req.file.path, 'utf8', (err, data) => {
    fs.unlink(req.file.path, () => {});
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    let clients;
    try {
      clients = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in uploaded file.' });
    }
    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: 'Backup is not an array.' });
    }
    for (const c of clients) {
      if (!c.name || typeof c.name !== 'string' || !('loan' in c) || isNaN(Number(c.loan))) {
        return res.status(400).json({ error: 'Invalid client object in backup.' });
      }
    }
    let inserted = 0, failed = 0, skipped = 0;
    const insertNext = (i) => {
      if (i >= clients.length) {
        return res.json({ success: true, inserted, failed, skipped });
      }
      const c = Object.assign({}, clients[i]);
      delete c.id;
      db.get('SELECT id FROM clients WHERE name = ? AND created_at = ?', [c.name, c.created_at], (err, row) => {
        if (row) {
          skipped++;
          insertNext(i + 1);
        } else {
          db.run('INSERT INTO clients (name, loan, repaid, created_at, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [c.name, c.loan, c.repaid || 0, c.created_at || new Date().toISOString(), c.email || null, c.phone || null],
            function(err) {
              if (err) {
                failed++;
              } else {
                inserted++;
              }
              insertNext(i + 1);
            }
          );
        }
      });
    };
    insertNext(0);
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
