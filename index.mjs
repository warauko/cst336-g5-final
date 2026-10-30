import express from 'express';
import mysql from 'mysql2/promise';
import Pokedex from 'pokedex-promise-v2';

const pool = mysql.createPool({
    host: "w1h4cr5sb73o944p.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
    user: "h0ffvyi59e6grrqe",
    password: "r6xaiabyag6shdly",
    database: "ganauoglop98hv4t",
    connectionLimit: 10,
    waitForConnections: true
});