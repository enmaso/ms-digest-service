'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var schema = mongoose.Schema({
  email: String,
  nickname: String,
  profileId: String,
  refresh: String,
  token: String,
  userId: String,
  vendor: String,
  displayName: String,
  thumbnail: String,
  profile: Schema.Types.Mixed,
  subscribed: {
          type: Boolean,
          default: false
  }
});

var Source = module.exports = mongoose.model('Source', schema);
