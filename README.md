SoundCloud Playlister
=====================

created by Chris Nater
last edit: 9 Nov 2012


About
-----

SoundCloud Playlister is a web-app that allows Soundcloud ("SC") users to create, edit and manage simple playlists comprised of SC tracks, which can be played in succession in a playlist-like manner. It is written in Javascript ("JS") using Meteor 0.5.0 (http://www.meteor.com/) with the majority of functionality encapsulated in a client-side (browser-loaded) JS file ("playlister.js"), along with a minimal server-side JS file ("publisher.js") based on Node.js and MongoDB running the database backend. The app also uses a substantial amount of features from the SoundCloud API & SDK.

Please refer to SoundCloud Playlister's Github repository (https://github.com/chrisneuro/soundcloud-playlister/) for any further dissemination of functionality and assets.

This web-app was initially put together for the SoundCloud Web Dev challenge.


How to use
----------

Go to www.machinater.com/soundcloud-playlister/

*Using the app as Guest:*
The first time, you will be using the app as Guest. A Guest has all capabilites that a logged-in user has, but once the browser window is refreshed, all data will be lost because the session will be reset.

*Logging in:*
To be able to save any and all changes, you must log in via using your SC credentials by clicking the "Connect with SoundCloud" button in the upper right corner of the window. Now, everything under your authenticated SC username will be permanently stored.

*Logging out:*
Click the "Disconnect" button in the upper right corner of the window.

*Creating a playlist:*
Select the input field labelled "New playlist" and type in a name for your playlist. Then either click outside the input field or press Return. You cannot create a playlist with exactly the same name as an existing one. You also cannot create a playlist with more than 40 characters in its name.

*Editing a playlist's name:*
Double-click on a playlist's name. An input field with the current name will appear. When finished editing, either click outside the input field or press Return.

*Creating/editing a playlist's description:*
Similarly to a playlist's name creation, select the input field labelled "Description for [your playlist name]" and type in a description of your playlist. Then either click outside the input field or press Return. To edit, double-click on the playlist's description and you can proceed as before. You are not constrained by the length of your description.

*Selecting a playlist:*
Click on a playlist name.

*Adding a SC track to a playlist:*
Copy+paste the URL of a SC track into the field marked "New SoundCloud track URL". Then either click outside the input field or press Return to add the track to your playlist. If the track is a valid SC track URL, a small representation of the track is loaded on top of the tracklist under the input. If you try to add a SC set or other SC resource, you will be alerted.

*Playing a playlist or track:*
Click anywhere on the track that you are hovering over in the currently selected playlist and it will be loaded and automatically played in the embedded SC widget.

*Changing the order of a track:*
To move a track up in the ordering of the other tracks in the playlist, click the arrow marked upwards on the track you are hovering over. To move its order lower, click on the downward arrow. If you move the last track down, it will appear on the top of the playlist as the first track. Similarly, if you move the first track up, it will appear as the last track on the bottom of the playlist.

*Deleting a track or a playlist:*
Click the small grey cross that appears when you hover over the playlist or track. It will turn orange. Click this again to confirm removal. When you move your mouse away while the orange cross is orange, the request is cancelled.

How to run
----------

If want to run this on your own localhost to make changes, you need to install Meteor framework first. For details, please go to www.meteor.com.

Outstanding issues
------------------

Bugs:
- get sc_widget.load() to work as intended so that the global SC.Widget can be defined once on demand and SC.oEmbed doesn't need to get called every time and rebuild the embedded player iframe
- the mouseup event on remove icons is sometimes fired when a playlist/track gets confirmed to be removed and the mouse remains hovered over the next element's remove button after it gets removed from the list

Future amendments:
- implement global playlist control via play/pause buttons on the playlist displays themselves, for true 'one-click' functionality
- decouple the playlist & track playing functionality from management and browsing of other tracks and playlists, so flow is not interrupted while playing tracks
- show the playing icon in the title bar when playing a track!
- allow URL linking to individual playlists for anyone
- add a time-out check to alert user or show appropriate error message in appropriate div, if the getJSON requests return a 404
