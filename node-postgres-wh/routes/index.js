var express = require('express');
var router = express.Router();
//adding pg connects
// var pg = require('pg');
// var connectionString = require(path.join(__dirname, '../', '../', 'config'));

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Work Harmony' });
});

module.exports = router;
