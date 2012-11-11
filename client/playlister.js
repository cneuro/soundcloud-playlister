
/** 
 * SoundCloud Playlister
 * playlister.js
 * powered by Meteor 0.5.0 framework
 * client-side script
 * 
 * Contains all functionality for creating, editing, managing and playing playlists comprised of SoundCloud tracks.
 * 
 * last edit: Nov 9, 2012
 * 
 * @author Chris Nater
 *
 * BUGS:
 * TODO#1 get sc_widget.load() to work as intended so that the global SC.Widget can be defined once on demand and SC.oEmbed doesn't need to get called every time and rebuild the embedded player iframe
 * TODO the mouseup event on remove icons is sometimes fired when a playlist/track gets confirmed to be removed and the mouse remains hovered over the next element's remove button after
 *      it gets removed from the list
 * 
 * FEATURES TO ADD:
 * TODO implement global playlist control via play/pause buttons on the playlist displays themselves, for true 'one-click' functionality
 * TODO decouple the playlist & track playing functionality from management and browsing of other tracks and playlists, so flow is not interrupted while playing tracks
 * TODO show the playing icon in the title bar when playing a track!
 * TODO allow URL linking to individual playlists for anyone
 * TODO add a time-out check to alert user or show appropriate error message in appropriate div, if the getJSON requests return a 404
 * 
 * */

// ### Global setup ###

// define MongoDB collection objects
Playlists = new Meteor.Collection("playlists");
Tracks = new Meteor.Collection("tracks");

// unique ID for distinguishing guests in the collection. will be refreshed on page reloads etc to mimic sessions expiring
Session.set('session_uid', Meteor.uuid());

// ID of currently selected playlist
Session.set('selected_playlist_id', null);

// ID of currently playing playlist
Session.set('playing_playlist_id', null);

// ID of currently selected track 
Session.set('selected_track_id', null);

//ID of currently selected track 
Session.set('playing_track_id', null);

// ID of playlist's name being edited
Session.set('editing_playlist_id', null);

// ID of playlist's description being edited
Session.set('editing_playlist_description', null);

// the identifying SoundCloud Client_ID for this app
Session.set('client_id', '9b368e92a10eec6e16c7d5f6d01a3153');

// the SC.Widget object of the iframe containing the embedded SoundCloud player functionality
var sc_widget = null;

// subscribe the MongoDB collections to the published resources
Meteor.autosubscribe(function () {
	// subscribe to all playlists in collection of a particular user at startup, sorted by most recently added
	Meteor.subscribe('playlists', getCurrentUserId());
	// subscribe to all tracks in collection of a particular playlist (if active)
	var selected_playlist_id = Session.get('selected_playlist_id')
	if (selected_playlist_id)
		Meteor.subscribe('tracks', selected_playlist_id);
});

// ### View helpers ###

// returns a user-friendly printout of either a non-logged-in guest or current user
Handlebars.registerHelper('user_name', function() {
	return Meteor.userId() ? Meteor.user().username : 'Guest';
});
// returns true if a playlist is currently selected, false otherwise
Handlebars.registerHelper('any_playlist_selected', function() {
	return !Session.equals('selected_playlist_id', null);
});
// returns the id of the track that is currently playing, null otherwise
Handlebars.registerHelper('any_track_selected', function() {
	return (Session.get('selected_track_id'));
});
// returns the id of the selected playlist, null otherwise
Handlebars.registerHelper('playlist_has_tracks', function() {
	return (Tracks.find({playlist_id: Session.get('selected_playlist_id')}).count() > 0);
});
// Get the user-defined name of the currently selected playlist
Handlebars.registerHelper('playlist_name', function () {
	var playlist = Playlists.findOne(Session.get('selected_playlist_id'), {'name': 1});
	if (playlist != null) {
		return playlist.name;
	}
});

// ### Global utility functions and functionality setup ###

