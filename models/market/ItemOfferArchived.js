'use strict';


const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ItemOfferArchived = new Schema({
    section:      Schema.ObjectId,
    hid:          Number,
    user:         Schema.ObjectId,
    ts:           { type: Date, default: Date.now }, // timestamp
    ip:           String, // ip address
    title:        String,

    price: {
      value:    Number,
      currency: String // RUB, USD or EUR
    },

    // price converted to USD, used for search and sorting
    base_currency_price: Number,

    html:         String, // displayed HTML
    md:           String, // markdown source

    barter_info:  String,
    delivery:     Boolean,
    is_new:       Boolean,

    location:     [ Number, Number ],

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally;
    // Same values as in ItemOffer
    st:           Number,
    ste:          Number, // real state, if user is hellbanned
                          // (general `state` is used for fast selects)

    // An amount of edits made for this post
    edit_count:   Number,

    // Time when this post was last edited (null if no edits)
    last_edit_ts: Date,

    // Time when this post is scheduled to be archived, used in automatic archiving tasks.
    // It should only be present in Item (not ItemArchived) collections.
    autoclose_at_ts: Date,

    // Time when this post was archived (automatically or manually).
    // It should only be present in ItemArchived (not Item) collections.
    closed_at_ts: Date,

    bookmarks:    { type: Number, default: 0 },

    views:        { type: Number, default: 0 },

    del_reason:   String,
    del_by:       Schema.ObjectId,

    // Previous state for deleted posts
    prev_st: {
      st: Number,
      ste: Number
    },

    // Attached visible photos
    files:        [ Schema.ObjectId ],

    // All attached photos (including temporary photos during editing
    // and previously removed ones)
    //  - `tmp: true`  means file is in gridfs_tmp (newly uploaded, but not saved)
    //  - `tmp: false` means file is in gridfs (previously saved, later removed)
    all_files:    [ { id: Schema.ObjectId, tmp: Boolean } ],

    // Post params
    params_ref:   Schema.ObjectId,

    // List of urls to accessible resources being used to build this post (snippets, etc.)
    imports:      [ String ],

    // List of users to fetch in order to properly display the post
    import_users: [ Schema.ObjectId ]
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // lookup _id by hid (for routing)
  ItemOfferArchived.index({ hid: 1 });

  // get a list of user items
  ItemOfferArchived.index({ user: 1, st: 1, _id: -1 });


  // Set 'hid' for the new item.
  // This hook should always be the last one to avoid counter increment on error
  ItemOfferArchived.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this item was created
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('market_item');
  });


  // Remove empty "imports" and "import_users" fields
  //
  ItemOfferArchived.pre('save', function () {
    /*eslint-disable no-undefined*/
    if (this.imports?.length === 0) {
      this.imports = undefined;
    }

    if (this.import_users?.length === 0) {
      this.import_users = undefined;
    }

    if (this.location?.length === 0) {
      this.location = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  ItemOfferArchived.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  N.wire.on('init:models', function emit_init_ItemOfferArchived() {
    return N.wire.emit('init:models.' + collectionName, ItemOfferArchived);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemOfferArchived(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
