var pg = require('pg');
var connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/wh';

var client = new pg.Client(connectionString);
client.connect();
var query = client.query('CREATE TABLE questions(id SERIAL PRIMARY KEY, string VARCHAR(500) not null, compelete BOOLEAN)');
query.on('end', function(){ client.end(); });