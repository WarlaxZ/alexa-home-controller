'use strict';

// https://github.com/PaulAvery/kodi-ws
// https://www.bignerdranch.com/blog/developing-alexa-skills-locally-with-nodejs-deploying-your-skill-to-staging/
//
// NOTE TO SELF - Have made custom slots for: MOVIE, TVSHOW, SHOWORMOVIE

const _ = require('lodash');
const Alexa = require('alexa-app');
const kodi = require('kodi-ws');
const Mopidy = require("mopidy");
const imdb = require('imdb-api');
const fs = require('fs');
const Trakt = require('trakt.tv');
const trakt = new Trakt({
    client_id: 'ee617ec8c3809c3629fa7b87e2106d4b93273bf44cd4fe00f7d5eb1008f629f9',
    client_secret: '91b0fe3eda36eb8f2caf131fd4184b2f81025409c5badb3c41eae293ddf36266',
    plugins: ['ondeck']
});
const tokenCacheFile = "trakt-token-cache.json";

fs.access(tokenCacheFile, fs.F_OK, function(err) {
    if (!err) {
        loadToken();
    } else {
        trakt.get_codes().then(poll => {
            //console.log(poll);
            console.log("Go to: " + poll.verification_url);
            console.log("And enter this verification code: " + poll.user_code);
            return trakt.poll_access(poll).then(storeToken);
        });
    }
});

function storeToken() {
    var token = trakt.export_token();
    console.log(token);
    var fs = require('fs');
    fs.writeFile(tokenCacheFile, JSON.stringify(token));
}

function loadToken() {
    fs.readFile(tokenCacheFile, function(err, contents) {
        trakt.import_token(JSON.parse(contents));
        storeToken();
    });
}

const kodiHost = "localhost";
const kodiPort = 9090;

//var mopidy = new Mopidy({ webSocketUrl: "ws://localhost:6680/mopidy/ws"});
var mopidy = {}; // TEMP DISABLED
var app = new Alexa.app('home');

app.launch(function(req, res) {
    var prompt = 'To control your home, give me a command';
    res.say(prompt).reprompt(prompt).shouldEndSession(false);
});

app.intent('playRandom', {
    'slots': {},
    'utterances': ['{play|put on|play me|listen to} {some |}music']
}, function(req, res) {
    res.say("Playing some music").send();
    return false;
});

app.intent('playPlaylist', {
    'slots': {
        'PLAYLISTNAME': 'LITERAL'
    },
    'utterances': ['{play|put on|play me|listen to} {my |the |}{ashes tunes|dance|PLAYLISTNAME} playlist']
}, function(req, res) {
    var playlistName = req.slot('PLAYLISTNAME');
    var reprompt = 'Tell me the playlist name you want to play.';
    if (_.isEmpty(playlistName)) {
        var prompt = 'I didn\'t hear a playlist name, please tell me one.';
        res.say(prompt).reprompt(reprompt).shouldEndSession(false);
        return true;
    } else {
        res.say("Playing playlist").send();
        return false;
    }
});

app.intent('playGenre', {
    'slots': {
        'GENRE': 'LITERAL'
    },
    'utterances': ['{play|put on|play me|listen to} {some |}{house|dance|drum and bass|piano|chill|chill out|reggae|GENRE}{| music}']
}, function(req, res) {
    var genre = req.slot('GENRE');
    var reprompt = 'Tell me the genre you want to play.';
    if (_.isEmpty(genre)) {
        var prompt = 'I didn\'t hear a genre name, please tell me one.';
        res.say(prompt).reprompt(reprompt).shouldEndSession(false);
        return true;
    } else {
        mopidy.library.search({"genre": [genre]}).then(function(data) { //, "uris": ["spotify:"]
            var urisToAdd = get_items_from_results(data);
            if (urisToAdd ===  null) {
                res.say("Nothing found matching query!").send();
                return true;
            }
            //Note working up until this point, but the js library is shit and cant handle multiple urls
            mopidy.tracklist.add({"uris":urisToAdd}).then(function(data) {
                mopidy.tracklist.shuffle().then(function(data){
                    mopidy.playback.play().then(function(data){
                        res.say("Playing genre " + genre).send();
                        return true;
                    });
                });
            });
        });
        return false; //False means async function, ie some talking will happen in the promise return
    }
});

