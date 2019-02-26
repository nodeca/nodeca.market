// Store references to market item when user creates dialog using "contact"
// button for both offers and wishes
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let ItemDialogRef = new Schema({
    item:           Schema.ObjectId,

    // user id of a person who responded to offer;
    // used to ensure that user can only respond to a particular item once
    message_author: Schema.ObjectId,

    // message id on the recipient's side
    message:        Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // - get all references for an item
  // - get reference for an item created by specific user
  //   (used to make sure they can't contact about this item multiple times)
  ItemDialogRef.index({ item: 1, message_author: 1 });


  N.wire.on('init:models', function emit_init_ItemDialogRef() {
    return N.wire.emit('init:models.' + collectionName, ItemDialogRef);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemDialogRef(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