function getCurrentUserId() {
	// we want a 'unique' owner every time (no null/'Guest'), so that every browser not logged in isn't the same 'Guest' across the Internet
	return Meteor.userId() ? Meteor.userId() : Session.get('session_uid');
}
// called when a new playlist is created or an existing one edited, trims & sanitises the given name, checks for duplicates and returns its UID is successfully inserted/updated
// takes in a playlist's name and id (if editing)
function updatePlaylists(name, id) {
	var validation = null;
	var trimmed_name = name.trim();
	var duplicate = Playlists.findOne({name: trimmed_name, _id: {$ne: id}});
	if (duplicate)
		alert('This name is already taken by another playlist.');
	else {
		if (name.length <= 40) {
			// if editing existing playlist name, update the collection, otherwise insert new entry
			if (id) {
				Playlists.update(id, {$set: {name: trimmed_name}});
				validation = id;
			}
			else
				validation = Playlists.insert({name: trimmed_name, owner: getCurrentUserId(), timestamp: (new Date()).getTime()});
		}
		else
			alert('Sorry, the playlist name needs to be 40 characters or less.');
	}
	return validation;
}
// Returns an event map that handles the "escape" and "return" keys and
// "blur" events on a text input (given by selector) and interprets them
// as "ok" or "cancel"
var okCancelEvents = function (selector, callbacks) {
	var ok = callbacks.ok || function () {};
	var cancel = callbacks.cancel || function () {};
	var events = {};
	events['keyup '+selector+', keydown '+selector+', focusout '+selector] =
		function (evt) {
			// escape = cancel
			if (evt.type === "keydown" && evt.which === 27) {
				cancel.call(this, evt);		
			} 
			// blur/return/enter = ok/submit if non-empty
			else if (evt.type === "keyup" && evt.which === 13 || evt.type === "focusout") {
				var value = String(evt.target.value || "");
				if (value) {
					ok.call(this, value, evt);
				}
				else
					cancel.call(this, evt);
			}
		};
	return events;
};
// clicking on an input focuses it and selects it
var activateInput = function (input) {
	input.focus();
	input.select();
};
/**
 * embed the SoundCloud widget in the active track container and bind functions to the player's events
 * 
 * I don't just delare a global SC.Widget object and call .load() with the the user's new track choice,
 * because an iframe must already be present for it to become an SC.Widget. Since I want to keep the UI as clean as possible and only
 * build it up as the user makes choices, I must call the existing-iframe-independent oEmbed to get the iframe contents on demand,
 * and bind a new SC.Widget with new event methods every time the track is changed.
 * 
 * If .load() would work here as expected (see TODO(#1)), none of this would be an issue.
 * 
 */
