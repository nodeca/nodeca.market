// Create new market offer
//

'use strict';


const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:       { format: 'mongo' },
    type:           { type: 'string', 'enum': [ 'sell', 'buy' ] },
    title:          { type: 'string' },
    price_value:    { type: 'number', minimum: 0 },
    price_currency: { type: 'string' },
    section:        { format: 'mongo' },
    description:    { type: 'string' },
    attachments:    {
      type: 'array',
      uniqueItems: true,
      items: { format: 'mongo' }
    },
    barter_info:    { type: 'string' },
    delivery:       { type: 'boolean' },
    is_new:         { type: 'boolean' }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let min_length = await env.extras.settings.fetch('market_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_short', min_length)
      };
    }
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.market.Section.findById(env.params.section).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Should never happen, restricted on client
    if (section.is_category) throw N.io.BAD_REQUEST;
  });


  // Check and convert currency
  //
  N.wire.before(apiPath, function convert_currency(env) {
    if (env.params.type !== 'sell') return;

    // check that price and currency are present and valid,
    // shouldn't happen because restricted on the client
    if (!(env.params.price_value >= 0)) {
      throw N.io.BAD_REQUEST;
    }

    if (!N.config.market.currencies.hasOwnProperty(env.params.price_currency)) {
      throw N.io.BAD_REQUEST;
    }

    env.data.base_currency_price = 0; // TODO
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'market_items_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true });

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.before(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.description,
      attachments: [],
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check description length
  //
  N.wire.before(apiPath, async function check_desc_length(env) {
    let min_length = await env.extras.settings.fetch('market_desc_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_desc_too_short', min_length)
      };
    }
  });


  N.wire.on(apiPath, async function create_buy_offer(env) {
    if (env.params.type !== 'buy') return;

    // TODO
    throw {
      code: N.io.CLIENT_ERROR,
      message: 'Not implemented'
    };
  });


  N.wire.on(apiPath, async function create_sell_offer(env) {
    if (env.params.type !== 'sell') return;

    let statuses = N.models.market.ItemOffer.statuses;
    let item = new N.models.market.ItemOffer();

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.title = env.params.title;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.ip = env.req.ip;
    item.params = env.data.parse_options;
    item.price = {
      value:    env.params.price_value,
      currency: env.params.price_currency
    };
    item.base_currency_price = env.data.base_currency_price;
    item.barter_info = env.params.barter_info;
    item.delivery = env.params.delivery;
    item.is_new = env.params.is_new;

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.VISIBLE;
    } else {
      item.st  = statuses.VISIBLE;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

    item.location = ((await N.models.users.User.findById(env.user_info.user_id).lean(true)) || {}).location;

    await item.save();

    env.data.new_item = item;
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });


  // Remove draft
  //
  N.wire.after(apiPath, async function remove_draft(env) {
    let draft = await N.models.market.Draft.findOne({ _id: env.params.draft_id, user: env.user_info.user_id });

    if (draft) await draft.remove();
  });


  // Add redirect info
  //
  N.wire.after(apiPath, async function redirect_info(env) {
    env.res.section_hid = env.data.section.hid;
    env.res.item_hid    = env.data.new_item.hid;
  });
};
