
/** 
 * SoundCloud Playlister
 * publisher.js
 * powered by Meteor 0.5.0 framework
 * server-side script
 * 
 * Sets up the MongoDB collections used by the app and publishes them.
 * 
 * last edit: Nov 9, 2012
 * 
 * @author Chris Nater
 *
 * FEATURES TO ADD:
 * TODO better and more secure session & token management, perhaps also app's own account system (easy with Meteor Accounts). right now, having a unique Guest for every single visitor will
 *      explode the database at some point
 * 
 * */

/* Playlists -- {name: String,
 *               description: String,
 *               owner: String,
 *               timestamp: Long}
 */
Playlists = new Meteor.Collection("playlists");

// Publish complete set of playlists to all clients.
Meteor.publish('playlists', function (owner) {
	return Playlists.find({owner: owner});
});

/* Tracks -- {url: String,
 * 			  order: Int,
 *            playlist_id: String}
 */
Tracks = new Meteor.Collection("tracks");

// Publish all tracks for requested playlist_id.
Meteor.publish('tracks', function (playlist_id) {
	return Tracks.find({playlist_id: playlist_id});
});