function embed_track() {
	var track_id = Session.get('selected_track_id');
	// only bother embedding anything if a track is actually selected
	if (track_id) {
		// show that the embedded iframe is loading
		var widget_container_id = '#embedded-player';
		var loading_container = $('#player-loader');
		// empty the contents of any previous iframe (TODO#1)
		$(widget_container_id).empty();
		loading_container.addClass('loading');
		var selected_track = Tracks.findOne(track_id);
		// normally, we only need to do this once (TODO#1)
//		if (sc_widget == null) {
			SC.oEmbed(selected_track.url, {max_height: '166px', auto_play: true}, function (result) {
				// get the id of the table cell that houses the current track/iframe
				if (result) {
					// dump the iframe of the oEmbed endpoint into the HTML of the active-track-pane div		
					$(widget_container_id).html(result.html);
					// set the id of the iframe (for SC.Widget to pick it up)
					$(widget_container_id+' iframe').attr('id', 'soundcloud-widget-iframe');
					// get a SC Widget object from the iframe
					sc_widget = SC.Widget('soundcloud-widget-iframe');
					if (sc_widget) {
						
						/** useful SC.Widget debugging tool adapted from http://w.soundcloud.com/player/api_playground.html */
//						var eventKey, eventName;
//						for (eventKey in SC.Widget.Events) {
//							(function(eventName, eventKey) {
//								eventName = SC.Widget.Events[eventKey];
//								sc_widget.bind(eventName, function(eventData) {
//									console.log("SC.Widget.Events." + eventKey + " " + JSON.stringify(eventData || {}));
//								});
//							}(eventName, eventKey));
//						}
						
						// now set all appropriate app-wide parameters and methods on the widget's events
						var playlist_id  = Session.get('selected_playlist_id');
						// check that the user hasn't globally paused the playlist while a track is playing
						// not very useful for now, since global play function not implemented
						sc_widget.bind(SC.Widget.Events.PLAY_PROGRESS, function() {
							if (!Session.get('playing_playlist_id')) {;
								sc_widget.pause();
							}
						});
						// once iframe is fully loaded, remove the loader
						sc_widget.bind(SC.Widget.Events.READY, function() {
							loading_container.removeClass('loading');
						});
						// on pressing play, set the appropriate track and playlist IDs
						sc_widget.bind(SC.Widget.Events.PLAY, function() {
							Session.set('playing_track_id', selected_track._id);
							Session.set('playing_playlist_id', selected_track.playlist_id);
						});
						// on pressing pause, unset any playing data
						sc_widget.bind(SC.Widget.Events.PAUSE, function() {
							Session.set('playing_track_id', null);
							Session.set('playing_playlist_id', null);
						});
						// when a track finishes playing, check if continuous play option is active and if so, skip to the next track
						sc_widget.bind(SC.Widget.Events.FINISH, function() {
							// only play next track if we're still on the same playlist
							var playlist_id = Session.get('selected_playlist_id');
							
							if (playlist_id == selected_track.playlist_id) {
								var next_track = null;
								// if the currently finished track is the last one in the playlist, go back to the top
								if (Tracks.find({playlist_id: selected_track.playlist_id}).count()-1 == selected_track.order) {
									next_track = Tracks.findOne({playlist_id: selected_track.playlist_id, order: 0});
								}
								else {
									next_track = Tracks.findOne({playlist_id: selected_track.playlist_id, order: (selected_track.order+1)});
								}
								if (next_track) {
									console.log('next track!!!');
									Session.set('selected_track_id', next_track._id);
									// should just need to load() the next track, not have to do this whole thing again (TODO#1)
									embed_track();
//									reloadSCWidget(next_track.sc_id);
								}
							}
						});
					}
				}
				else {
					loading_container.html("Couldn't load the track at "+track_url);
				}
			});
//		}
//		// sc_widget is already defined, just need to reload the contents with the new selections (TODO#1)
//		else {
//			reloadSCWidget(selected_track.sc_id);
//		}
	}
}
// reload the existing embedded track iframe with a new URL (TODO#1)
function reloadSCWidget(track_id) {
	var url = "http://api.soundcloud.com/tracks/"+track_id+"?client_id="+Session.get('client_id');
	console.log('reloading widget with new track: '+url);
    console.log('current sc_widget=');	
	console.log(sc_widget);
	var widgetOptions = {max_height: '166px', auto_play: true};
    widgetOptions.callback = function () {
        console.log('Widget is reloaded.');
        console.log(this);
    };
    console.log(widgetOptions);
    /** calling .load on the predefined SC Widget seems to not work
      * the iframe object 'disappears' from the container once this is called, even though sc_widget still seems to be a valid SC.Widget object
      */
    sc_widget.load(url, widgetOptions);
	console.log(sc_widget);
}

// ### Playlists ###

