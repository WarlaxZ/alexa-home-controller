'use strict';

const _ = require('lodash');
const Alexa = require('alexa-app');
const Mopidy = require("mopidy");
const spawn = require('child_process').spawn;

var speaker_config = require('./speaker_config');

var mopidy = new Mopidy({
    webSocketUrl: "ws://localhost:6680/mopidy/ws",
    callingConvention: "by-position-or-by-name"
});


var app = new Alexa.app('mopidy');

app.launch(function(req, res) {
    var prompt = 'To control mopidy, give me a command';
    res.say(prompt).reprompt(prompt).shouldEndSession(false);
});

app.intent('stopMusic', {
    'slots': {},
    'utterances': ['{stop|shut up|shutup|end|finish}{ the music| music| playing| play back| playback|}']
}, function(req, res) {
    stopAndClear();
    res.send();
});

app.intent('pauseResume', {
    'slots': {},
    'utterances': ['{pause|resume}{ the music| music| playing| play back| playback|}']
}, function(req, res) {
    mopidy.playback.getState({}).then(function(data){
        if (data == "playing") {
            mopidy.playback.pause();
        } else {
            mopidy.playback.resume();
        }
    });
});

app.intent('volumeControl', {
    'slots': {
        'VOLUME': 'NUMBER'
    },
    'utterances': ['{|turn |set }volume {to|at|to be} {-|VOLUME}']
}, function(req, res) {
    var volume = req.slot('VOLUME', 100);
    mopidy.mixer.setVolume({"volume":(parseInt(volume, 10)*10)});
});

app.intent('speakerControl', {
    'slots': {
        'SPEAKER': 'SPEAKER'
    },
    'utterances': ['use {the |}{-|SPEAKER}{ speaker|}']
}, function(req, res) {
    var speaker = req.slot('SPEAKER', "");
    if (_.isEmpty(speaker)) {
        res.say("I didn't understand the speaker you are after").send();
        return;
    }
    spawn('/home/pi/moveSink.sh', [speaker_config.speakers[speaker]]);
    res.say("Changing speaker").send();
});

app.intent('playPlaylist', {
    'slots': {
        'PLAYLISTNAME': 'LITERAL'
    },
    'utterances': [
        '{play|put on|play me|listen to} {some music|music|something random|random|something}',
        '{play|put on|play me|listen to} {my |the |}{ashes tunes|dance|PLAYLISTNAME} playlist'
    ]
}, function(req, res) {
    var playlistName = req.slot('PLAYLISTNAME', undefined);
    loadByPlaylist(playlistName).then(function(potentialPlaylists) {
        if (potentialPlaylists === null) {
            if (playlistName === undefined) {
                res.say("Can't find any playlists").send();
            } else {
                res.say("Can't find any playlists containing the name " + playlistName).send();
            }
            return;
        }
        loadAndShuffle(potentialPlaylists, 1).then(function() {
            res.say("Playing playlist").send();
        });
    });
    return false;
});

app.intent('playMusic', {
    'slots': {
        'GENRE': 'GENRE',
        'TRACK': 'LITERAL',
        'ARTIST': 'LITERAL'
    },
    'utterances': [
        '{play|put on|play me|listen to} {some |}{-|GENRE}{| music}',
        '{play|put on|play me|listen to} {dirty love|wilkinson|andy c|rock it|call me maybe|TRACK}',
        '{play|put on|play me|listen to} {some |}{music by|something by|anything by} {wilkinson|andy c|shy fx|ARTIST}'
    ]
}, function(req, res) {
    var query;
    var searchBy = "any";

    if (!_.isEmpty(req.slot('TRACK', ""))) {
        query = req.slot('TRACK');
    }
    else if (!_.isEmpty(req.slot('ARTIST', ""))) {
        query = req.slot('ARTIST');
        searchBy = "artist";
    }
    else if (!_.isEmpty(req.slot('GENRE', ""))) {
        query = req.slot('GENRE');
        searchBy = "genre"
    }
    console.log("Asked for: %s", query);


    var data = {};
    data[searchBy] = [query];
    console.log(data);
    mopidy.library.search(data).then(function(data) {
        var urisToAdd = get_items_from_results(data, searchBy != "artist");
        loadAndShuffle(urisToAdd).then(function(result) {
            if (result === null) {
                res.say("Couldn't find anything matching the query: " + query).send();
            } else {
                res.say("Putting on: " + query).send();
            }
        });
    });
    return false;
});


function loadByPlaylist(playlistName) {
    return new Promise(function (resolve) {
        mopidy.playlists.asList().then(function(data) {
            var potentialPlaylists = [];
            for (var index in data) {
                var item = data[index];
                if (playlistName === undefined || item.name.toLowerCase().indexOf(playlistName.toLowerCase()) !== -1) {
                    potentialPlaylists.push(item.uri);
                }
            }
            if (potentialPlaylists.length === 0) {
                resolve(null);
                return;
            }
            resolve(potentialPlaylists);
        });
    });
}

function stopAndClear() {
    return new Promise(function (resolve) {
        mopidy.playback.stop({}).then(function() {
            mopidy.tracklist.clear().then(function() {
                resolve();
            });
        });
    });
};

function loadAndShuffle(urisToAdd, limit) {
    return new Promise(function (resolve) {
        if (urisToAdd ===  null) {
            resolve(null);
            return;
        }
        if (limit === undefined) {
            limit = 5000;
        }
        urisToAdd = shuffle(urisToAdd).slice(0, limit);
        stopAndClear().then(function() {
            mopidy.tracklist.clear().then(function() {
                mopidy.tracklist.add({"uris": urisToAdd}).then(function() {
                    mopidy.tracklist.shuffle().then(function(){
                        mopidy.playback.play().then(function(){
                            resolve(urisToAdd);
                        });
                    });
                });
            });
        });
    });
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function get_items_from_results(result, force_spotify_tracks) {
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
                    if (!force_spotify_tracks || (force_spotify_tracks && item.uri.startsWith("spotify:track"))) { //Force spotify tracks only
                        urisToAdd.push(item.uri);
                    }
                } catch (err) {
                    //Ignore this item
                }
            }
        }
    }
    return urisToAdd;
}

module.change_code = 1;
module.exports = app;
