import express from 'express';
import mysql from 'mysql2/promise';
import Pokedex from 'pokedex-promise-v2';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();
const P = new Pokedex();
let holdableItems = null;

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.urlencoded({extended:true}));

const pool = mysql.createPool({
    host: "w1h4cr5sb73o944p.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "h0ffvyi59e6grrqe",
    password: "r6xaiabyag6shdly",
    database: "ganauoglop98hv4t",
    connectionLimit: 10,
    waitForConnections: true
});

app.set('trust proxy', 1)
app.use(session({
    secret:'keyboard-cat',
    resave: false,
    saveUninitialized: true,
}));

app.use((req, res, next) => {
    res.locals.userId = req.session.userId || null;
    next();
});


app.get('/', isUserAuthenticated, (req, res) => {
  res.render('home.ejs');
});


app.get('/login', (req, res) => {
  res.render('login.ejs');
});


app.post('/login', async (req, res) => {
    let username = req.body.username;
    let password = req.body.password.trim();

    let checkUserQuery = `SELECT * FROM Users WHERE username = ?`;
    let params = [username];

    let [rows] = await pool.query(checkUserQuery, params);

    if (rows.length > 0 && await bcrypt.compare(password, rows[0].Password.trim())){

        req.session.authenticated = true;
        req.session.role ='admin';
        req.session.username = username;
        req.session.userId = rows[0].UserID;   // needed by Accounts, Teams and Items

        res.redirect('/');

    } else {

        res.render('login.ejs', {error : 'Bad'});

    }
})

app.get('/newUser', (req, res) => {
    res.render('newUser.ejs');
})

app.post('/createUser', async (req, res) => {
    let username = req.body.username;
    let password = req.body.password;

    let createUserSql = `INSERT INTO Users (username, Password)
               VALUES (?, ?)`;

    let hashedPassword = await bcrypt.hash(password,10);

    let params = [username, hashedPassword];

    const [rows] = await pool.query(createUserSql, params);

    res.redirect('/');
});

app.get('/quotesList', isUserAuthenticated, async (req, res) => {
    let query = 'SELECT * FROM quotes';
    const [rows] = await pool.query(query);
    res.render('quotes.ejs', {quotes: rows});
})

app.get('/logOut', isUserAuthenticated, async (req,res) => {
    req.session.destroy(callBack => {
        res.redirect('/')
    });
})

app.get("/dbTest", async(req, res) => {
  try {
        const [rows] = await pool.query("SELECT CURDATE()");
        res.send(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Database error!");
    }
});




app.post('/teams/new', async (req, res) => {
    if (!req.session.userId)
        return res.redirect('/login');
    const name = (req.body.teamName || 'New Team').trim().slice(0, 32);
    const [result] = await pool.query('INSERT INTO Teams (UserID, TeamName) VALUES (?, ?)', [req.session.userId, name]);
    res.redirect(`/teambuilder/${result.insertId}`);
});

app.post('/teams/:teamId/rename', async (req, res) => {
    if (!req.session.userId)
        return res.redirect('/login');
    const name = req.body.teamName.trim().slice(0, 32);
    await pool.query('UPDATE Teams SET TeamName = ? WHERE TeamID = ? AND UserID = ?', [name, req.params.teamId, req.session.userId]);
    res.redirect('/account');
});

app.post('/teams/:teamId/delete', async (req, res) => {
    if (!req.session.userId)
        return res.redirect('/login');
    await pool.query('DELETE FROM Teams WHERE TeamID = ? AND UserID = ?', [req.params.teamId, req.session.userId]);
    res.redirect('/account');
});



async function showAccount(req, res, userId) {
    const [users] = await pool.query('SELECT UserID, username FROM Users WHERE UserID = ?', [userId]);
    if (users.length === 0) return res.status(404).send('Account not found');
    const user = users[0];
    const [teams] = await pool.query('SELECT * FROM Teams WHERE UserID = ? ORDER BY DateCreated DESC', [userId]);

    let userPokemon = [];
    if (teams.length > 0) {
        try {
            [userPokemon] = await pool.query(
                'SELECT * FROM TeamPokemon WHERE TeamID IN (?) ORDER BY Slot',
                [teams.map(t => t.TeamID)]);
        } catch (err) {
            if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
        }
    }
    for (const team of teams) {
        team.pokemon = userPokemon.filter(m => m.TeamID === team.TeamID);
    }

    res.render('account', {
        user,
        teams,
        isOwner: Number(req.session.userId) === user.UserID
    });
}

app.get('/account', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    await showAccount(req, res, req.session.userId);
});

app.get('/account/:userId', async (req, res) => {
    await showAccount(req, res, req.params.userId);
});



app.get('/items', async (req, res) => {
    if (!holdableItems) {
        const attr = await P.getItemAttributeByName('holdable');
        holdableItems = attr.items.map(i => i.name).sort();
    }

    const search = (req.query.search || '').trim().toLowerCase();
    let names = holdableItems;
    if (search) names = names.filter(n => n.includes(search.replace(/\s+/g, '-')));

    const perPage = 24;
    const pages = Math.max(1, Math.ceil(names.length / perPage));
    const page = Math.min(Math.max(1, Number(req.query.page) || 1), pages);
    const pageNames = names.slice((page - 1) * perPage, page * perPage);

    const details = await P.getItemByName(pageNames);
    const items = details.map(d => ({
        id: d.id,
        name: d.names.find(n => n.language.name === 'en')?.name || d.name,
        img: d.sprites.default,
        desc: d.effect_entries.find(e => e.language.name === 'en')?.short_effect || ''
    }));

    const teamId = req.query.teamId;
    const slot = req.query.slot;

    res.render('items', { items, page, pages, search, teamId, slot });
});

app.post('/items/select', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const { teamId, slot, itemId } = req.body;
    await pool.query(
        `UPDATE TeamPokemon tp JOIN Teams t ON t.TeamID = tp.TeamID
            SET tp.Item = ?
          WHERE tp.TeamID = ? AND tp.Slot = ? AND t.UserID = ?`,
        [itemId, teamId, slot, req.session.userId]
    );
    res.redirect(`/teambuilder/${teamId}`);
});


app.listen(3000, ()=>{
    console.log("Express server running on http://localhost:3000")
});

function isUserAuthenticated(req, res, next){
    if (req.session.authenticated){
        next();
    } else {
        res.redirect('/login')
    }
}