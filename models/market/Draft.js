'use strict';


const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;

const DRAFT_EXPIRE_TIMEOUT = 7 * 24 * 60 * 60; // 7 days in seconds.


module.exports = function (N, collectionName) {

  let Draft = new Schema({
    user:           Schema.ObjectId,
    ts:             { type: Date, 'default': Date.now, expires: DRAFT_EXPIRE_TIMEOUT },
    data:           new Schema({
      type:           String,
      title:          String,
      price_value:    Number,
      price_currency: String,
      section:        Schema.ObjectId,
      description:    String,
      attachments:    [ Schema.ObjectId ],
      barter_info:    String,
      delivery:       Boolean,
      is_new:         Boolean
    }, { _id: false })
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  Draft.index({ user: 1 });


  N.wire.on('init:models', function emit_init_Draft() {
    return N.wire.emit('init:models.' + collectionName, Draft);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Draft(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