// return the list of all playlists belonging to the current user
Template.playlists.owners_playlists = function () {
	return Playlists.find({owner: getCurrentUserId()}, {sort: {timestamp: -1}});
};
//returns true if the current user has created any playlists, false otherwise
Template.playlists.owner_has_playlists = function () {
	return (Playlists.find({owner: getCurrentUserId()}).count() > 0);
};
// returns the name of the currently selected playlist
Template.playlists.this_playlist_name = function () {
	return this.name;
}
//returns the ID of the currently selected playlist
Template.playlists.playlist_id = function () {
	return this._id;
}
// attach events to keydown, keyup, and blur on "New playlist" input
Template.playlists.events(okCancelEvents(
	'#new-playlist',
	{
		ok: function (value, evt) {
			// takes in the name of a new playlist, trims and sanitizes it, inserts it into the collection and returns its UID
			var id = updatePlaylists(value);
			if (id)
				// reset the new-playlist input field to the placeholder text defined in the HTML
				evt.target.value = "";
			else
				// there was a duplicate!
				activateInput(evt.target);
		}
	}
));
// attach events to keydown, keyup, and blur on playlist editing input
Template.playlists.events(okCancelEvents(
	'#playlist-name-input',
	{
		ok: function (value) {
			var id = updatePlaylists(value, this._id);
			if (id)
				Session.set('editing_playlist_id', null);
		},
		cancel: function () {
	    	Session.set('editing_playlist_id', null);
		}
	}
));
Template.playlists.events({
	// clicking and holding on a playlist name shouldn't kick off the hyperlink
	'mousedown .name-display': function (evt) {
		evt.preventDefault();
	},
	'click .name-display': function (evt) {
		evt.preventDefault();
	},
	// clicking anywhere near the display name selects the playlist
	'click .name-display-container': function (evt) {
		if (!Session.equals('selected_playlist_id', this._id)) {
			Session.set('selected_playlist_id', this._id);
			Session.set('playing_playlist_id', null);
		}		
	},
	// changes the remove icon to an orange confirmation icon
	'mouseup .remove': function(evt, tmpl) {
		$('#playlist-'+this._id+' .remove').addClass('confirm');
	},
	// remove a playlist from the user's playlists
	'mousedown .remove.confirm': function (evt) {
		Playlists.remove(this._id);
		Session.set('selected_playlist_id', null);
	},
	// navigating the mouse away from the clicked remove button 'cancels' the removal confirmation
	'mouseleave .remove.confirm': function (evt, tmpl) {
		$('#playlist-'+this._id+' .remove').removeClass('confirm');
	},
	// start editing playlist name
	'dblclick .playlist': function (evt, tmpl) {
		Session.set('editing_playlist_id', this._id);
		Meteor.flush(); // force DOM redraw, so we can focus the edit field
		activateInput(tmpl.find("#playlist-name-input"));
	}
	/** a currently incomplete and failed attempt to implement global playlist control
	  * due to my dodgy understanding of the asynchronous flow of Meteor as well as the functionality of SC.Widget and its iframe */
	//,
	// when the playlist's play button is pressed, select it and start playing the playlist's tracks
//	'click .playlist.stopped .play-btn': function (evt) {
//		Session.set('playing_playlist_id', null);
//		Session.set('selected_playlist_id', this._id);
//		var new_track = true;
//		var currently_selected_track = Tracks.findOne(Session.get('selected_track_id'));
//		// if a track is already selected on this playlist and thus loaded into the SC Widget, simply resume play where we left off
//		if (currently_selected_track != null) {
//			if (currently_selected_track.playlist_id == Session.get('selected_playlist_id')) {
//				sc_widget.play();
//				new_track = false;
//			}
//		}
//		// otherwise it means a different playlist is selected to play or there is simply no track selected
//		if (new_track) {
//			// get the first track, if it exists, from the playlist to start playing it
//			var first_track = Tracks.findOne({playlist_id: this._id}, {sort: {order: 1}});
//			// if there is a first track to play, do so
//			if (first_track)
//				Session.set('selected_track_id', first_track._id);
//			embed_track();
//		}
//	},
//	// if the pause button of a currently-playing playlist is clicked, stop that playlist and the player
//	'click .playlist.playing .play-btn': function (evt) {
//		Session.set('playing_playlist_id', null);
//		sc_widget.pause();
//	}

});
// playlist is selected to show appropriate highligts
Template.playlists.selected_class = function () {
	return Session.equals('selected_playlist_id', this._id) ? 'selected' : '';
};
// playlist is playing to show appropriate widget
Template.playlists.playing_class = function () {
	return Session.equals('playing_playlist_id', this._id) ? 'playing' : 'stopped';
};
// playlist's name is being edited to show appropriate DOM node
Template.playlists.editing_name = function () {
	return Session.equals('editing_playlist_id', this._id);
};

// ### Playlist control ###

