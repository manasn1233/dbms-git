const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db'); // Your MySQL connection
const app = express();

// Use PORT from environment (Railway will provide it)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session setup - use environment variable for secret, fallback if not set
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key_here',
  resave: false,
  saveUninitialized: false,
}));

// Admin login form
app.get('/admin/login', (req, res) => {
  res.render('admin_login');  // create views/admin_login.ejs
});

// Admin login POST handler
app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT * FROM admins WHERE email = ?';
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.send('Database error');
    }

    if (results.length === 0) {
      return res.send('Admin not found');
    }

    const admin = results[0];

    bcrypt.compare(password, admin.password, (err, match) => {
      if (err) return res.send('Error checking password');

      if (match) {
        req.session.adminId = admin.id;
        res.redirect('/admin/dashboard');
      } else {
        res.send('Incorrect password');
      }
    });
  });
});

// Middleware to protect admin routes
function adminAuth(req, res, next) {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// Admin dashboard
app.get('/admin/dashboard', adminAuth, (req, res) => {
  const query = `
    SELECT items.id, items.title, items.description, items.status, users.name, users.email
    FROM items
    JOIN users ON items.user_id = users.id
    ORDER BY items.id DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.send('Database error');
    }
    res.render('admin_dashboard', { items: results });
  });
});

// Route to update item status (Lost/Found only)
app.post('/admin/items/:id/update', adminAuth, (req, res) => {
  const itemId = req.params.id;
  const { status } = req.body;

  if (!['Lost', 'Found'].includes(status)) {
    return res.send('Invalid status');
  }

  const updateQuery = 'UPDATE items SET status = ? WHERE id = ?';
  db.query(updateQuery, [status, itemId], (err) => {
    if (err) {
      console.error('Error updating item status:', err);
      return res.send('Database error');
    }
    res.redirect('/admin/dashboard');
  });
});

// Route to delete an item report
app.post('/admin/items/:id/delete', adminAuth, (req, res) => {
  const itemId = req.params.id;

  const deleteQuery = 'DELETE FROM items WHERE id = ?';
  db.query(deleteQuery, [itemId], (err) => {
    if (err) {
      console.error('Error deleting item:', err);
      return res.send('Database error');
    }
    res.redirect('/admin/dashboard');
  });
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Home route
app.get('/', (req, res) => {
  res.render('home');
});

// Show the report form
app.get('/report', (req, res) => {
  res.render('form');
});

// Handle form submission
app.post('/submit', (req, res) => {
  const { name, email, title, description, status } = req.body;

  const findUserQuery = 'SELECT id FROM users WHERE email = ?';
  db.query(findUserQuery, [email], (err, results) => {
    if (err) {
      console.error('Error finding user:', err);
      return res.send('Database error');
    }

    if (results.length > 0) {
      insertItem(results[0].id);
    } else {
      const insertUserQuery = 'INSERT INTO users (name, email, password) VALUES (?, ?, "")';
      db.query(insertUserQuery, [name, email], (err, result) => {
        if (err) {
          console.error('Error inserting user:', err);
          return res.send('Database error');
        }
        insertItem(result.insertId);
      });
    }
  });

  function insertItem(userId) {
    const insertItemQuery = 'INSERT INTO items (title, description, status, user_id) VALUES (?, ?, ?, ?)';
    db.query(insertItemQuery, [title, description, status, userId], (err) => {
      if (err) {
        console.error('Error inserting item:', err);
        return res.send('Failed to save item');
      }
      // Redirect to thank you page after successful submission
      res.redirect('/thankyou');
    });
  }
});

// Thank you page route
app.get('/thankyou', (req, res) => {
  res.render('thankyou');  // create views/thankyou.ejs
});

// Display all lost & found items
app.get('/items', (req, res) => {
  const query = `
    SELECT items.title, items.description, items.status, users.name, users.email
    FROM items
    JOIN users ON items.user_id = users.id
    ORDER BY items.id DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching items:', err);
      return res.send('Database error');
    }
    res.render('items', { items: results });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
