// Extend `internal:common.abuse_report` to send abuse report for type `MARKET_ITEM_WISH`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - subject_email
// - subject_log
// - template
//
'use strict';


const userInfo = require('nodeca.users/lib/user_info');


function escape_md(text) {
  return text.replace(/([!#$%&*+\-:<=>@[\\\]^_`{}~])/g, '\\$1'); //`
}


module.exports = function (N, apiPath) {

  // Subcall `internal:common.abuse_report` for `MARKET_ITEM_WISH` content type
  //
  N.wire.on('internal:common.abuse_report', async function market_item_offer_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.MARKET_ITEM_WISH) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.market_item_wish', params);
    }
  });


  // Fetch item and section
  //
  N.wire.before(apiPath, async function fetch_item_section(params) {
    params.data.item = await N.models.market.ItemWish.findById(params.report.src).lean(true);

    if (!params.data.item) {
      params.data.item = await N.models.market.ItemWishArchived.findById(params.report.src).lean(true);
    }

    if (!params.data.item) throw N.io.NOT_FOUND;

    params.data.section = await N.models.market.Section.findById(params.data.item.section).lean(true);

    if (!params.data.section) throw N.io.NOT_FOUND;
  });


  // Fetch recipients
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    // send message to all users with infraction permissions
    let groups = await N.models.users.UserGroup.find().select('_id');

    let allowed_groups = [];

    for (let usergroup of groups) {
      let params = {
        usergroup_ids: [ usergroup._id ]
      };

      let can_add_infractions = await N.settings.get('market_mod_can_add_infractions', params, {});

      if (can_add_infractions) allowed_groups.push(usergroup._id);
    }

    let recipients = await N.models.users.User.find()
                               .where('usergroups').in(allowed_groups)
                               .select('_id')
                               .lean(true);

    let user_infos = await userInfo(N, recipients.map(x => x._id));

    let allowed_userinfos = {};

    // double-check all permissions in case a user is disallowed from another
    // group with force=true
    for (let user_id of Object.keys(user_infos)) {
      let user_info = user_infos[user_id];

      let params = {
        user_id: user_info.user_id,
        usergroup_ids: user_info.usergroups
      };

      let can_add_infractions = await N.settings.get('market_mod_can_add_infractions', params, {});

      if (can_add_infractions) allowed_userinfos[user_id] = user_info;
    }

    params.recipients = allowed_userinfos;
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    const TEMPLATE_PATH = 'common.abuse_report.market_item_wish';

    params.subject_log   = `${TEMPLATE_PATH}.subject_log`;
    params.subject_email = `${TEMPLATE_PATH}.subject_email`;
    params.template      = TEMPLATE_PATH;

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;

    if (params.report.data?.move_to) {
      let move_to_section = await N.models.market.Section
                                      .findById(params.report.data.move_to)
                                      .lean(true);

      locals.move_from_link = N.router.linkTo('market.section.wish', {
        section_hid: params.data.section.hid
      });

      locals.move_to_link = N.router.linkTo('market.section.wish', {
        section_hid: move_to_section.hid
      });

      locals.move_from_title = params.data.section.title;
      locals.move_to_title = move_to_section.title;

      locals.src_title = params.data.item.title;
      locals.src_url = N.router.linkTo('market.item.wish', {
        section_hid: params.data.section.hid,
        item_hid:    params.data.item.hid
      });
      locals.move_link = N.router.linkTo('market.item.wish', {
        section_hid: params.data.section.hid,
        item_hid:    params.data.item.hid,
        $anchor: `move_to_${move_to_section.hid}`
      });
    } else {
      locals.src_url = N.router.linkTo('market.item.wish', {
        section_hid: params.data.section.hid,
        item_hid:    params.data.item.hid
      });
      locals.src_text = escape_md(params.data.item.title) + '\n\n' + params.data.item.md;

      // calculate minimum backtick length for ````quote, so it would encapsulate
      // original content (longest backtick sequence plus 1, but at least 3)
      let backtick_seq_len = Math.max.apply(
        null,
        ('`` ' + locals.report_text + ' ' + locals.src_text)
          .match(/`+/g) //`
          .map(s => s.length)
        ) + 1;

      locals.backticks = '`'.repeat(backtick_seq_len);
    }

    if (author) {
      locals.author = author;
      locals.author_link = N.router.linkTo('users.member', { user_hid: author.user_hid });
    }

    params.locals = locals;
  });
};
