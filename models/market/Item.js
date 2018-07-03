'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const AttachmentInfo = require('./_AttachmentInfo');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('MARKET_ITEM', 13);

  let statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };

  let offer_types = {
    SELL: 1,
    BUY:  2
  };


  statuses.LIST_DELETABLE = [ statuses.VISIBLE, statuses.HB, statuses.PENDING ];

  let Item = new Schema({
    category:     Schema.ObjectId,
    hid:          Number,
    user:         Schema.ObjectId,
    ts:           { type: Date, 'default': Date.now }, // timestamp
    ip:           String, // ip address
    title:        String,

    offer_type:   Number, // sell or buy

    price: {
      value: Number,
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

    views_count:    { type: Number, 'default': 0 },

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
    import_users: [ Schema.ObjectId ],

    // Info to display post tail
    tail:         [ AttachmentInfo ]
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // TODO: indexes

  // TODO: hooks

  // Export statuses
  //
  Item.statics.statuses    = statuses;
  Item.statics.offer_types = offer_types;


  N.wire.on('init:models', function emit_init_Item() {
    return N.wire.emit('init:models.' + collectionName, Item);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Item(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
