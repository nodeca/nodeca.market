'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let ItemRequestBookmark = new Schema({
    user: Schema.ObjectId,
    item: Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in item list. Get bookmarks for user.
  ItemRequestBookmark.index({ user: 1, item: 1 });


  N.wire.on('init:models', function emit_init_ItemRequestBookmark() {
    return N.wire.emit('init:models.' + collectionName, ItemRequestBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemRequestBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
