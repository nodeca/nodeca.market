// History of the edits made for market items
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ItemOfferHistory = new Schema({
    // post id
    item:         Schema.ObjectId,

    // user that changed post (may be post author or moderator)
    user:         Schema.ObjectId,

    // old information before changes were made
    section:      Schema.ObjectId,
    title:        String,
    price: {
      value:    Number,
      currency: String
    },
    md:           String,
    barter_info:  String,
    delivery:     Boolean,
    is_new:       Boolean,
    location:     [ Number, Number ],
    files:        [ Schema.ObjectId ],
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
  ItemOfferHistory.index({ item: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_ItemOfferHistory() {
    return N.wire.emit('init:models.' + collectionName, ItemOfferHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_ItemOfferHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
