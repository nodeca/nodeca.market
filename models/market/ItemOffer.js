'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('MARKET_ITEM_OFFER', 13);

  let statuses = {
    OPEN:         1, // only in active model
    CLOSED:       2, // only in archive
    PENDING:      3, // reserved, not used now
    DELETED:      4, // only in archive
    DELETED_HARD: 5, // only in archive
    HB:           6  // hellbanned, can be in both models depending on ste
  };

  statuses.LIST_VISIBLE   = [ statuses.OPEN, statuses.CLOSED ];


  let ItemOffer = new Schema({
    section:      Schema.ObjectId,
    hid:          Number,
    user:         Schema.ObjectId,
    ts:           { type: Date, 'default': Date.now }, // timestamp
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
    // constants should be defined globally
    st:           Number,
    ste:          Number, // real state, if user is hellbanned
                          // (general `state` is used for fast selects)

    // An amount of edits made for this post
    edit_count:   Number,

    // Time when this post was last edited (null if no edits)
    last_edit_ts: Date,

    bookmarks:    { type: Number, 'default': 0 },

    views:        { type: Number, 'default': 0 },

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
    all_files:    [ Schema.ObjectId ],

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
  ItemOffer.index({ hid: 1 });

  // get a list of user items
  ItemOffer.index({ user: 1, _id: -1, st: 1 });

  // get a list of items in a section
  ItemOffer.index({ section: 1, _id: -1, st: 1 });


  // Set 'hid' for the new item.
  // This hook should always be the last one to avoid counter increment on error
  ItemOffer.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this item was created
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('market_item');
  });


  // Remove empty "imports" and "import_users" fields
  //
  ItemOffer.pre('save', function () {
    if (this.imports && this.imports.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users && this.import_users.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  ItemOffer.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  // Export statuses
  //
  ItemOffer.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_ItemOffer() {
    return N.wire.emit('init:models.' + collectionName, ItemOffer);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemOffer(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
