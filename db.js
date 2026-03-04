// ===== tuesday.com - Database Layer (SQLite) =====
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Use /data (Render persistent disk) if it exists, otherwise ./data for local dev
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`Database directory: ${DATA_DIR}`);

const db = new Database(path.join(DATA_DIR, 'tuesday.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== Schema Creation =====
function createTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            initials TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#0073ea',
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS groups_ (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#579bfc',
            position INTEGER NOT NULL DEFAULT 0,
            collapsed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            status TEXT DEFAULT '',
            priority TEXT DEFAULT '',
            date TEXT DEFAULT '',
            position INTEGER DEFAULT 0,
            subitems_collapsed INTEGER DEFAULT 1,
            created_by TEXT REFERENCES users(id),
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS item_persons (
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (item_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS subitems (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            status TEXT DEFAULT '',
            priority TEXT DEFAULT '',
            date TEXT DEFAULT '',
            position INTEGER DEFAULT 0,
            created_by TEXT REFERENCES users(id),
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS subitem_persons (
            subitem_id TEXT NOT NULL REFERENCES subitems(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (subitem_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            parent_type TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            type TEXT DEFAULT '',
            data TEXT,
            uploaded_by TEXT REFERENCES users(id),
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS updates_ (
            id TEXT PRIMARY KEY,
            parent_type TEXT NOT NULL,
            parent_id TEXT NOT NULL,
            author_id TEXT NOT NULL REFERENCES users(id),
            text TEXT NOT NULL,
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            item_id TEXT,
            item_title TEXT,
            actor_name TEXT,
            message TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            action TEXT NOT NULL,
            item_id TEXT,
            item_title TEXT,
            details TEXT,
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at INTEGER NOT NULL,
            used INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER)*1000)
        );
    `);
}

// ===== Seed Data =====
function seedData() {
    const groupCount = db.prepare('SELECT COUNT(*) as c FROM groups_').get().c;
    if (groupCount > 0) return; // Already seeded

    console.log('Seeding default data...');
    const defaultPassword = bcrypt.hashSync('tuesday2026', 10);

    // --- Users (team members) ---
    const insertUser = db.prepare('INSERT INTO users (id, email, password_hash, name, initials, color) VALUES (?,?,?,?,?,?)');
    const members = [
        { id:'sh', email:'shaun@beaubottles.com', name:'Shaun Hunte', initials:'SH', color:'#fdab3d' },
        { id:'jc', email:'jan@beaubottles.com', name:'Jan Capogna', initials:'JC', color:'#00c875' },
        { id:'br', email:'batool@beaubottles.com', name:'Batool Reh', initials:'BR', color:'#e2445c' },
        { id:'dr', email:'dimary@beaubottles.com', name:'Dimary Rohena', initials:'DR', color:'#ff158a' },
        { id:'sa', email:'sarah@beaubottles.com', name:'Sarah Hunte', initials:'SA', color:'#579bfc' }
    ];
    for (const m of members) {
        insertUser.run(m.id, m.email, defaultPassword, m.name, m.initials, m.color);
    }

    // --- Groups ---
    const insertGroup = db.prepare('INSERT INTO groups_ (id, name, color, position, collapsed) VALUES (?,?,?,?,?)');
    const groups = [
        { id:'g1', name:'Long Term Group Projects (Hours Per Day Update)', color:'#ff642e', position:0 },
        { id:'g2', name:'Website Optimization', color:'#00c875', position:1 },
        { id:'g3', name:'Design Workflow', color:'#a25ddc', position:2 },
        { id:'g4', name:'Ad/Content Creation Workflow', color:'#ff642e', position:3 },
        { id:'g5', name:'Sales Workflows', color:'#579bfc', position:4 }
    ];
    for (const g of groups) {
        insertGroup.run(g.id, g.name, g.color, g.position, 0);
    }

    // --- Items ---
    const insertItem = db.prepare('INSERT INTO items (id, group_id, title, status, priority, date, position, subitems_collapsed) VALUES (?,?,?,?,?,?,?,?)');
    const insertPerson = db.prepare('INSERT INTO item_persons (item_id, user_id) VALUES (?,?)');
    const insertAttachment = db.prepare('INSERT INTO attachments (id, parent_type, parent_id, name, size, type, data) VALUES (?,?,?,?,?,?,?)');
    const insertUpdate = db.prepare('INSERT INTO updates_ (id, parent_type, parent_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)');

    const items = [
        { id:'i1', gid:'g1', title:'Update QR Code', persons:['sh','jc','br'], status:'stuck', priority:'high', date:'', pos:0,
          attachments:[], updates:[{id:'u101',author:'dr',text:'We need to update the QR code to make it mobile friendly and updated list',ts:1771243200000}] },
        { id:'i2', gid:'g1', title:'Influencer Hero Management', persons:['jc'], status:'ongoing', priority:'medium', date:'', pos:1, attachments:[], updates:[] },
        { id:'i3', gid:'g1', title:'Catalogue Updates (ongoing)', persons:['br'], status:'ongoing', priority:'low', date:'', pos:2, attachments:[], updates:[] },
        { id:'i4', gid:'g2', title:'How it works section needs updating', persons:['jc','br'], status:'done', priority:'critical', date:'2025-02-13', pos:0,
          attachments:[{id:'f1',name:'mockup.pdf',size:245000,type:'application/pdf'},{id:'f2',name:'notes.docx',size:52000,type:'application/msword'}],
          updates:[{id:'u201',author:'br',text:'@Jan Capogna, I have uploaded the 5-steps images here. They are in the requested size. I left the shadows, I think it looks more realistic because of them, and still looks clean',ts:1771848000000},
                   {id:'u202',author:'jc',text:'@Batool Reh Great job batool! Thanks so much!',ts:1771851600000},
                   {id:'u203',author:'br',text:'@Jan Capogna no problem!!',ts:1771855200000}] },
        { id:'i5', gid:'g2', title:'Clean up Top Navigation Bar', persons:['jc','sh'], status:'done', priority:'critical', date:'', pos:1,
          attachments:[],
          updates:[{id:'u301',author:'jc',text:'I\'ve used Claude and Shopify Sidekick to analyze our customer behavior data and identify navigation improvements that could reduce friction and boost conversions. Please review the attached files for the data analysis and recommendations. Let me know your thoughts! There may be additional data sources we could incorporate to strengthen these insights. @Shaun Hunte @Sarah Hunte',ts:1770811200000},
                   {id:'u302',author:'sh',text:'Awesome!!!! That\'s exactly what I was going to suggest to do',ts:1770814800000},
                   {id:'u303',author:'jc',text:'Now we\'re cooking :) @Shaun Hunte',ts:1770818400000},
                   {id:'u304',author:'sh',text:'Please go ahead with Claude\'s suggestions - Per Shaun',ts:1770897600000},
                   {id:'u305',author:'jc',text:'@Shaun Hunte I switched up the nav. I am still going to see if there is another option in quikify that might look cooler. I will take another look on monday to see if I can tweak it more. Overall, I think its a good improvement.',ts:1770984000000},
                   {id:'u306',author:'jc',text:'@Shaun Hunte @Sarah Hunte I found a way to make the navigation look cleaner on desktop by using a flyout feature. This allowed me to keep the variant submenu sections. Let me know if you have any additional changes.',ts:1771329600000}] },
        { id:'i6', gid:'g2', title:'Ensure all of our photos are lightweight for fast loading', persons:['br','sh','jc'], status:'ongoing', priority:'critical', date:'', pos:2,
          attachments:[],
          updates:[{id:'u401',author:'sh',text:'Image Optimization Recommendations: Aim for under 200KB per image, use WebP format, resize to appropriate dimensions for web display. Focus on product images and lifestyle photos that are currently over 500KB.',ts:1770811200000},
                   {id:'u402',author:'dr',text:'@Batool Reh and I started with LaMarca Files that are above 500Kb as a starting point. Here is the list: Lavender Gingham (front), Garden Tulip (all 3), Crimson Rose (front), Football designs (all 3) yellow and red, yellow and purple, (front and back) orange and purple, orange and grey, royal blue and white',ts:1771243200000},
                   {id:'u403',author:'sh',text:'There are apps that can accomplish this quickly',ts:1771329600000}] },
        { id:'i7', gid:'g2', title:'Update wrap pouch for retail', persons:['sh','br','jc'], status:'', priority:'', date:'', pos:3, attachments:[], updates:[] },
        { id:'i8', gid:'g2', title:'Landing Page Creation for each occasion', persons:['sh'], status:'working_on_it', priority:'high', date:'', pos:4, attachments:[], updates:[] },
        { id:'i9', gid:'g2', title:'Landing Page for Evervase', persons:['sh'], status:'working_on_it', priority:'', date:'', pos:5, attachments:[], updates:[] },
        { id:'i10', gid:'g2', title:'Launch Evervase landing page to collect emails for prelaunch', persons:['sh'], status:'working_on_it', priority:'high', date:'', pos:6, attachments:[], updates:[] },
        { id:'i11', gid:'g2', title:'Install One Click Upsell', persons:['jc'], status:'done', priority:'high', date:'', pos:7,
          attachments:[],
          updates:[{id:'u501',author:'jc',text:'Here is the link to the recommended app: https://apps.shopify.com/zipify-oneclickupsell. Will review features and install.',ts:1770811200000},
                   {id:'u502',author:'jc',text:'@Shaun Hunte @Sarah Hunte Just waiting on support to get back to me about the glitch in the add to cart feature. This is a super cool app. Endlessly customizable. Once they fix the problem on their end I can make it even cooler :) The flows are already converting mostly pre-purchase upsells, which we didn\'t have in place before...so that\'s pretty cool.',ts:1771502400000}] },
        { id:'i12', gid:'g2', title:'Utilize Claude to fill in all SEO fields for product', persons:['sh'], status:'working_on_it', priority:'medium', date:'', pos:8, attachments:[], updates:[] },
        { id:'i13', gid:'g2', title:'Coordinate Rivo Build Out', persons:['sh','jc'], status:'working_on_it', priority:'medium', date:'', pos:9, attachments:[], updates:[] },
        { id:'i14', gid:'g2', title:'SEO blog setup', persons:['sh'], status:'not_started', priority:'medium', date:'', pos:10, attachments:[], updates:[] },
        { id:'i15', gid:'g2', title:'Fix product page "Read More" to link to details accordion dropdown', persons:['jc'], status:'input_needed', priority:'low', date:'', pos:11, attachments:[], updates:[] },
        { id:'i16', gid:'g2', title:'Optimize "How to" Page', persons:['jc'], status:'', priority:'', date:'', pos:12, attachments:[], updates:[] },
        { id:'i17', gid:'g2', title:'Complete "patterns" collection/pages for Spring designs', persons:['jc'], status:'', priority:'', date:'', pos:13, attachments:[], updates:[] },
        { id:'i18', gid:'g2', title:'Troubleshoot search overlap', persons:['sh'], status:'', priority:'', date:'', pos:14, attachments:[], updates:[] },
        { id:'i19', gid:'g2', title:'Fitment Guide Images', persons:['sh','br'], status:'', priority:'', date:'', pos:15, attachments:[], updates:[] },
        { id:'i20', gid:'g3', title:'DAOU Instagram Photos and Videos (with Sarah)', persons:['br','sh'], status:'input_needed', priority:'high', date:'', pos:0, attachments:[], updates:[] },
        { id:'i21', gid:'g3', title:'Spring Instagram Photos and Videos (with Sarah)', persons:['br','sh'], status:'input_needed', priority:'high', date:'', pos:1, attachments:[], updates:[] },
        { id:'i22', gid:'g3', title:'Vase Wrap Photos - Product', persons:['br'], status:'input_needed', priority:'medium', date:'', pos:2, attachments:[], updates:[] },
        { id:'i23', gid:'g3', title:'Vase Wrap Photos - Lifestyle', persons:['br'], status:'input_needed', priority:'medium', date:'', pos:3, attachments:[], updates:[] },
        { id:'i24', gid:'g3', title:'Organize the files', persons:['br','sh'], status:'ongoing', priority:'low', date:'', pos:4, attachments:[], updates:[] },
        { id:'i25', gid:'g3', title:'Create Vase Wrap Tags', persons:['br'], status:'done', priority:'high', date:'', pos:5,
          attachments:[],
          updates:[{id:'u601',author:'br',text:'@Dimary Rohena Vase Wrap Tags are saved here in the shared Google Docs folder.',ts:1771588800000},
                   {id:'u602',author:'dr',text:'thank you! these have been added to the products',ts:1771592400000}] },
        { id:'i26', gid:'g3', title:'Summer Round 1 Printing Files', persons:['br'], status:'input_needed', priority:'high', date:'', pos:6, attachments:[], updates:[] },
        { id:'i27', gid:'g3', title:'Summer Prints', persons:['br'], status:'input_needed', priority:'medium', date:'', pos:7, attachments:[], updates:[] },
        { id:'i28', gid:'g3', title:'Complete all the Lifestyle photos', persons:['br'], status:'working_on_it', priority:'medium', date:'', pos:8, attachments:[], updates:[] },
        { id:'i29', gid:'g3', title:'Remaining Spring Photos - Product', persons:['br'], status:'input_needed', priority:'high', date:'', pos:9, attachments:[], updates:[] },
        { id:'i30', gid:'g3', title:'Remaining Spring Photos - Lifestyle', persons:['br'], status:'input_needed', priority:'high', date:'', pos:10, attachments:[], updates:[] },
        { id:'i31', gid:'g3', title:'Design New Shipping Bags (medium and large) and shipping boxes', persons:['br','sh'], status:'not_started', priority:'low', date:'', pos:11,
          attachments:[],
          updates:[{id:'u701',author:'br',text:'@Sarah Hunte let me know if you have any vision for these. I\'ll start working on some inspiration/research and create some artwork options for these. @Dimary Rohena please share the dimensions for both the sizes. Thank you!',ts:1771858800000},
                   {id:'u702',author:'dr',text:'@Batool Reh this would be the ideal medium size. y: 10.5" G: 12" P:0.25"',ts:1771930800000}] },
        { id:'i32', gid:'g4', title:'Overall marketing calendar creation - next 12 months', persons:['jc'], status:'input_needed', priority:'high', date:'', pos:0,
          attachments:[{id:'f3',name:'calendar-draft.pdf',size:180000,type:'application/pdf'}],
          updates:[{id:'u801',author:'sa',text:'Hi! Here is a list of Champs specific holidays for our marketing calendar, along with key times of year for Weddings and everything bridal :)',ts:1770897600000},
                   {id:'u802',author:'jc',text:'@Sarah Hunte of course! Let me know if you can open this one. It\'s excel. Not sure if this is the format you were imaging, but let me know any edits to the format and once that is approved, I will go in and update the campaign items. :) Thanks!',ts:1771329600000},
                   {id:'u803',author:'sa',text:'hi @Jan Capogna I can\'t open this marketing calendar file for some reason on my laptop here, would you mind resending in a different format? thank you!',ts:1771333200000},
                   {id:'u804',author:'jc',text:'@Sarah Hunte I just copied the doc I have for TVG so we have an outline to follow if we shift to the monday content creation template. After you review and make changes, I can add it to the drive. Let\'s jump on a call whenever you are free :)',ts:1771416000000}] },
        { id:'i33', gid:'g4', title:'Build Out Bundles for Website', persons:['sh','jc'], status:'in_process', priority:'medium', date:'', pos:1, attachments:[], updates:[] },
        { id:'i34', gid:'g4', title:'Evaluating the performance of Vicka on meta platform', persons:['jc','sh'], status:'done', priority:'low', date:'', pos:2, attachments:[], updates:[] },
        { id:'i35', gid:'g4', title:'Create a calendar of drops for reps', persons:['jc'], status:'not_started', priority:'medium', date:'', pos:3, attachments:[], updates:[] },
        { id:'i36', gid:'g4', title:'Develop Cross Posting Process', persons:['jc'], status:'not_started', priority:'medium', date:'', pos:4, attachments:[], updates:[] },
        { id:'i37', gid:'g4', title:'Develop ad ideas surround our "shame the naked bottle" Campaign', persons:['jc','sh'], status:'not_started', priority:'high', date:'', pos:5, attachments:[], updates:[] },
        { id:'i38', gid:'g4', title:'Try Pomelli on Google labs to create a photoshoot', persons:['jc','br','sh'], status:'not_started', priority:'critical', date:'', pos:6,
          attachments:[],
          updates:[{id:'u901',author:'dr',text:'I played with it a little. Takes a bit for it to catch on. This is best for ad creation like reels and stuff.',ts:1771588800000}] },
        { id:'i39', gid:'g5', title:'Tik Tok Shop Product Update', persons:['jc','sh'], status:'stuck', priority:'medium', date:'', pos:0, attachments:[], updates:[] },
        { id:'i40', gid:'g5', title:'Implement New Influencer Hero Strategy', persons:['jc'], status:'not_started', priority:'medium', date:'', pos:1, attachments:[], updates:[] },
        { id:'i41', gid:'g5', title:'Inserts for MF- BB Packaging', persons:['jc'], status:'not_started', priority:'low', date:'', pos:2, attachments:[], updates:[] },
        { id:'i42', gid:'g5', title:'Faire Management', persons:['jc'], status:'', priority:'', date:'', pos:3,
          attachments:[],
          updates:[{id:'u1001',author:'jc',text:'@Shaun Hunte @Sarah Hunte I would like to set up some email campaigns to announce our Easter and Daou collections. The last campaign I ran generated $1209. I will also need to update the collections on our Faire Shop. I think this is a high priority task as it drives revenue. I have added a CSV of all the available data on our ad spend. Our ROAS is 4.5x for January.',ts:1771329600000},
                   {id:'u1002',author:'dr',text:'@Shaun Hunte I second her thoughts!!!!! Faire brings a lot of revenue for us so if we can stay hot and relevant that would be amazing!!!!',ts:1771858800000}] },
        { id:'i43', gid:'g5', title:'Sign up to Sendoso.com', persons:['sh'], status:'', priority:'', date:'', pos:4, attachments:[], updates:[] }
    ];

    const seedTransaction = db.transaction(() => {
        for (const item of items) {
            insertItem.run(item.id, item.gid, item.title, item.status, item.priority, item.date, item.pos, 1);
            for (const pid of item.persons) {
                insertPerson.run(item.id, pid);
            }
            for (const att of item.attachments) {
                insertAttachment.run(att.id, 'item', item.id, att.name, att.size, att.type, att.data || null);
            }
            for (const upd of item.updates) {
                insertUpdate.run(upd.id, 'item', item.id, upd.author, upd.text, upd.ts);
            }
        }
    });
    seedTransaction();
    console.log(`Seeded ${members.length} users, ${groups.length} groups, ${items.length} items`);
}

// ===== Query Helpers =====

// Get full board state in the shape the frontend expects
function getBoard() {
    const members = db.prepare(`SELECT id, initials AS name, name AS fullName, initials, color FROM users ORDER BY created_at`).all();
    const groups = db.prepare(`SELECT id, name, color, position, collapsed FROM groups_ ORDER BY position`).all();
    groups.forEach(g => { g.collapsed = !!g.collapsed; });

    const rawItems = db.prepare(`SELECT id, group_id AS groupId, title, status, priority, date, position, subitems_collapsed AS subitemsCollapsed FROM items ORDER BY position`).all();

    // Batch-load related data
    const allPersons = db.prepare(`SELECT item_id, user_id FROM item_persons`).all();
    const allSubitems = db.prepare(`SELECT id, parent_id, title, status, priority, date, position FROM subitems ORDER BY position`).all();
    const allSubitemPersons = db.prepare(`SELECT subitem_id, user_id FROM subitem_persons`).all();
    const allAttachments = db.prepare(`SELECT id, parent_type, parent_id, name, size, type, data FROM attachments`).all();
    const allUpdates = db.prepare(`SELECT id, parent_type, parent_id, author_id AS author, text, created_at AS timestamp FROM updates_ ORDER BY created_at`).all();

    // Index by parent
    const personsByItem = {};
    allPersons.forEach(p => { (personsByItem[p.item_id] = personsByItem[p.item_id] || []).push(p.user_id); });

    const subitemsByParent = {};
    allSubitems.forEach(s => { (subitemsByParent[s.parent_id] = subitemsByParent[s.parent_id] || []).push(s); });

    const subPersonsBySub = {};
    allSubitemPersons.forEach(p => { (subPersonsBySub[p.subitem_id] = subPersonsBySub[p.subitem_id] || []).push(p.user_id); });

    const attachmentsByParent = {};
    allAttachments.forEach(a => {
        const key = a.parent_type + ':' + a.parent_id;
        (attachmentsByParent[key] = attachmentsByParent[key] || []).push({ id: a.id, name: a.name, size: a.size, type: a.type, data: a.data });
    });

    const updatesByParent = {};
    allUpdates.forEach(u => {
        const key = u.parent_type + ':' + u.parent_id;
        (updatesByParent[key] = updatesByParent[key] || []).push({ id: u.id, author: u.author, text: u.text, timestamp: u.timestamp });
    });

    // Assemble items
    const assembledItems = rawItems.map(item => {
        const subs = (subitemsByParent[item.id] || []).map(s => ({
            id: s.id,
            title: s.title,
            persons: subPersonsBySub[s.id] || [],
            status: s.status,
            priority: s.priority,
            date: s.date,
            attachments: attachmentsByParent['subitem:' + s.id] || [],
            updates: updatesByParent['subitem:' + s.id] || []
        }));

        return {
            id: item.id,
            groupId: item.groupId,
            title: item.title,
            persons: personsByItem[item.id] || [],
            status: item.status,
            priority: item.priority,
            date: item.date,
            attachments: attachmentsByParent['item:' + item.id] || [],
            subitems: subs,
            updates: updatesByParent['item:' + item.id] || [],
            subitemsCollapsed: !!item.subitemsCollapsed
        };
    });

    return { boardName: 'Beau Bottles Workflow', members, groups, items: assembledItems };
}

// Get items assigned to a specific user
function getMyWork(userId) {
    const itemIds = db.prepare(`SELECT item_id FROM item_persons WHERE user_id = ?`).all(userId).map(r => r.item_id);
    if (itemIds.length === 0) return [];
    const board = getBoard();
    return board.items.filter(i => itemIds.includes(i.id));
}

// Get dashboard stats and recent activity
function getDashboard(userId) {
    const total = db.prepare('SELECT COUNT(*) as c FROM items').get().c;
    const done = db.prepare("SELECT COUNT(*) as c FROM items WHERE status='done'").get().c;
    const working = db.prepare("SELECT COUNT(*) as c FROM items WHERE status='working_on_it' OR status='in_process'").get().c;
    const stuck = db.prepare("SELECT COUNT(*) as c FROM items WHERE status='stuck'").get().c;

    const activity = db.prepare(`
        SELECT a.id, a.action, a.item_id, a.item_title, a.details, a.created_at,
               u.name AS user_name, u.initials AS user_initials, u.color AS user_color
        FROM activity_log a JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC LIMIT 20
    `).all();

    const myItemIds = db.prepare('SELECT item_id FROM item_persons WHERE user_id = ?').all(userId).map(r => r.item_id);
    let needsAttention = [];
    if (myItemIds.length > 0) {
        const placeholders = myItemIds.map(() => '?').join(',');
        needsAttention = db.prepare(`SELECT id, title, status, priority FROM items WHERE id IN (${placeholders}) AND (status = 'stuck' OR status = 'input_needed') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 10`).all(...myItemIds);
    }

    return { stats: { total, done, working, stuck }, activity, needsAttention };
}

// Log an activity
function logActivity(userId, action, itemId, itemTitle, details) {
    db.prepare('INSERT INTO activity_log (id, user_id, action, item_id, item_title, details) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), userId, action, itemId || null, itemTitle || null, details || null);
}

// Create a notification
function createNotification(userId, type, itemId, itemTitle, actorName, message) {
    db.prepare('INSERT INTO notifications (id, user_id, type, item_id, item_title, actor_name, message) VALUES (?,?,?,?,?,?,?)')
      .run(uuidv4(), userId, type, itemId || null, itemTitle || null, actorName || null, message);
}

// Initialize
createTables();
seedData();

module.exports = { db, getBoard, getMyWork, getDashboard, logActivity, createNotification };
