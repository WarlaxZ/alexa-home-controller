'use strict';

// https://github.com/PaulAvery/kodi-ws
// https://www.bignerdranch.com/blog/developing-alexa-skills-locally-with-nodejs-deploying-your-skill-to-staging/

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
const Promise = require('pinkie-promise');
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
var app = new Alexa.app('Home');

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
        if (result.length == 0) {
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

function getOptionsForTitle(itemTitle, tvOnly) {
    return new Promise(function (resolve) {
        trakt.search.text({
            query: itemTitle,
            type: tvOnly ? "show" : 'show,movie'
        })
        .then(response => {
            if (response.length == 0) {
                reject(null);
            }
            //Make the result slightly more precise
            var extraFilter = _.filter(response, function(item) {
                return item[item.type].title.indexOf(itemTitle) !== -1;
            });
            if (extraFilter.length !== 0) {
                response = extraFilter;
            }
            var showOrMovie = response[0].type;
            var item = response[0][showOrMovie];
            var options = {
                action: "play",
                type: showOrMovie,
                meta: "{}",
                title: item.title,
                imdb: item.ids.imdb,
                //tvdb: item.ids.tvdb,
                year: "" + item.year,
                //premiered: "1989" //item.year,
                select: "2"
            };
            if (showOrMovie == "show") {
                options.tvshowtitle = options.title;
            }
            return resolve(options);
        });
    });
}


app.intent('playFilm', {
    'slots': {
        'FILMNAME': 'LITERAL'
    },
    'utterances': ['{play|put on|watch|start playing|start} {rocky|the wolf of wallstreet|fight club|FILMNAME}']
}, function(req, res) {
    var itemTitle = req.slot('FILMNAME');
    getOptionsForTitle(itemTitle, false).then(function(options) {
        if (options === null) {
            console.log(err);
            res.say("Unable to find anything by the name " + itemTitle).send();
            return true;
        }
        kodi(kodiHost, kodiPort).then(function(connection) {
            if (options.type == "show") {
                options.tvshowtitle = options.title;
                options.season = "1";
                options.episode = "1";
            }
            console.log(options);
            //TODO - if tv show, identify if already watching, and continue from where left off
            connection.Addons.ExecuteAddon("plugin.video.exodus", options).then(function(response) {
                console.log(response);
                return true;
            });
        });
    });
    return false;
});


app.intent('playEpisodeKodi', {
    'slots': {
        'SHOWNAME': 'LITERAL',
        'SEASON': 'NUMBER',
        'EPISODE': 'NUMBER'
    },
    'utterances': ['{play|put on|watch|start playing|start|start watching} season {1|2|3|one|two|three|SEASON} episode {1|2|3|one|two|three|EPISODE} of {below deck|fairy tale|ghost in the shell|lost|SHOWNAME}']
}, function(req, res) {
    var itemTitle = req.slot('SHOWNAME');
    getOptionsForTitle(itemTitle, false).then(function(options) {
        kodi(kodiHost, kodiPort).then(function(connection) {
            //options.tvshowtitle = options.title;
            options.season = req.slot('SEASON');
            options.episode = req.slot('EPISODE');
            console.log(options);
            connection.Addons.ExecuteAddon("plugin.video.exodus", options).then(function(response) {
                console.log(response);
                return true;
            });
            return true;
        });
    });
    return false;
});

app.intent('continueWatchingKodi', {
    'slots': {
        'SHOWNAME': 'LITERAL'
    },
    'utterances': ['{continue|continue watching|play|put on|watch|start playing|start|start watching} {the |} next {below deck|fairy tale|ghost in the shell|lost|SHOWNAME}']
}, function(req, res) {
    var itemTitle = req.slot('SHOWNAME');
    trakt.search.text({
        query: itemTitle,
        type: 'show'
    })
    .then(response => {
        if (response.length == 0) {
            res.say("Unable to find a show by the name " + itemTitle).send();
            return true;
        }
        var item = response[0].show;
        var title = item.title;
        var year = item.year;
        var traktId = item.ids.trakt;
        var imdb = item.ids.imdb;
        var tvdb = item.ids.tvdb;
        trakt.shows.progress.watched({
            id: traktId,
            hidden: false,
            specials: false
        }).then(function (response) {
            var season = 1;
            var episode = 1;
            var episodetitle = "";
            if (response.hasOwnProperty("next_episode")) {
                season = response.next_episode.season;
                episode = response.next_episode.number;
                var episodetitle = response.next_episode.title;
                res.say("Next episode is season " + season + " episode " + episode + " titled: " + title).send();
            }
            kodi(kodiHost, kodiPort).then(function(connection) {
                var options = {
                    action: "play",
                    meta: "{}",
                    title: title,
                    tvshowtitle: episodetitle,
                    imdb: imdb,
                    tvdb: tvdb,
                    year: year.toString(),
                    premiered: year.toString(),
                    season: season,
                    episode: episode
                };
                console.log(options);
                connection.Addons.ExecuteAddon("plugin.video.exodus", options).then(function(response) {
                    console.log(response);
                    return true;
                });
            });

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
        return connection.Player.GetActivePlayers().then(function (players) {
            return Promise.all(players.map(function(player) {
                return connection.Player.PlayPause(player.playerid);
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
            return Promise.all(players.map(function(player) {
                return connection.Player.Stop(player.playerid);
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
