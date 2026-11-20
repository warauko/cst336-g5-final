import express from 'express';
import mysql from 'mysql2/promise';
import Pokedex from 'pokedex-promise-v2';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

//for Express to get values using the POST method
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




//routes
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
    console.log(rows);
    console.log(password);
    console.log(rows[0].Password);
    console.log(await bcrypt.compare(password, rows[0].Password));
    if (rows.length > 0 && await bcrypt.compare(password, rows[0].Password.trim())){

        req.session.authenticated = true;
        req.session.role ='admin';
        req.session.username = username;
    

        res.render('home.ejs');

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
    console.log(hashedPassword);

    let params = [username, hashedPassword];

    const [rows] = await pool.query(createUserSql, params);

    res.redirect('/');

});

app.get('/quotesList', isUserAuthenticated, async (req, res) => {


    let query = 'SELECT * FROM quotes';
    const [rows] = await pool.query(query);
    console.log(rows);
    
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
});//dbTest

app.listen(3000, ()=>{
    console.log("Express server running")
});

//middleware function that checks if you are authenticated

function isUserAuthenticated(req, res, next){
    if (req.session.authenticated){
        next();
    } else {
        res.redirect('/login')
    }
}


