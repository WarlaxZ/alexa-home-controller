[![Build Status](https://travis-ci.org/WarlaxZ/alexa-home-controller.svg?branch=master)](https://travis-ci.org/WarlaxZ/alexa-home-controller)

# Alexa-Home-Controller
Control all items in my home from an Amazon Echo (Alexa)

- This is designed specifically to control exodus within kodi from alexa
- This is also designed to integrate with mopidy to control music, as its what I use in my home speaker system from my raspberry pi to control the whole house

FAQ
- Make sure you enable trakt in exodus
- Set up exodus to mark watched in trakt
- Upload the custom slots from apps/home
- Run the server (node server.js) and then hit http://localhost:8081/apps/home and copy the utterances and schema to alexa dev area
- Open a port on your router to the server, and set it up within alexa
- Tweak apps/home/index.js to point to your kodi if its not running on localhost


How to Run
- You need node installed
- Then run the following commands:
- npm install -g grunt
- grunt
- node server.js
- Then just ask alexa what ever you named your skill

Leave questions in the issues place and I'll update the readme :P
