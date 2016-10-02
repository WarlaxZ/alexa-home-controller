'use strict';
const fs = require('fs');
const Trakt = require('trakt.tv');
const trakt = new Trakt({
    client_id: 'ee617ec8c3809c3629fa7b87e2106d4b93273bf44cd4fe00f7d5eb1008f629f9',
    client_secret: '91b0fe3eda36eb8f2caf131fd4184b2f81025409c5badb3c41eae293ddf36266',
    plugins: ['ondeck']
});
const tokenCacheFile = "trakt-token-cache.json";

const Promise = require('pinkie-promise');

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

function getOptionsForTitle(itemTitle) {
    return new Promise(function (resolve) {
        trakt.search.text({
            query: itemTitle,
            type: 'show'
        })
        .then(response => {
            if (response.length == 0) {
                reject(null);
            }
            console.log(response[0]);
            var item = response[0].show;
            return resolve({
                action: "play",
                meta: "{}",
                title: item.title,
                imdb: item.ids.imdb,
                tvdb: item.ids.tvdb,
                year: item.year,
                premiered: item.year
            });
        });
    });
}

function storeToken() {
    var token = trakt.export_token();
    console.log(token);
    var fs = require('fs');
    fs.writeFile(tokenCacheFile, JSON.stringify(token));
    main();
}

function loadToken() {
    fs.readFile(tokenCacheFile, function(err, contents) {
        trakt.import_token(JSON.parse(contents));
        storeToken();
    });
}

function main() {
    getOptionsForTitle("ghost in the shell").then(function(options) {
        console.log(options);
    });
    /*
    trakt.ondeck.getAll().then(function (results) {
//        console.log(JSON.stringify(results));
    });

    trakt.search.text({
        query: 'Below Deck',
        type: 'movie,show'
    })
    .then(response => {
        //console.log(JSON.stringify(response));
        // Contains Array[] response from API (search data) 
    });
    trakt.shows.progress.watched({
        //extended: 'full,images',
        id: 49722,
        hidden: false,
        specials: false
    }).then(function (response) {
        console.log(JSON.stringify(response));
    });
    */
}
