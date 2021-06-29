// Create a new offer
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    draft_id:    { format: 'mongo' },
    $query:      {
      type: 'object',
      properties: {
        wish:    { const: '' },
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


  // Fill default params
  //
  N.wire.on(apiPath, async function fill_defaults(env) {
    env.res.defaults = {
      wish: Object.prototype.hasOwnProperty.call(env.params.$query || {}, 'wish')
    };

    if (env.params.$query?.section) {
      let selected_section = await N.models.market.Section.findById(env.params.$query.section).lean(true);

      if (selected_section && !selected_section.is_category) {
        env.res.defaults.section = selected_section._id;
      }
    }
  });


  // Fill sections tree by subcall
  //
  N.wire.after(apiPath, async function fill_sections_tree(env) {
    env.data.section_item_type = 'offers';
    await N.wire.emit('internal:market.sections_tree', env);
    env.res.sections_sell = env.res.sections;
    env.res.sections = null;

    env.data.section_item_type = 'wishes';
    await N.wire.emit('internal:market.sections_tree', env);
    env.res.sections_buy = env.res.sections;
    env.res.sections = null;
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
    let c = N.config.market.currencies || {};

    env.res.currency_types = Object.keys(c)
                               .sort((a, b) => (c[a]?.priority ?? 100) - (c[b]?.priority ?? 100));
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
