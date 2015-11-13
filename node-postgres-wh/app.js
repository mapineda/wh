var express = require('express'),
    app = express(),
    path = require('path'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    restler = require('restler'),
    async = require('async'),
    Twitter = require('twitter'),
    twitter = new Twitter({
        consumer_key: "47lClo1iUlWNjUw244sv2NKqn",
        Twitter_CON_SEC: "",
        Twitter_ACS_TOK: "",
        Twitter_ACS_TOK_KEY: ""
    });

var watson = require('watson-developer-cloud');
var personality_insights = watson.personality_insights({
  username: '5e24dac8-ac8b-4204-820d-11d90c0bce2e',
  password: 'rbsjL2ifkw0F',
  version: 'v2'
});    

var about = require('./routes/about');
var features = require('./routes/features');
var routes = require('./routes/index');
var users = require('./routes/users');

// var my_profile : input text to analyze personality here
// var my_profile = "Call me Ishmael. Some years ago-never mind how long precisely-having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off-then, I account it high time to get to sea as soon as I can.";


// code for watson personality insights
// personality_insights.profile({ text: my_profile },
// function (err, profile) {
//   if (err)
//     console.log(err)
//   else
//     console.log(profile);
// });

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

app.use('/about', about);
app.use('/features', features);
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
function merge(defaults, options) {
    defaults = defaults || {};
    if (options && typeof options === 'object') {
        var keys = Object.keys(options);
        for (var i = 0, len = keys.length; i < len; i++) {
            var k = keys[i];
            if (options[k] !== undefined) defaults[k] = options[k];
        }
    }
    return defaults;
}
//get tweets
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

function forwardError (next) {
    return function () {
        var parameters = Array.prototype.slice.call(arguments);

        parameters.unshift(null);
        return next.apply(null, parameters);
    };
}

function getEnv(service, variable) {
    var VCAP_SERVICES = process.env["VCAP_SERVICES"],
        services = JSON.parse(VCAP_SERVICES);

    return services[service][0].credentials[variable];
}

function watsonUrl() {
    return getEnv("user_modeling", "url");
}

function watsonUsername() {
    return getEnv("user_modeling", "username");
}

function watsonPassword() {
    return getEnv("user_modeling", "password");
}

function getUser(twitterId, callback) {
    async.waterfall(
    [
        function (next) {
            twitter.searchUser("@" + twitterId, forwardError(next));
        },
        function (response, heads, next) {
            //this is an error, the twitter library doesnt follow callbacks correctly
            if (response.statusCode) {
                next(new Error("Problem communicating with Twitter, check your Twitter API keys"));
                return;
            }
            next(null, {
                id: response[0].id,
                handle: response[0].screen_name,
                profileImage: response[0].profile_image_url_https
            });
        }
    ], callback);
}

function buildContent(tweets) {
    var content = {
        "contentItems": [
            {
                "userid": uuid.v1().toString(),
                "id": uuid.v1().toString(),
                "sourceid": "twitter",
                "contenttype": "application/json",
                "language": "en",
                "content": JSON.stringify(tweets)
            }
        ]
    };

    return content;
}

function checkWatsonResults(result, callback) {
    if (result.error_code) {
        callback(new Error(result.user_message));
    }
    else {
        callback();
    }
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

function getTop5Entries(values) {
    var top5 = [];
    for (var i = 0; i < 5; i++) {
        top5.push(values[i]);
    }
    return top5;
}

function compareValues(user1, user2) {
    var inCommon = 0,
        top5Employee1 = getTop5Entries(employee1),
        top5Employee2 = getTop5Entries(employee2),
        i,
        value;

    for (i = 0; i < 5; i++) {
        if (_.where(top5Employee2, {name: top5Employee1[i].name}).length > 0) {
            inCommon++;
        }
    }
    return inCommon;
}

function analyzePeeps(twitterId1, twitterId2, callback) {
    var tweetsEmployee1 = [],
        tweetsEmployee2 = [],
        personalityEmployee1 = {},
        personalityEmployee2 = {},
        valuesEmployee1,
        employee1 = {},
        employee2 = {},
        valuesEmployee2,
        inCommon;

    async.waterfall(
    [
        function (next) {
            getUser(twitterId1, next);
        },
        function (user, next) {
            employee1 = user;
            getUser(twitterId2, next);
        },
        function (user, next) {
            employee2 = user;
            console.log("Getting tweets for", twitterId1);
            getTweets(twitterId1, next);
        },
        function (results, next) {
            tweetsEmployee1 = results;

            console.log("Got tweets for", twitterId1);
            console.log("Getting tweets for", twitterId2);
            getTweets(twitterId2, next);
        },
        function (results, next) {
            var tweets = [];
            tweetsEmployee2 = results;
            console.log("Got tweets for", twitterId2);

            console.log("Using Watson to analyze personality for", twitterId1);
            getPersonality(tweetsEmployee1, next);
        },
        function (traits, next) {
            personalityEmployee1 = traits;
            console.log("Finished analyzing personality for", twitterId1);
            console.log("Using Watson to analyze personality for", twitterId2);
            checkWatsonResults(personalityEmployee1, next);
        },
        function (next) {
            getPersonality(tweetsEmployee2, next);
        },
        function (traits, next) {
            personalityEmployee2 = traits;
            console.log("Finished analyzing personality for", twitterId2);
            checkWatsonResults(personalityEmployee2, next);
        },
        function (next) {
            valuesEmployee1 = getValues(personalityEmployee1);
            valuesEmployee2 = getValues(personalityEmployee2);
            console.log("Comparing", twitterId1, "to", twitterId2);
            inCommon = compareValues(valuesEmployee1, valuesEmployee2);
            console.log("Top 5 Traits in Common between", twitterId1, "and", twitterId2, "is", inCommon);
            next(null, inCommon, valuesEmployee1, valuesEmployee2);
        }
    ], callback
    );
}

app.post("/submit", function (request, response) {
    var employee1 = request.body.employee1.replace("@", ""),
        employee2 = request.body.employee2.replace("@", "");

    analyzePeeps(employee1, employee2, function(error, inCommon, valuesEmployee1, valuesEmployee2) {
        if (error) {
            response.status(404).send({
                message: error.message
            });
            return;
        }
        else {
            response.send({
                inCommon: inCommon,
                valuesEmployee1: valuesEmployee1,
                valuesEmployee2: valuesEmployee2
            })
        }
    });
});


module.exports = app;


