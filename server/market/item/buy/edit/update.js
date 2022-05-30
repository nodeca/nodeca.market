// Update item
//

'use strict';


const charcount    = require('charcount');
const mongoose     = require('mongoose');
const check_title  = require('nodeca.users/lib/check_title');
const resizeParse  = require('nodeca.users/server/_lib/resize_parse');
const format_price = require('nodeca.market/lib/app/price_format');


module.exports = function (N, apiPath) {

  const uploadSizes = Object.keys(resizeParse(N.config.market.uploads).resize);


  N.validate(apiPath, {
    item_id:        { format: 'mongo', required: true },
    title:          { type: 'string',  required: true },
    price_value:    { anyOf: [ { type: 'number' }, { const: '' } ], required: true },
    price_currency: { type: 'string',  required: false },
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
    is_new:         { type: 'boolean', required: true },
    as_moderator:   { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch item
  //
  N.wire.before(apiPath, async function fetch_item(env) {
    let item = await N.models.market.ItemOffer.findById(env.params.item_id).lean(true);

    if (!item) {
      item = await N.models.market.ItemOfferArchived.findById(env.params.item_id).lean(true);
    }

    if (!item) throw N.io.NOT_FOUND;

    let access_env = { params: {
      items: item,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:market.access.item_offer', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    env.data.item = item;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'market_can_create_items',
      'market_mod_can_edit_items'
    ]);

    // Permit editing as moderator
    if (settings.market_mod_can_edit_items && env.params.as_moderator) return;

    // Permit editing as item owner
    if (!settings.market_can_create_items) throw N.io.FORBIDDEN;

    if (env.user_info.user_id !== String(env.data.item.user)) {
      throw N.io.FORBIDDEN;
    }

    let statuses = N.models.market.ItemOffer.statuses;

    // Only allow owner to edit open items
    if (env.data.item.st !== statuses.OPEN && env.data.item.st !== statuses.OPEN) {
      throw N.io.FORBIDDEN;
    }
  });


  // Check title
  //
  //  - return an error if title is too short (< 10)
  //  - return an error if title is too long (> 100)
  //  - return an error if title has unicode emoji
  //  - normalize title
  //    - trim spaces on both ends
  //    - replace multiple ending punctuations with one (???, !!!)
  //    - convert title to lowercase if title has too many (5+ consecutive) uppercase letters
  //
  N.wire.before(apiPath, async function check_and_normalize_title(env) {
    let title = check_title.normalize_title(env.params.title);
    let min_length = await env.extras.settings.fetch('market_title_min_length');
    let max_length = await env.extras.settings.fetch('market_title_max_length');
    let title_length = charcount(title);
    let error = null;

    if (title_length < min_length)    error = env.t('err_title_too_short', min_length);
    if (title_length > max_length)    error = env.t('err_title_too_long', max_length);
    if (check_title.has_emoji(title)) error = env.t('err_title_emojis');

    if (error) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: error
      };
    }

    env.data.title = title;
  });


  // Fetch section info
  //
  N.wire.before(apiPath, async function fetch_section_info(env) {
    let section = await N.models.market.Section.findById(env.params.section).lean(true);
    if (!section) throw N.io.NOT_FOUND;

    let type_allowed = await N.models.market.Section.checkIfAllowed(section._id, 'offers');
    if (!type_allowed) throw N.io.NOT_FOUND;

    env.data.section = section;

    // Should never happen, restricted on client
    if (section.is_category) throw N.io.BAD_REQUEST;
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
      if (env.params.files.length < min_images) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_too_few_images', min_images)
        };
      }
    }

    if (max_images >= 0) {
      if (env.params.files.length > max_images) {
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
    if (env.data.section.no_price) return;

    if (!N.config.market.currencies.hasOwnProperty(env.params.price_currency)) {
      throw N.io.BAD_REQUEST;
    }

    let min_price = N.config.market.currencies[env.params.price_currency].min_price || 0;

    if (!(env.params.price_value >= min_price)) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_price_too_low', {
          min: format_price(
            min_price,
            env.t(`@market.currencies.${env.params.price_currency}.sign`)
          )
        })
      };
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


  // Filter files, move them all from gridfs_tmp to gridfs
  //
  N.wire.before(apiPath, async function move_files(env) {
    env.data.files = [];
    let all_files = Object.fromEntries(env.data.item.all_files.map(x => [ x.id, x ]));

    for (let file of env.params.files) {
      let file_info = all_files[file];

      // user tried to submit item id without uploading a file?
      if (!file_info) continue;

      // file is already in gridfs
      if (!file_info.tmp) {
        env.data.files.push(file_info.id);
        continue;
      }

      // move from FileTmp to File
      let new_id = new mongoose.Types.ObjectId();

      env.data.files.push(new_id);
      delete all_files[file];
      all_files[new_id] = { id: new_id };

      for (let size of uploadSizes) {
        let info = await N.models.core.FileTmp.getInfo(file + (size === 'orig' ? '' : '_' + size));

        if (!info) continue;

        let params = { contentType: info.contentType };

        if (size === 'orig') {
          params._id = new_id;
        } else {
          params.filename = new_id + '_' + size;
        }

        await N.models.core.File.put(
          N.models.core.FileTmp.createReadStream(file + (size === 'orig' ? '' : '_' + size)),
          params
        );
      }
    }

    // remove all related files from FileTmp,
    // this might result in a broken image if user simultaneously edits the same item in two different tabs
    for (let file of Object.values(all_files)) {
      if (file.tmp) {
        await N.models.core.FileTmp.remove(file, true);
        delete all_files[file.id];
      }
    }

    env.data.all_files = Object.values(all_files);
  });


  // Update item
  //
  N.wire.on(apiPath, async function update_item(env) {
    // save it using model to trigger 'post' hooks (e.g. param_ref update)
    let item = await N.models.market.ItemOffer.findById(env.data.item._id)
                         .lean(false);

    if (!item) {
      item = await N.models.market.ItemOfferArchived.findById(env.data.item._id)
                       .lean(false);
    }

    if (!item) throw N.io.NOT_FOUND;

    item.imports = env.data.parse_result.imports;
    item.import_users = env.data.parse_result.import_users;
    item.title = env.data.title;
    item.html = env.data.parse_result.html;
    item.md = env.params.description;
    item.params = env.data.parse_options;

    if (!env.data.section.no_price) {
      item.price = {
        value:    env.params.price_value,
        currency: env.params.price_currency
      };
      item.base_currency_price = env.data.base_currency_price;
    }

    item.barter_info = env.params.barter_info;
    item.delivery = env.params.delivery;
    item.is_new = env.params.is_new;
    item.files = env.data.files;
    item.section = env.data.section._id;
    item.all_files = env.data.all_files;

    // only update location if user edits his own item,
    // do not update it for moderator actions
    if (!env.params.as_moderator) {
      item.location = (await N.models.users.User.findById(env.user_info.user_id).lean(true))?.location;
    }

    env.data.new_item = await item.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.market.ItemOfferHistory.add(
      {
        old_item: env.data.item,
        new_item: env.data.new_item
      },
      {
        user: env.user_info.user_id,
        role: N.models.market.ItemOfferHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.market_item_offer_images_fetch(env.data.new_item._id).postpone();
  });


  // Clear "similar items" cache (for item offers only)
  //
  N.wire.after(apiPath, async function clear_similar_items_cache(env) {
    await N.models.market.ItemOfferSimilarCache.remove()
                         .where('item').equals(env.data.new_item._id);
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.market_item_offers_search_update_by_ids([ env.data.new_item._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    if (env.data.item.section.toString() !== env.params.section) {
      let old_section = await N.models.market.Section.findById(env.data.item.section).lean(true);

      if (old_section) {
        await N.models.market.Section.updateCache(old_section._id);
      }
    }

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
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
