'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let ItemOfferBookmark = new Schema({
    user: Schema.ObjectId,
    item: Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in item list. Get bookmarks for user.
  ItemOfferBookmark.index({ user: 1, item: 1 });


  N.wire.on('init:models', function emit_init_ItemOfferBookmark() {
    return N.wire.emit('init:models.' + collectionName, ItemOfferBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemOfferBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
