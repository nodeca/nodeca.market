// Cache of items for "similar items" block
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, collectionName) {

  let ItemWishSimilarCache = new Schema({
    item:     Schema.ObjectId,
    ts:       { type: Date, default: Date.now },
    results:  [ { item_id: Schema.ObjectId, weight: Number } ]
  }, {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////

  ItemWishSimilarCache.index({ item: 1 });

  N.wire.on('init:models', function emit_init_ItemWishSimilarCache() {
    return N.wire.emit('init:models.' + collectionName, ItemWishSimilarCache);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemWishSimilarCache(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