// playlist's description is being edited to show appropriate DOM node
Template.control.editing_description = function () {
	var playlist = Playlists.findOne(Session.get('selected_playlist_id'), {'description': 1});
	if (playlist)
		// show edit field if either the playlist description is being edited or the playlist's description is empty
		return (Session.equals('editing_playlist_description', Session.get('selected_playlist_id')) || (!playlist.description));
};
// returns playlist's description
Template.control.description = function () {
	var playlist = Playlists.findOne(Session.get('selected_playlist_id'), {'description': 1});
	if (playlist)
		return playlist.description;
};
// returns a playlist's description placeholder text for the input field if there is none, or simply the existing description
Template.control.description_placeholder = function () {
	var current_playlist = Playlists.findOne(Session.get('selected_playlist_id'));
	if (!current_playlist.description)
		current_description = 'Description for "'+current_playlist.name+'"';
	return current_description;
}
// defines the events on various user input in the control pane
Template.control.events({
	'mousedown .name-display': function (evt) {
		evt.preventDefault();
	},
	'click .name-display': function (evt) {
		evt.preventDefault();
	},
	 // start editing playlist description
	'dblclick #playlist-description-display': function (evt, tmpl) {
		evt.preventDefault();
		Session.set('editing_playlist_description', Session.get('selected_playlist_id'));
		Meteor.flush(); // force DOM redraw, so we can focus the edit field
		activateInput(tmpl.find("#playlist-description-input"));
	}
});
// defines the implicit ok-cancel-blur events on the playlist description input
Template.control.events(okCancelEvents(
		'#playlist-description-input',
		{
			ok: function (value) {
				// we don't need to do much validation here, it's just a description ...
				Playlists.update(Session.get('selected_playlist_id'), {$set: {description: value}});
				Session.set('editing_playlist_description', null);
			},
			cancel: function () {
		    	Session.set('editing_playlist_description', null);
			}
		}
));
//defines the implicit ok-cancel-blur events when adding a new track from input to a playlist from SoundCloud URL
Template.control.events(okCancelEvents(
	'#new-track',
	{
		ok: function (value, evt) {
			var playlist_id = Session.get('selected_playlist_id');
			if (playlist_id) {
				$('#track-loader').addClass('loading');
				// validate the given URL as a SoundCloud track and store the track's permalink URL in the collection if successful
				var url = 'http://api.soundcloud.com/resolve.json?url='+value+'&client_id='+Session.get('client_id');
				$.getJSON(url, function(result) {
					if (result) {
						$('#track-loader').removeClass('loading');
						// first check this isn't a set, we just allow tracks for now ...
						if (result.kind == "track") {
							// increment the order of all Tracks so the new Track appears at the top
							Tracks.update({playlist_id: playlist_id}, {$inc: {order: 1}}, { multi: true });
							Tracks.insert({
								sc_id: result.id,
								url: value,
								playlist_id: playlist_id,
								order: 0
							});
						}
						else {
							alert("Sorry, only single SoundCloud tracks are allowed. Did you try to add a set?");
						}
					}
				});
			}
			evt.target.value = '';
		}
	}
));

// ### Tracks ###

