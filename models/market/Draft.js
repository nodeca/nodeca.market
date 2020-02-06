'use strict';


const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Draft = new Schema({
    user:           Schema.ObjectId,
    ts:             { type: Date, default: Date.now },
    data:           new Schema({
      type:           String,
      title:          String,
      price_value:    Number,
      price_currency: String,
      section:        Schema.ObjectId,
      description:    String,
      files:          [ Schema.ObjectId ],
      barter_info:    String,
      delivery:       Boolean,
      is_new:         Boolean
    }, { _id: false }),

    // all uploaded files for this draft in the time order;
    // (`data.files` is a subset of `files` which user can reorder and remove
    // items from)
    all_files:      [ Schema.ObjectId ]
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  Draft.index({ user: 1 });

  // Remove attached files when draft is removed
  //
  Draft.pre('remove', function () {
    return Promise.all(this.all_files.map(id => N.models.core.FileTmp.remove(id, true)));
  });


  N.wire.on('init:models', function emit_init_Draft() {
    return N.wire.emit('init:models.' + collectionName, Draft);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Draft(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
