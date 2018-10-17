// History of the edits made for market items
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ItemWishHistory = new Schema({
    // post id
    item:         Schema.ObjectId,

    // user that changed post (may be post author or moderator)
    user:         Schema.ObjectId,

    // old information before changes were made
    section:      Schema.ObjectId,
    title:        String,
    md:           String,
    location:     [ Number, Number ],
    params_ref:   Schema.ObjectId,

    // change time
    ts:         { type: Date, 'default': Date.now },

    // ip where this change was made from
    ip:         String
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular post
  ItemWishHistory.index({ item: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_ItemWishHistory() {
    return N.wire.emit('init:models.' + collectionName, ItemWishHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_ItemWishHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
