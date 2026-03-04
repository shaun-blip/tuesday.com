// ===== tuesday.com - Express Server =====
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const { db, getBoard, getMyWork, getDashboard, logActivity, createNotification } = require('./db');
const { initTransporter, sendAssignmentEmail, sendUpdateEmail, sendMentionEmail, sendPasswordResetEmail } = require('./email');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tuesday-default-secret';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

initTransporter();

// ===== JWT Middleware =====
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET);
        req.userId = decoded.id;
        req.userName = decoded.name;
        next();
    } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

function makeToken(user) {
    return jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

// ===== Auth Routes =====
app.post('/api/auth/register', (req, res) => {
    try {
        const { email, password, name, initials, color } = req.body;
        if (!email || !password || !name || !initials) return res.status(400).json({ error: 'All fields required' });
        const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (exists) return res.status(409).json({ error: 'Email already registered' });
        const id = uuidv4();
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('INSERT INTO users (id, email, password_hash, name, initials, color) VALUES (?,?,?,?,?,?)')
          .run(id, email, hash, name, initials.toUpperCase(), color || '#0073ea');
        const user = { id, email, name, initials: initials.toUpperCase(), color: color || '#0073ea' };
        res.json({ token: makeToken(user), user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        const user = db.prepare('SELECT id, email, password_hash, name, initials, color FROM users WHERE email = ?').get(email);
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
        const { password_hash, ...safe } = user;
        res.json({ token: makeToken(safe), user: safe });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auth/change-password', auth, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
        const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
        const newHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.userId);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
    try {
        const user = db.prepare('SELECT id, email, name, initials, color FROM users WHERE id = ?').get(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Forgot / Reset Password =====
app.post('/api/auth/forgot-password', (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        // Always return success to avoid revealing whether email exists
        const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
        if (!user) return res.json({ ok: true });
        // Invalidate any existing unused tokens for this user
        db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
        // Generate a secure reset token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
        db.prepare('INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?,?,?,?)')
          .run(uuidv4(), user.id, token, expiresAt);
        // Send reset email (non-blocking)
        const resetUrl = `${req.protocol}://${req.get('host')}/login.html#reset=${token}`;
        sendPasswordResetEmail(user.email, user.name, resetUrl).catch(() => {});
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
        if (!reset) return res.status(400).json({ error: 'Invalid or expired reset link' });
        if (Date.now() > reset.expires_at) {
            db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
            return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
        }
        const hash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, reset.user_id);
        db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Board Route (full state) =====
app.get('/api/board', auth, (req, res) => {
    try { res.json(getBoard()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Dashboard + My Work =====
app.get('/api/dashboard', auth, (req, res) => {
    try { res.json(getDashboard(req.userId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-work', auth, (req, res) => {
    try { res.json(getMyWork(req.userId)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Group Routes =====
app.post('/api/groups', auth, (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const maxPos = db.prepare('SELECT MAX(position) as m FROM groups_').get().m || 0;
        const id = uuidv4();
        db.prepare('INSERT INTO groups_ (id, name, color, position) VALUES (?,?,?,?)').run(id, name, color || '#579bfc', maxPos + 1);
        logActivity(req.userId, 'created_group', null, name, null);
        res.json({ id, name, color: color || '#579bfc', position: maxPos + 1, collapsed: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// NOTE: /reorder must be before /:id so Express doesn't match "reorder" as an :id param
app.put('/api/groups/reorder', auth, (req, res) => {
    try {
        const { items } = req.body; // [{id, position}]
        const stmt = db.prepare('UPDATE groups_ SET position = ? WHERE id = ?');
        const tx = db.transaction(() => { for (const i of items) stmt.run(i.position, i.id); });
        tx();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/groups/:id', auth, (req, res) => {
    try {
        const { name, color, collapsed } = req.body;
        const g = db.prepare('SELECT * FROM groups_ WHERE id = ?').get(req.params.id);
        if (!g) return res.status(404).json({ error: 'Group not found' });
        db.prepare('UPDATE groups_ SET name=?, color=?, collapsed=? WHERE id=?')
          .run(name ?? g.name, color ?? g.color, collapsed !== undefined ? (collapsed ? 1 : 0) : g.collapsed, req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/groups/:id', auth, (req, res) => {
    try {
        const g = db.prepare('SELECT name FROM groups_ WHERE id = ?').get(req.params.id);
        if (!g) return res.status(404).json({ error: 'Group not found' });
        db.prepare('DELETE FROM groups_ WHERE id = ?').run(req.params.id);
        logActivity(req.userId, 'deleted_group', null, g.name, null);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Item Routes =====
app.post('/api/items', auth, (req, res) => {
    try {
        const { groupId, title, status, priority, date, persons } = req.body;
        if (!title || !groupId) return res.status(400).json({ error: 'Title and groupId required' });
        const maxPos = db.prepare('SELECT MAX(position) as m FROM items WHERE group_id = ?').get(groupId).m;
        const id = uuidv4();
        db.prepare('INSERT INTO items (id, group_id, title, status, priority, date, position, created_by) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, groupId, title, status || '', priority || '', date || '', (maxPos ?? -1) + 1, req.userId);
        if (persons && persons.length) {
            const stmt = db.prepare('INSERT INTO item_persons (item_id, user_id) VALUES (?,?)');
            for (const p of persons) stmt.run(id, p);
            notifyAssignment(req.userId, persons, id, title);
        }
        logActivity(req.userId, 'created_item', id, title, null);
        res.json({ id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// NOTE: /reorder and /bulk must be before /:id so Express doesn't match them as :id params
app.put('/api/items/reorder', auth, (req, res) => {
    try {
        const { items } = req.body; // [{id, group_id, position}]
        const stmt = db.prepare('UPDATE items SET group_id = ?, position = ? WHERE id = ?');
        const tx = db.transaction(() => { for (const i of items) stmt.run(i.group_id, i.position, i.id); });
        tx();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/bulk', auth, (req, res) => {
    try {
        const { itemIds, field, value } = req.body;
        if (!itemIds || !itemIds.length || !field) return res.status(400).json({ error: 'itemIds and field required' });
        const allowed = ['status', 'priority', 'group_id'];
        if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
        const stmt = db.prepare(`UPDATE items SET ${field} = ? WHERE id = ?`);
        const tx = db.transaction(() => { for (const id of itemIds) stmt.run(value, id); });
        tx();
        logActivity(req.userId, 'bulk_update', null, null, `Updated ${itemIds.length} items: ${field} = ${value}`);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/items/bulk', auth, (req, res) => {
    try {
        const { itemIds } = req.body;
        if (!itemIds || !itemIds.length) return res.status(400).json({ error: 'itemIds required' });
        const stmt = db.prepare('DELETE FROM items WHERE id = ?');
        const tx = db.transaction(() => { for (const id of itemIds) stmt.run(id); });
        tx();
        logActivity(req.userId, 'bulk_delete', null, null, `Deleted ${itemIds.length} items`);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/:id', auth, (req, res) => {
    try {
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const { title, status, priority, date, persons, subitems_collapsed, groupId } = req.body;

        // Detect status change for notifications
        const oldStatus = item.status;
        const newStatus = status !== undefined ? status : oldStatus;

        db.prepare('UPDATE items SET title=?, status=?, priority=?, date=?, subitems_collapsed=?, group_id=? WHERE id=?')
          .run(title ?? item.title, newStatus, priority ?? item.priority, date ?? item.date,
               subitems_collapsed !== undefined ? (subitems_collapsed ? 1 : 0) : item.subitems_collapsed,
               groupId ?? item.group_id, req.params.id);

        // Update persons if provided
        if (persons !== undefined) {
            const oldPersons = db.prepare('SELECT user_id FROM item_persons WHERE item_id = ?').all(req.params.id).map(r => r.user_id);
            db.prepare('DELETE FROM item_persons WHERE item_id = ?').run(req.params.id);
            const stmt = db.prepare('INSERT INTO item_persons (item_id, user_id) VALUES (?,?)');
            for (const p of persons) stmt.run(req.params.id, p);
            // Notify newly assigned persons
            const newlyAssigned = persons.filter(p => !oldPersons.includes(p));
            if (newlyAssigned.length) notifyAssignment(req.userId, newlyAssigned, req.params.id, title || item.title);
        }

        // Log status change
        if (status !== undefined && status !== oldStatus) {
            logActivity(req.userId, 'updated_status', req.params.id, title || item.title, `Changed status to ${status}`);
            notifyStatusChange(req.userId, req.params.id, title || item.title, status);
        } else if (title !== undefined || priority !== undefined) {
            logActivity(req.userId, 'updated_item', req.params.id, title || item.title, null);
        }

        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/items/:id', auth, (req, res) => {
    try {
        const item = db.prepare('SELECT title FROM items WHERE id = ?').get(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
        logActivity(req.userId, 'deleted_item', req.params.id, item.title, null);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Subitem Routes =====
app.post('/api/items/:id/subitems', auth, (req, res) => {
    try {
        const { title, status, priority, date, persons } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const parentId = req.params.id;
        const maxPos = db.prepare('SELECT MAX(position) as m FROM subitems WHERE parent_id = ?').get(parentId).m;
        const id = uuidv4();
        db.prepare('INSERT INTO subitems (id, parent_id, title, status, priority, date, position, created_by) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, parentId, title, status || '', priority || '', date || '', (maxPos ?? -1) + 1, req.userId);
        if (persons && persons.length) {
            const stmt = db.prepare('INSERT INTO subitem_persons (subitem_id, user_id) VALUES (?,?)');
            for (const p of persons) stmt.run(id, p);
        }
        const parentTitle = db.prepare('SELECT title FROM items WHERE id = ?').get(parentId)?.title || '';
        logActivity(req.userId, 'created_subitem', parentId, parentTitle, `Created subitem: ${title}`);
        res.json({ id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/subitems/:id', auth, (req, res) => {
    try {
        const sub = db.prepare('SELECT * FROM subitems WHERE id = ?').get(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subitem not found' });
        const { title, status, priority, date, persons } = req.body;
        db.prepare('UPDATE subitems SET title=?, status=?, priority=?, date=? WHERE id=?')
          .run(title ?? sub.title, status ?? sub.status, priority ?? sub.priority, date ?? sub.date, req.params.id);
        if (persons !== undefined) {
            db.prepare('DELETE FROM subitem_persons WHERE subitem_id = ?').run(req.params.id);
            const stmt = db.prepare('INSERT INTO subitem_persons (subitem_id, user_id) VALUES (?,?)');
            for (const p of persons) stmt.run(req.params.id, p);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/subitems/:id', auth, (req, res) => {
    try {
        db.prepare('DELETE FROM subitems WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Update/Comment Routes =====
app.get('/api/items/:id/updates', auth, (req, res) => {
    try {
        const updates = db.prepare('SELECT id, author_id AS author, text, created_at AS timestamp FROM updates_ WHERE parent_type=? AND parent_id=? ORDER BY created_at')
          .all('item', req.params.id);
        res.json(updates);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/items/:id/updates', auth, (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const id = uuidv4();
        const now = Date.now();
        db.prepare('INSERT INTO updates_ (id, parent_type, parent_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)')
          .run(id, 'item', req.params.id, req.userId, text, now);
        const item = db.prepare('SELECT title FROM items WHERE id = ?').get(req.params.id);
        const itemTitle = item?.title || '';
        logActivity(req.userId, 'posted_update', req.params.id, itemTitle, text.substring(0, 100));

        // Notifications for assigned persons
        notifyUpdate(req.userId, req.params.id, 'item', itemTitle, text);

        res.json({ id, author: req.userId, text, timestamp: now });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/subitems/:id/updates', auth, (req, res) => {
    try {
        const updates = db.prepare('SELECT id, author_id AS author, text, created_at AS timestamp FROM updates_ WHERE parent_type=? AND parent_id=? ORDER BY created_at')
          .all('subitem', req.params.id);
        res.json(updates);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/subitems/:id/updates', auth, (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text required' });
        const id = uuidv4();
        const now = Date.now();
        db.prepare('INSERT INTO updates_ (id, parent_type, parent_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)')
          .run(id, 'subitem', req.params.id, req.userId, text, now);
        const sub = db.prepare('SELECT parent_id, title FROM subitems WHERE id = ?').get(req.params.id);
        if (sub) {
            logActivity(req.userId, 'posted_update', sub.parent_id, sub.title, text.substring(0, 100));
        }
        res.json({ id, author: req.userId, text, timestamp: now });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Attachment Routes =====
app.post('/api/attachments', auth, (req, res) => {
    try {
        const { parentType, parentId, name, size, type, data } = req.body;
        if (!parentId || !name) return res.status(400).json({ error: 'parentId and name required' });
        const id = uuidv4();
        db.prepare('INSERT INTO attachments (id, parent_type, parent_id, name, size, type, data, uploaded_by) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, parentType || 'item', parentId, name, size || 0, type || '', data || null, req.userId);
        res.json({ id, name, size: size || 0, type: type || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/attachments/:id', auth, (req, res) => {
    try {
        db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Notification Routes =====
app.get('/api/notifications', auth, (req, res) => {
    try {
        const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId);
        res.json(notifs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications/unread-count', auth, (req, res) => {
    try {
        const r = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(req.userId);
        res.json({ count: r.c });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', auth, (req, res) => {
    try {
        db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', auth, (req, res) => {
    try {
        db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.userId);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Notification Helpers =====
function notifyAssignment(actorId, newPersonIds, itemId, itemTitle) {
    const actor = db.prepare('SELECT name, email FROM users WHERE id = ?').get(actorId);
    if (!actor) return;
    for (const pid of newPersonIds) {
        if (pid === actorId) continue; // Don't notify yourself
        const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(pid);
        if (!user) continue;
        createNotification(pid, 'assigned', itemId, itemTitle, actor.name, `${actor.name} assigned you to "${itemTitle}"`);
        sendAssignmentEmail(user.email, user.name, itemTitle, actor.name).catch(() => {});
    }
}

function notifyUpdate(actorId, parentId, parentType, itemTitle, text) {
    const actor = db.prepare('SELECT name, email FROM users WHERE id = ?').get(actorId);
    if (!actor) return;

    // Get assigned persons for the item
    let personIds;
    if (parentType === 'item') {
        personIds = db.prepare('SELECT user_id FROM item_persons WHERE item_id = ?').all(parentId).map(r => r.user_id);
    } else {
        const sub = db.prepare('SELECT parent_id FROM subitems WHERE id = ?').get(parentId);
        personIds = sub ? db.prepare('SELECT user_id FROM item_persons WHERE item_id = ?').all(sub.parent_id).map(r => r.user_id) : [];
    }

    // Detect @mentions
    const allUsers = db.prepare('SELECT id, name, email FROM users').all();
    const mentionedUsers = allUsers.filter(u => text.includes('@' + u.name) && u.id !== actorId);

    // Notify assigned persons
    const notified = new Set();
    for (const pid of personIds) {
        if (pid === actorId || notified.has(pid)) continue;
        notified.add(pid);
        const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(pid);
        if (!user) continue;
        createNotification(pid, 'update', parentId, itemTitle, actor.name, `${actor.name} posted an update on "${itemTitle}"`);
        sendUpdateEmail(user.email, user.name, itemTitle, actor.name, text).catch(() => {});
    }

    // Notify @mentioned users (who weren't already notified)
    for (const u of mentionedUsers) {
        if (notified.has(u.id)) continue;
        notified.add(u.id);
        createNotification(u.id, 'mention', parentId, itemTitle, actor.name, `${actor.name} mentioned you on "${itemTitle}"`);
        sendMentionEmail(u.email, u.name, itemTitle, actor.name, text).catch(() => {});
    }
}

function notifyStatusChange(actorId, itemId, itemTitle, newStatus) {
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(actorId);
    if (!actor) return;
    const personIds = db.prepare('SELECT user_id FROM item_persons WHERE item_id = ?').all(itemId).map(r => r.user_id);
    for (const pid of personIds) {
        if (pid === actorId) continue;
        createNotification(pid, 'status_change', itemId, itemTitle, actor.name,
            `${actor.name} changed status of "${itemTitle}" to ${newStatus}`);
    }
}

// ===== Admin Routes =====
app.get('/api/admin/users', auth, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT u.id, u.email, u.name, u.initials, u.color, u.created_at,
                   (SELECT COUNT(*) FROM item_persons WHERE user_id = u.id) AS assigned_items,
                   (SELECT COUNT(*) FROM updates_ WHERE author_id = u.id) AS updates_count
            FROM users u ORDER BY u.created_at
        `).all();
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/merge-users', auth, (req, res) => {
    try {
        const { keepId, removeId } = req.body;
        if (!keepId || !removeId) return res.status(400).json({ error: 'keepId and removeId required' });
        if (keepId === removeId) return res.status(400).json({ error: 'Cannot merge a user with themselves' });

        const keepUser = db.prepare('SELECT * FROM users WHERE id = ?').get(keepId);
        const removeUser = db.prepare('SELECT * FROM users WHERE id = ?').get(removeId);
        if (!keepUser) return res.status(404).json({ error: 'Keep user not found' });
        if (!removeUser) return res.status(404).json({ error: 'Remove user not found' });

        const merge = db.transaction(() => {
            // Reassign item_persons (skip duplicates)
            const existingItemAssignments = db.prepare('SELECT item_id FROM item_persons WHERE user_id = ?').all(keepId).map(r => r.item_id);
            const toReassignItems = db.prepare('SELECT item_id FROM item_persons WHERE user_id = ?').all(removeId);
            for (const r of toReassignItems) {
                if (!existingItemAssignments.includes(r.item_id)) {
                    db.prepare('UPDATE item_persons SET user_id = ? WHERE item_id = ? AND user_id = ?').run(keepId, r.item_id, removeId);
                } else {
                    db.prepare('DELETE FROM item_persons WHERE item_id = ? AND user_id = ?').run(r.item_id, removeId);
                }
            }

            // Reassign subitem_persons (skip duplicates)
            const existingSubAssignments = db.prepare('SELECT subitem_id FROM subitem_persons WHERE user_id = ?').all(keepId).map(r => r.subitem_id);
            const toReassignSubs = db.prepare('SELECT subitem_id FROM subitem_persons WHERE user_id = ?').all(removeId);
            for (const r of toReassignSubs) {
                if (!existingSubAssignments.includes(r.subitem_id)) {
                    db.prepare('UPDATE subitem_persons SET user_id = ? WHERE subitem_id = ? AND user_id = ?').run(keepId, r.subitem_id, removeId);
                } else {
                    db.prepare('DELETE FROM subitem_persons WHERE subitem_id = ? AND user_id = ?').run(r.subitem_id, removeId);
                }
            }

            // Reassign updates, items created_by, subitems created_by, attachments, notifications, activity
            db.prepare('UPDATE updates_ SET author_id = ? WHERE author_id = ?').run(keepId, removeId);
            db.prepare('UPDATE items SET created_by = ? WHERE created_by = ?').run(keepId, removeId);
            db.prepare('UPDATE subitems SET created_by = ? WHERE created_by = ?').run(keepId, removeId);
            db.prepare('UPDATE attachments SET uploaded_by = ? WHERE uploaded_by = ?').run(keepId, removeId);
            db.prepare('UPDATE notifications SET user_id = ? WHERE user_id = ?').run(keepId, removeId);
            db.prepare('UPDATE activity_log SET user_id = ? WHERE user_id = ?').run(keepId, removeId);
            db.prepare('UPDATE password_resets SET user_id = ? WHERE user_id = ?').run(keepId, removeId);

            // Delete the duplicate user
            db.prepare('DELETE FROM users WHERE id = ?').run(removeId);
        });
        merge();

        logActivity(req.userId, 'merged_users', null, null, `Merged "${removeUser.name}" (${removeUser.email}) into "${keepUser.name}" (${keepUser.email})`);
        res.json({ ok: true, message: `Merged ${removeUser.name} into ${keepUser.name}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', auth, (req, res) => {
    try {
        const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (req.params.id === req.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        logActivity(req.userId, 'deleted_user', null, null, `Deleted user "${user.name}" (${user.email})`);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Fallback: serve index.html for SPA =====
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log(`\n🟢 tuesday.com server running at http://localhost:${PORT}\n`);
    console.log(`   Default login: any team email (e.g. shaun@beaubottles.com)`);
    console.log(`   Default password: tuesday2026\n`);
});
