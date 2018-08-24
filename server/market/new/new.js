// Create a new offer
//

'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:    { format: 'mongo' },
    $query:      {
      type: 'object',
      properties: {
        buy:     { 'const': '' },
        section: { format: 'mongo' }
      },
      additionalProperties: false
    }
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


  // Load draft if user previously created one
  //
  N.wire.before(apiPath, async function load_draft(env) {
    let draft = await N.models.market.Draft.findById(env.params.draft_id)
                          .lean(true);

    if (draft && String(draft.user) === String(env.user_info.user_id)) {
      env.res.draft = draft.data;
      env.res.draft_id = draft._id;
    }
  });


  // Fetch section tree
  //
  N.wire.on(apiPath, async function fetch_sections(env) {
    let section_info = (await N.models.market.Section.getChildren()).filter(s => !s.is_linked);

    let _ids = section_info.map(s => s._id);

    let sections = await N.models.market.Section.find()
                             .where('_id').in(_ids)
                             .lean(true);

    let sections_by_id = _.keyBy(sections, '_id');

    // sort result in the same order as ids
    env.data.sections = section_info.map(info =>
      Object.assign({}, sections_by_id[info._id], { level: info.level })
    );

    env.res.sections = await sanitize_section(N, env.data.sections, env.user_info);

    env.res.defaults = {
      buy: Object.prototype.hasOwnProperty.call(env.params.$query || {}, 'buy')
    };

    if (env.params.$query && env.params.$query.section) {
      let selected_section = env.res.sections.filter(s => String(s._id) === env.params.$query.section)[0];

      if (selected_section && !selected_section.is_category) {
        env.res.defaults.section = selected_section._id;
      }
    }
  });


  // Fill parse options for description editor
  //
  N.wire.after(apiPath, async function fill_parse_options(env) {
    env.res.parse_options = await N.settings.getByCategory(
      'market_items_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true }
    );
  });


  // Fill available currencies
  //
  N.wire.after(apiPath, async function fill_options(env) {
    env.res.currency_types = Object.keys(N.config.market.currencies);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    await N.wire.emit('internal:market.breadcrumbs_fill', { env });
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'market_items_min_images',
      'market_items_max_images'
    ]));
  });
};
