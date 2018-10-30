// Create new market offer
//

'use strict';


const _           = require('lodash');
const charcount   = require('charcount');
const mongoose    = require('mongoose');
const pump        = require('util').promisify(require('pump'));
const resizeParse = require('nodeca.users/server/_lib/resize_parse');


module.exports = function (N, apiPath) {

  const uploadSizes = Object.keys(resizeParse(N.config.market.uploads).resize);


  N.validate(apiPath, {
    draft_id:       { format: 'mongo' },
    title:          { type: 'string',  required: true },
    price_value:    { type: 'number',  required: true },
    price_currency: { type: 'string',  required: true },
    section:        { format: 'mongo', required: true },
    description:    { type: 'string',  required: true },
    files:          {
      type: 'array',
      uniqueItems: true,
      items: { format: 'mongo' },
      required: true
    },
    barter_info:    { type: 'string',  required: true },
    delivery:       { type: 'boolean', required: true },
    is_new:         { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create_items = await env.extras.settings.fetch('market_can_create_items');

    if (!can_create_items) throw N.io.FORBIDDEN;
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


  // Fetch draft
  //
  N.wire.before(apiPath, async function fetch_draft(env) {
    env.data.draft = await N.models.market.Draft.findOne({ _id: env.params.draft_id, user: env.user_info.user_id });

    let uploaded = _.keyBy(env.data.draft.all_files);

    // restrict files to only files that were uploaded for this draft
    env.data.files = env.params.files.filter(id => uploaded.hasOwnProperty(id));
  });


  // Check number of images
  //
  N.wire.before(apiPath, async function check_image_count(env) {
    let min_images = await env.extras.settings.fetch('market_items_min_images');
    let max_images = await env.extras.settings.fetch('market_items_max_images');

    // treat invalid settings as "no limit"
    if (min_images >= 0 && max_images >= 0 && min_images > max_images) {
      min_images = max_images = -1;
    }

    if (min_images >= 0) {
      if (env.data.files.length < min_images) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_too_few_images', min_images)
        };
      }
    }

    if (max_images >= 0) {
      if (env.data.files.length > max_images) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_too_many_images', max_images)
        };
      }
    }
  });


  // Check and convert currency
  //
  N.wire.before(apiPath, async function convert_currency(env) {
    // check that price and currency are present and valid,
    // shouldn't happen because restricted on the client
    if (!(env.params.price_value >= 0)) {
      throw N.io.BAD_REQUEST;
    }

    if (!N.config.market.currencies.hasOwnProperty(env.params.price_currency)) {
      throw N.io.BAD_REQUEST;
    }

    let rate = await N.models.market.CurrencyRate.get(env.params.price_currency);
    env.data.base_currency_price = env.params.price_value * rate;
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


  // Create offer
  //
  N.wire.on(apiPath, async function create_offer(env) {
    let files = [];

    for (let file of env.data.files) {
      let new_id = new mongoose.Types.ObjectId();

      files.push(new_id);

      for (let size of uploadSizes) {
        let info = await N.models.core.FileTmp.getInfo(file + (size === 'orig' ? '' : '_' + size));

        if (!info) continue;

        let params = { contentType: info.contentType };

        if (size === 'orig') {
          params._id = new_id;
        } else {
          params.filename = new_id + '_' + size;
        }

        await pump(
          N.models.core.FileTmp.createReadStream(file + (size === 'orig' ? '' : '_' + size)),
          N.models.core.File.createWriteStream(params)
        );
      }
    }

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
    item.files = item.all_files = files;

    if (env.user_info.hb) {
      item.st  = statuses.HB;
      item.ste = statuses.OPEN;
    } else {
      item.st  = statuses.OPEN;
    }

    item.section = env.data.section._id;
    item.user    = env.user_info.user_id;

    item.location = ((await N.models.users.User.findById(env.user_info.user_id).lean(true)) || {}).location;

    await item.save();

    env.data.new_item = item;
  });


  // Remove draft
  //
  N.wire.after(apiPath, async function remove_draft(env) {
    if (env.data.draft) await env.data.draft.remove();
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.market_item_offer_images_fetch(env.data.new_item._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_offers_search_update_by_ids([ env.data.new_item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.market.Section.updateCache(env.data.section._id);
  });


  // Add redirect info
  //
  N.wire.after(apiPath, function redirect_info(env) {
    env.res.redirect_url = N.router.linkTo('market.item.buy', {
      section_hid: env.data.section.hid,
      item_hid:    env.data.new_item.hid
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