// returns a list of all tracks belonging to the selected playlist
Template.tracks.tracks_to_display = function () {
	var playlist_id = Session.get('selected_playlist_id');
	if (playlist_id)
		return Tracks.find({playlist_id: playlist_id}, {sort: {order: 1}});
};
// returns the CSS class of a selected track in the playlist
Template.tracks.selected_class = function () {
	return Session.equals('selected_track_id', this._id) ? 'selected' : '';
};
// returns the template's current track ID
Template.tracks.track_id = function () {
	return this._id;
};
//returns the template's current SoundCloud track ID
Template.tracks.track_sc_id = function () {
	return this.sc_id;
};
// returns a user-friendly number indicating the track's overall unique place in the playlist
Template.tracks.track_order = function () {
	return this.order+1;
};
// requests the template's current track from the SoundCloud API /tracks endpoint and fills in the appropriate widgets with the results
Template.tracks.track_preview = function () {
	var playlist_id = Session.get('selected_playlist_id');
	var container_id = "#track-view-"+this._id;
	var url = "http://api.soundcloud.com/tracks/"+this.sc_id+"?client_id="+Session.get('client_id');
	// get some data about the track
	$.getJSON(url, function(data) {
		// if the URL was valid and doesn't return any structural errors, fill in the elements of the track contents pane
		if (data.errors == null) {
			$(container_id+' .track-contents').removeClass('loading');
			$(container_id+' .track-artwork').attr('src', data.artwork_url);
			$(container_id+' .artist-name').html(data.user.username);
			$(container_id+' .track-name').html(data.title);
			$(container_id+' .track-plays').html(data.playback_count);
			$(container_id+' .track-comments').html(data.comment_count);
			$(container_id+' .track-likes').html(data.favoritings_count);
		}
		else
			$(container_id+' .track-name').html('Could not load the track under <a href="'+url+'">'+url+'</a>');
	});
}
// define all the user-fired events for a track
Template.tracks.events({
	'click .track-contents': function (evt) {
		if (Session.get('selected_track_id') != this._id) {
			var track_id = this._id;
			Session.set('selected_track_id', track_id);
			embed_track();
		}
	},
	// changes the remove icon to an orange confirmation icon
	'mouseup .remove': function(evt, tmpl) {
		$('#track-view-'+this._id+' .remove').addClass('confirm');
	},
	// remove the track from the playlist's track
	'mousedown .remove.confirm': function (evt) {
		var track_id = this._id;
    	var removed_order = Tracks.findOne(track_id).order;		
		Tracks.remove(track_id);
		// decrement the order value of every remaining track after the removed one's to keep order numbering consistent
		Tracks.update({playlist_id: Session.get('selected_playlist_id'), order: {$gt: removed_order}}, {$inc: {order: -1}}, { multi: true });
	},
	// navigating the mouse away from the clicked remove button 'cancels' the removal confirmation
	'mouseleave .remove.confirm': function (evt, tmpl) {
		$('#track-view-'+this._id+' .remove').removeClass('confirm');
	},
	// define behaviour for the upward track re-ordering button
	'click .arrow.up': function (evt) {
		var playlist_id = Session.get('selected_playlist_id');
		// first check if there are any other tracks at all
		if (Tracks.find({playlist_id: playlist_id}).count() > 1) {		
			var track_id = this._id;
			var track_order = this.order;
			// check if current track is in fact the first one
			if (track_order > 0) {
				// when moving the track up in the list, decrement current track's order and increment the previous track's order
				var previous_track = Tracks.findOne({playlist_id: playlist_id, order: (track_order-1)});
				Tracks.update(previous_track._id, {$inc: {order: 1}});
				Tracks.update(track_id, {$inc: {order: -1}});
			}
			else {
				// if track is the first one, put it on the bottom of the list and reorder all other tracks accordingly
				var last_track = Tracks.findOne({playlist_id: playlist_id}, {sort: {order: -1}});
				Tracks.update({playlist_id: playlist_id}, {$inc: {order: -1}}, {multi: true});
				Tracks.update(track_id, {$set: {order: last_track.order}});
			}
		}
	},
	// define behaviour for the downward track re-ordering button
	'click .arrow.down': function (evt) {
		var playlist_id = Session.get('selected_playlist_id');
		if (Tracks.find({playlist_id: playlist_id}).count() > 1) {
			var track_id = this._id;
			var track_order = this.order;
			var last_track = Tracks.findOne({playlist_id: playlist_id}, {sort: {order: -1}});
			// check if current track is in fact the last one
			if (track_order < last_track.order) {
				// when moving the track down in the list, increment current track's order and decrement the next track's order
				var next_track = Tracks.findOne({playlist_id: playlist_id, order: (track_order+1)});
				Tracks.update(next_track._id, {$inc: {order: -1}});
				Tracks.update(track_id, {$inc: {order: 1}});
			}
			else {
				// if track is the last one, put it on the top of the list and reorder all other tracks accordingly
				Tracks.update({playlist_id: playlist_id}, {$inc: {order: 1}}, {multi: true});
				Tracks.update(track_id, {$set: {order: 0}});
			}
		}
	}
});

// ### Users ###

// returning different texts for DOM nodes depending on if a user is logged in or not
Template.login.login_status = function (type) {
	switch (type) {
		case '0': return (Meteor.userId() ? 'You are logged in as '+Meteor.user().username : 'You are not logged in. Your changes will not be saved.');
		case '1': return (Meteor.userId() ? 'logged_in' : 'logged_out');
	}
};
// handles events related to Connecting with SoundCloud
Template.login.events({
	// clicking log in button	
	'click #sc-login-btn.logged_out': function (evt) {
		evt.preventDefault();
		SC.connect(function() {
			// if SoundCloud login is valid, simply 'log in' locally with the SC user's ID
			// it's a hack, but for now simple meteor-handled, SC-validated account & session management should suffice for now
			SC.get('/me', function(user) {
				Meteor.loginWithPassword(user.username, user.id, function (error) {
					if (error)
						// create a new 'user' if they don't exist
						Accounts.createUser({username: user.username, password: user.id});
				});
			});
		});
	},
	// clicking log out button
	'click #sc-login-btn.logged_in': function (evt) {
		evt.preventDefault();
		// destroy all session playlist & track variables except the session UID to clean up UI
		Session.set('selected_playlist_id', null);
		Session.set('playing_playlist_id', null);
		Session.set('selected_track_id', null);
		Session.set('playing_track_id', null);
		Session.set('editing_playlist_id', null);
		Session.set('editing_playlist_description', null);
		// this only logs out of the app, not out of SoundCloud
		Meteor.logout();
	}
});
