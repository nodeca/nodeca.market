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

  set_content_type('MARKET_ITEM_REQUEST', 14);

  let statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };


  statuses.LIST_DELETABLE = [ statuses.VISIBLE, statuses.HB, statuses.PENDING ];

  let ItemRequest = new Schema({
    section:      Schema.ObjectId,
    hid:          Number,
    user:         Schema.ObjectId,
    ts:           { type: Date, 'default': Date.now }, // timestamp
    ip:           String, // ip address
    title:        String,

    html:         String, // displayed HTML
    md:           String, // markdown source

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
  ItemRequest.index({ hid: 1 });


  // Set 'hid' for the new item.
  // This hook should always be the last one to avoid counter increment on error
  ItemRequest.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this item was created
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('market_item');
  });


  // Export statuses
  //
  ItemRequest.statics.statuses    = statuses;


  N.wire.on('init:models', function emit_init_ItemRequest() {
    return N.wire.emit('init:models.' + collectionName, ItemRequest);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ItemRequest(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
