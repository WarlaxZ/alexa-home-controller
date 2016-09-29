'use strict';

// https://github.com/PaulAvery/kodi-ws
// https://www.bignerdranch.com/blog/developing-alexa-skills-locally-with-nodejs-deploying-your-skill-to-staging/

const _ = require('lodash');
const Alexa = require('alexa-app');
const kodi = require('kodi-ws');
const Mopidy = require("mopidy");
const imdb = require('imdb-api');
const Trakt = require('trakt-api');

const kodiHost = "localhost";
const kodiPort = 9090;

var mopidy = new Mopidy({ webSocketUrl: "ws://localhost:6680/mopidy/ws"});
var app = new Alexa.app('Home');
var trakt = Trakt("ee617ec8c3809c3629fa7b87e2106d4b93273bf44cd4fe00f7d5eb1008f629f9");

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

app.intent('playFilm', {
    'slots': {
        'FILMNAME': 'LITERAL'
    },
    'utterances': ['{play|put on|watch|start playing|start} {rocky|the wolf of wallstreet|fight club|FILMNAME}']
}, function(req, res) {
    var itemTitle = req.slot('FILMNAME');
    console.log(itemTitle);
    imdb.getReq({ name: itemTitle }, function(err, item) {
        if (err !== undefined) {
            console.log(err);
            res.say("Unable to find a film by the name " + itemTitle).send();
            return true;
        }
        console.log(item);
        kodi(kodiHost, kodiPort).then(function(connection) {
            //plugin.video.exodus
            /*
            connection.Addons.GetAddons().then(function(addonsObject) {
                for (var index in addonsObject.addons) {
                    var addon = addonsObject.addons[index];
                    console.log(addon);
                }
            });
            */
            var options = {
                action: "play"
            };
            options.meta = "{}";
            options.title = item.title;
            options.imdb = item.imdburl;
            if (item.episodes) { //TV
                options.tvshowtitle = item.title;
                options.year = item._year_data.substring(0,4);
                options.premiered = item._year_data.substring(0,4);
                options.season = "1";
                options.episode = "1";
                //options.tvdb = "http://thetvdb.com/?id=75760&tab=series";
            } else { //Movie
                imdb: item.imdburl,
                options.title = item.title;
                options.year = item._year_data;
            }
            console.log(options);
            //TODO - if tv show, identify if already watching, and continue from where left off
            connection.Addons.ExecuteAddon("plugin.video.exodus", options).then(function(response) {
                console.log(response);
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
