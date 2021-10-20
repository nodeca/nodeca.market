// Fetch sections for subscriptions
//
'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_sections(env) {
    let subs = env.data.subscriptions.filter(s =>
      s.to_type === N.shared.content_type.MARKET_SECTION_OFFER ||
      s.to_type === N.shared.content_type.MARKET_SECTION_WISH
    );

    // Fetch sections
    let sections = await N.models.market.Section.find().where('_id').in(subs.map(s => s.to)).lean(true);


    // Check permissions subcall
    // (not applicable: market sections are always visible to everyone)


    // Sanitize sections
    sections = await sanitize_section(N, sections, env.user_info);
    sections = _.keyBy(sections, '_id');

    env.res.market_sections = Object.assign(env.res.market_sections || {}, sections);


    // Fill missed subscriptions (for deleted sections)
    //
    let missed = subs.filter(s => !sections[s.to]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
