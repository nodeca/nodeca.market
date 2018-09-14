'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let ItemWishBookmark = new Schema({
    user: Schema.ObjectId,
    item: Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in item list. Get bookmarks for user.
  ItemWishBookmark.index({ user: 1, item: 1 });


  N.wire.on('init:models', function emit_init_ItemWishBookmark() {
    return N.wire.emit('init:models.' + collectionName, ItemWishBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemWishBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