function get_items_from_results(data) {
        var result = data;
        if (result.length === 0) {
            return null;
        }

        var urisToAdd = [];
        for (var searchResultTypeIndex in result) {
            var searchResultType = result[searchResultTypeIndex];
            for (var resultKey in searchResultType) {
                if (resultKey.startsWith("_") || resultKey === "uri") {
                    continue;
                }
                for (var index in searchResultType[resultKey]) {
                    var item = searchResultType[resultKey][index];
                    try {
                        urisToAdd.push(item.uri);
                    } catch (err) {
                        //Ignore this item
                    }
                }
            }
        }
        return urisToAdd;
}


/////// KODI /////////////////////////////////

function getOptionsForTitle(req) {
    var type = 'show,movie';
    var season = 1;
    var episode = 1;
    var itemTitle;
    if (!_.isEmpty(req.slot('SHOWORMOVIE', "")))
        itemTitle = req.slot('SHOWORMOVIE');
    else if (!_.isEmpty(req.slot('TVSHOW', "")))
        itemTitle = req.slot('TVSHOW');
    else if (!_.isEmpty(req.slot('MOVIE', "")))
        itemTitle = req.slot('MOVIE');
    console.log(req.slot('SHOWORMOVIE', ""));
    console.log(req.slot('TVSHOW', ""));
    console.log(req.slot('MOVIE', ""));
    console.log("Asked for title: %s", itemTitle);
    if (!_.isEmpty(req.slot('TVSHOW', ""))) {
        type = "show";
    }
    if (!_.isEmpty(req.slot('MOVIE', ""))) {
        type = "movie";
    }
    if (!_.isEmpty(req.slot('SEASON', ""))) {
        season = req.slot('SEASON');
        type = "show";
    }
    if (!_.isEmpty(req.slot('EPISODE', ""))) {
        episode = req.slot('EPISODE');
        type = "show";
    }
    return new Promise(function (resolve) {
        trakt.search.text({
            query: itemTitle,
            type: type
        })
        .then(response => {
            if (response === null || response.length === 0) {
                console.log(response);
                resolve(itemTitle);
            }
            console.log("Trakt Responses:");
            console.log(response);
            //Make the result slightly more precise
            var extraFilter = _.filter(response, function(item) {
                return item[item.type].ids.imdb !== null && item[item.type].title.toLowerCase().indexOf(itemTitle.toLowerCase()) !== -1;
            });
            if (extraFilter.length !== 0) {
                response = extraFilter;
            }
            var showOrMovie = response[0].type;
            var item = response[0][showOrMovie];
            var imdbId = item.ids.imdb;
            //For some reason trakt doesn't always return a imdb, this breaks exodus
            if (imdbId === null) {
                imdbId = new Promise(function (resolve) {
                    imdb.get(item.title, function(err, things) {
                        resolve(things.imdbid);
                    });
                });
            } else {
                imdbId = new Promise(function (resolve) {
                     resolve(imdbId);
                });
            }
            imdbId.then(function(imdbId) {
                console.log("Trakt Response:");
                console.log(response[0]);
                var options = {
                    action: "play",
                    type: showOrMovie,
                    meta: "{}",
                    title: item.title,
                    imdb: imdbId,
                    //tvdb: item.ids.tvdb,
                    year: "" + item.year,
                    //premiered: "" + item.year,
                    select: "2"
                };
                if (showOrMovie == "show") {
                    options.tvshowtitle = options.title;

                    if (_.isEmpty(req.slot('SEASON')) && _.isEmpty(req.slot('EPISODE'))) {
                        trakt.shows.progress.watched({
                            id: item.ids.trakt,
                            hidden: false,
                            specials: false
                        }).then(function (response) {
                            var episodetitle = "";
                            if (response.hasOwnProperty("next_episode")) {
                                console.log("Next episode:");
                                console.log(response.next_episode);
                                if (_.isEmpty(req.slot('EPISODE', ""))) {
                                    episode = response.next_episode.number;
                                }
                                if (_.isEmpty(req.slot('SEASON', ""))) {
                                    season = response.next_episode.season;
                                }
                                //episodetitle = response.next_episode.title;
                                //res.say("Next episode is season " + season + " episode " + episode + " titled: " + title).send();
                            }
                            if (!_.isEmpty(req.slot('SEASON', ""))) {
                                season = req.slot('SEASON');
                            }
                            if (!_.isEmpty(req.slot('EPISODE', ""))) {
                                episode = req.slot('EPISODE');
                            }
                            options.season = "" + season;
                            options.episode = "" + episode;
                            return resolve(options);
                        });
                    } else {
                        options.season = season;
                        options.episode = episode;
                        return resolve(options);
                    }
                } else {
                    return resolve(options);
                }
            });
        });
    });
}


