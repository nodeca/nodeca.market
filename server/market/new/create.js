// Create new market offer
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    properties: {
      draft_id: { format: 'mongo' }
    },
    oneOf: [
      {
        properties: {
          type:           { 'const': 'sell', required: true },
          title:          { type: 'string',  required: true },
          price_value:    { type: 'number',  required: true, minimum: 0 },
          price_currency: { type: 'string',  required: true },
          section:        { format: 'mongo', required: true },
          description:    { type: 'string',  required: true },
          attachments:    {
            type: 'array',
            uniqueItems: true,
            items: { format: 'mongo' },
            required: true
          },
          barter_info:    { type: 'string',  required: true },
          delivery:       { type: 'boolean', required: true },
          is_new:         { type: 'boolean', required: true }
        }
      },
      {
        properties: {
          type:           { 'const': 'buy',  required: true },
          title:          { type: 'string',  required: true },
          section:        { format: 'mongo', required: true },
          description:    { type: 'string',  required: true }
        }
      }
    ]
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.market.Section.findById(env.params.section).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Should never happen, restricted on client
    if (section.is_category) throw N.io.BAD_REQUEST;

    env.res.section_hid = section.hid;
  });


  // Check and convert currency
  //
  N.wire.before(apiPath, function convert_currency(env) {
    if (env.params.type !== 'sell') return;

    if (!N.config.market.currencies.hasOwnProperty(env.params.price_currency)) {
      // unknown currency type, shouldn't happen because restricted on the client
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


  N.wire.on(apiPath, async function create_buy_offer(env) {
    if (env.params.type !== 'buy') return;

    let statuses = N.models.market.ItemRequest.statuses;
    let item = new N.models.market.ItemRequest();

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.ip = env.req.ip;
    item.params = env.data.parse_options;

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.VISIBLE;
    } else {
      item.st  = statuses.VISIBLE;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

    await item.save();

    env.data.new_item = item;
  });


  N.wire.on(apiPath, async function create_sell_offer(env) {
    if (env.params.type !== 'sell') return;

    let statuses = N.models.market.ItemOffer.statuses;
    let item = new N.models.market.ItemOffer();

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.ip = env.req.ip;
    item.params = env.data.parse_options;

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.VISIBLE;
    } else {
      item.st  = statuses.VISIBLE;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

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
};
