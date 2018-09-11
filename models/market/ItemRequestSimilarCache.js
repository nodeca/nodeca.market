// Cache of items for "similar items" block
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  let ItemRequestSimilarCache = new Schema({
    item:     Schema.ObjectId,
    ts:       { type: Date, 'default': Date.now },
    results:  [ { item_id: Schema.ObjectId, weight: Number } ]
  }, {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////

  ItemRequestSimilarCache.index({ item: 1 });

  N.wire.on('init:models', function emit_init_ItemRequestSimilarCache() {
    return N.wire.emit('init:models.' + collectionName, ItemRequestSimilarCache);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemRequestSimilarCache(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