app.intent('playKodi', {
    'slots': {
        'MOVIE': 'MOVIE',
        'TVSHOW': 'TVSHOW',
        'SHOWORMOVIE': 'SHOWORMOVIE',
        'SEASON': 'AMAZON.NUMBER',
        'EPISODE': 'AMAZON.NUMBER'
    },
    'utterances': [
        '{play|put on|watch|start playing|start|start watching} the {film|movie} {-|MOVIE}',
        '{play|put on|watch|start playing|start|start watching} {-|MOVIE} {film|movie}',
        '{play|put on|watch|start playing|start|start watching} {-|SHOWORMOVIE}',
        '{play|put on|watch|start playing|start|start watching} season {-|SEASON} of {-|TVSHOW}',
        '{play|put on|watch|start playing|start|start watching} episode {-|EPISODE} of {-|TVSHOW}',
        '{play|put on|watch|start playing|start|start watching} season {-|SEASON} episode {-|EPISODE} of {-|TVSHOW}',
        '{continue|continue watching|play|put on|watch|start playing|start|start watching} {the |} next{ episode|} {-|TVSHOW}'
    ]
}, function(req, res) {
    getOptionsForTitle(req).then(function(options) {
        if (typeof(options) == "string") {
            res.say("Unable to find anything by the name " + options).send();
            return true;
        }
        console.log(options);
        kodi(kodiHost, kodiPort).then(function(connection) {
            connection.Addons.ExecuteAddon("plugin.video.exodus", options).then(function(response) {
                console.log(response);
                res.say("Putting on " + options.title).send();
                return true;
            });
            return true;
        });
    });
    return false;
});


//TODO - combine these 3 with a custom slot
app.intent('popularKodi', {
    'slots': {},
    'utterances': ['{show me|pull up|display|load|on screen|show} {what\'s|what is|what} popular']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Addons.ExecuteAddon("plugin.video.exodus", {"action": "movies", "url": "popular"}).then(function(response) {
            res.say("Pulling up whats popular").send();
            return true;
        });
    });
    return false;
});

app.intent('trendingKodi', {
    'slots': {},
    'utterances': ['{show me|pull up|display|load|on screen|show} {what\'s|what is|what} trending']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Addons.ExecuteAddon("plugin.video.exodus", {"action": "movies", "url": "trending"}).then(function(response) {
            res.say("Pulling up whats trending").send();
            return true;
        });
    });
    return false;
});

app.intent('featuredKodi', {
    'slots': {},
    'utterances': ['{show me|pull up|display|load|on screen|show} {what\'s|what is|what} featured']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Addons.ExecuteAddon("plugin.video.exodus", {"action": "movies", "url": "featured"}).then(function(response) {
            res.say("Pulling up whats featured").send();
            return true;
        });
    });
    return false;
});


app.intent('muteKodi', {
    'slots': {},
    'utterances': ['{mute|silence|quiet}{ kodi| tv| movie| show|}']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Application.SetMute(true);
    });
});

app.intent('unmuteKodi', {
    'slots': {},
    'utterances': ['{unmute|noise|make noise|sound}{ kodi| tv| movie| show|}']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Application.SetMute(false);
    });
});

app.intent('pauseResume', {
    'slots': {},
    'utterances': ['{pause|unpause|resume}{ kodi| tv| movie| show| playback|}']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        connection.Player.GetActivePlayers().then(function (players) {
            Promise.all(players.map(function(player) {
                connection.Player.PlayPause(player.playerid);
            }));
        });
    });
});

app.intent('stop', {
    'slots': {},
    'utterances': ['stop{ kodi| tv| movie| show| playback|}']
}, function(req, res) {
    kodi(kodiHost, kodiPort).then(function(connection) {
        return connection.Player.GetActivePlayers().then(function (players) {
            connection.GUI.ActivateWindow("home");
            return Promise.all(players.map(function(player) {
                connection.Player.Stop(player.playerid);
            }));
        });
    });
});


//hack to support custom utterances in utterance expansion string
//var utterancesMethod = app.utterances;
//app.utterances = function() {
//    return utterancesMethod().replace(/\{\-\|/g, '{');
//};

module.change_code = 1;
module.exports = app;
