var express = require('express'),
    app = express(),
    path = require('path'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    Twitter = require('twitter'),
    twitter = new Twitter({
        consumer_key: "",
        consumer_secret: "",
        access_token_key: "",
        access_token_secret: ""
    });

var watson = require('watson-developer-cloud');
var personality_insights = watson.personality_insights({
  username: '5e24dac8-ac8b-4204-820d-11d90c0bce2e',
  password: 'rbsjL2ifkw0F',
  version: 'v2'
});    

var routes = require('./routes/index');
var users = require('./routes/users');

// var my_profile : input text to analyze personality here
var my_profile = "Call me Ishmael. Some years ago-never mind how long precisely-having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off-then, I account it high time to get to sea as soon as I can.";


// code for watson personality insights
personality_insights.profile({ text: my_profile },
function (err, profile) {
  if (err)
    console.log(err)
  else
    console.log(profile);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

//twitter callback function
function getTweets(twitterId, callback) {
    var params = {
            screen_name: twitterId,
            count: 200,
            trim_user: true,
            contributor_details: false
        };
        tweets = [];

    twitter.getUserTimeline(params, function (data) {
        _.each(data, function (tweet) {
            if (tweet) {
                tweets.push(tweet.text);
            }
            else {
                console.log(data);
            }

        });

        callback(null, tweets);
    });
}

function getValues(personality) {
    var values = [];
    console.log(personality);
    _.each(personality.tree.children, function (child) {
        _.each(child.children, function (child) {
            if (child.percentage) {
                values.push({
                    name: child.name,
                    percentage: Math.floor(child.percentage * 100)
                });
            }
            _.each(child.children, function (child) {
                if (child.percentage) {
                    values.push({
                        name: child.name,
                        percentage: Math.floor(child.percentage * 100)
                    });
                }
            });
        });
    });

    values = _.sortBy(values, function (value){
        return value.percentage;
    });
    values = values.reverse();

    values = _.uniq(values, function(item, key, name) {
        return item.name;
    });

    return values;
}

function getPersonality(tweets, callback) {
    restler.post(watsonUrl() + "api/v2/profile", {
        headers: {
            "Content-Type": "application/json"
        },
        data: JSON.stringify(buildContent(tweets)),
        username: watsonUsername(),
        password: watsonPassword()
    }).on("complete", function (data) {
        callback(null, data);
    }).on("error", function (error) {
        console.log(error);
        callback(error);
    });
}
//get top 5 personality entries derived from twitter
function getTop5Entries(values) {
    var top5 = [];
    for (var i = 0; i < 5; i++) {
        top5.push(values[i]);
    }
    return top5;
}
// compare twitter user personalities
function compareValues(user1, user2) {
    var inCommon = 0,
        top5User1 = getTop5Entries(user1),
        top5User2 = getTop5Entries(user2),
        i,
        value;

    for (i = 0; i < 5; i++) {
        if (_.where(top5User2, {name: top5User1[i].name}).length > 0) {
            inCommon++;
        }
    }
    return inCommon;
}

function analyzePeeps(twitterId1, twitterId2, callback) {
    var tweetsUser1 = [],
        tweetsUser2 = [],
        personalityUser1 = {},
        personalityUser2 = {},
        valuesUser1,
        user1 = {},
        user2 = {},
        valuesUser2,
        inCommon;

    async.waterfall(
    [
        function (next) {
            getUser(twitterId1, next);
        },
        function (user, next) {
            user1 = user;
            getUser(twitterId2, next);
        },
        function (user, next) {
            user2 = user;
            console.log("Getting tweets for", twitterId1);
            getTweets(twitterId1, next);
        },
        function (results, next) {
            tweetsUser1 = results;

            console.log("Got tweets for", twitterId1);
            console.log("Getting tweets for", twitterId2);
            getTweets(twitterId2, next);
        },
        function (results, next) {
            var tweets = [];
            tweetsUser2 = results;
            console.log("Got tweets for", twitterId2);

            console.log("Using Watson to analyze personality for", twitterId1);
            getPersonality(tweetsUser1, next);
        },
        function (traits, next) {
            personalityUser1 = traits;
            console.log("Finished analyzing personality for", twitterId1);
            console.log("Using Watson to analyze personality for", twitterId2);
            checkWatsonResults(personalityUser1, next);
        },
        function (next) {
            getPersonality(tweetsUser2, next);
        },
        function (traits, next) {
            personalityUser2 = traits;
            console.log("Finished analyzing personality for", twitterId2);
            checkWatsonResults(personalityUser2, next);
        },
        function (next) {
            valuesUser1 = getValues(personalityUser1);
            valuesUser2 = getValues(personalityUser2);
            console.log("Comparing", twitterId1, "to", twitterId2);
            inCommon = compareValues(valuesUser1, valuesUser2);
            console.log("Top 5 Traits in Common between", twitterId1, "and", twitterId2, "is", inCommon);
            next(null, inCommon, valuesUser1, valuesUser2);
        }
    ], callback
    );
}

app.post("/submit", function (request, response) {
    var user1 = request.body.user1.replace("@", ""),
        user2 = request.body.user2.replace("@", "");

    analyzePeeps(user1, user2, function(error, inCommon, valuesUser1, valuesUser2) {
        if (error) {
            response.status(404).send({
                message: error.message
            });
            return;
        }
        else {
            response.send({
                inCommon: inCommon,
                valuesUser1: valuesUser1,
                valuesUser2: valuesUser2
            })
        }
    });
});


module.exports = app;


