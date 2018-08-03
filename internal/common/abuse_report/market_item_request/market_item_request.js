// Extend `internal:common.abuse_report` to send abuse report for type `MARKET_ITEM_REQUEST`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - email_templates - { body, subject }
// - log_templates - { body, subject }
//
//
'use strict';


const _        = require('lodash');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Subcall `internal:common.abuse_report` for `MARKET_ITEM_REQUEST` content type
  //
  N.wire.on('internal:common.abuse_report', async function market_item_offer_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.MARKET_ITEM_REQUEST) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.market_item_request', params);
    }
  });


  // Fetch item and section
  //
  N.wire.before(apiPath, async function fetch_item_section(params) {
    params.data.item = await N.models.market.ItemRequest.findById(params.report.src).lean(true);

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

    let user_infos = await userInfo(N, _.map(recipients, '_id'));

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

    params.log_templates = {
      body: 'common.abuse_report.market_item_request.log_templates.body',
      subject: 'common.abuse_report.market_item_request.log_templates.subject'
    };

    params.email_templates = {
      body: 'common.abuse_report.market_item_request.email_templates.body',
      subject: 'common.abuse_report.market_item_request.email_templates.subject'
    };

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.item_url = N.router.linkTo('market.item.buy', {
      section_hid: params.data.section.hid,
      item_hid:    params.data.item.hid
    });
    locals.item_title = params.data.item.title;
    locals.item_desc_text = params.data.item.md;
    locals.item_desc_html = params.data.item.html;
    locals.recipients = _.values(params.recipients);

    if (author) locals.author = author;

    params.locals = locals;
  });
};
