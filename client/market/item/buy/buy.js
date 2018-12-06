'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function item_report(data) {
    let params = { messages: t('@market.abuse_report.messages') };
    let id = data.$this.data('item-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('market.item.buy.abuse_report', { item_id: id, message: params.message }))
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Show IP
  //
  N.wire.on(module.apiPath + ':show_ip', function show_ip(data) {
    return N.wire.emit('market.item.buy.ip_info_dlg', { item_id: data.$this.data('item-id') });
  });


  // Add infraction
  //
  N.wire.on(module.apiPath + ':add_infraction', function add_infraction(data) {
    let item_id = data.$this.data('item-id');
    let params = { item_id };

    return Promise.resolve()
      .then(() => N.wire.emit('users.blocks.add_infraction_dlg', params))
      .then(() => N.io.rpc('market.item.buy.add_infraction', params))
      .then(() => N.wire.emit('navigate.reload'))
      .then(() => N.wire.emit('notify.info', t('infraction_added')));
  });


  // Move item to another section
  //
  N.wire.on(module.apiPath + ':move', function item_move(data) {
    let item_id = data.$this.data('item-id');
    let params = { section_hid_from: N.runtime.page_data.section_hid };

    return Promise.resolve()
      .then(() => N.wire.emit('market.item.buy.item_move_dlg', params))
      .then(() => {
        let request = {
          section_hid_to: params.section_hid_to,
          item_id
        };

        return N.io.rpc('market.item.buy.move', request);
      })
      .then(() => N.wire.emit('notify.info', t('move_item_done')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close item handler
  //
  N.wire.on(module.apiPath + ':close', function item_close(data) {
    let params = {
      item_id: data.$this.data('item-id'),
      as_moderator: data.$this.data('as-moderator') || false
    };

    return Promise.resolve()
      .then(() => N.io.rpc('market.item.buy.close', params))
      .then(() => N.wire.emit('navigate.reload'))
      .then(() => N.wire.emit('notify.info', t('close_item_done')));
  });


  // Open item handler
  //
  N.wire.on(module.apiPath + ':open', function item_open(data) {
    let params = {
      item_id: data.$this.data('item-id'),
      as_moderator: data.$this.data('as-moderator') || false
    };

    return Promise.resolve()
      .then(() => N.io.rpc('market.item.buy.open', params))
      .then(() => N.wire.emit('navigate.reload'))
      .then(() => N.wire.emit('notify.info', t('open_item_done')));
  });


  // Delete item
  //
  N.wire.on(module.apiPath + ':delete', function item_delete(data) {
    let request = {
      item_id: data.$this.data('item-id')
    };
    let params = {
      canDeleteHard: N.runtime.page_data.settings.market_mod_can_hard_delete_items,
      asModerator: true
    };

    return Promise.resolve()
      .then(() => N.wire.emit('market.item.buy.item_delete_dlg', params))
      .then(() => {
        request.method = params.method;
        if (params.reason) request.reason = params.reason;
        return N.io.rpc('market.item.buy.destroy', request);
      })
      .then(() =>
        // redirects to section (for open) or user item list (for closed)
        N.wire.emit('navigate.to', $('.navbar__level-up').attr('href'))
      );
  });


  // Undelete item
  //
  N.wire.on(module.apiPath + ':undelete', function item_undelete(data) {
    let request = {
      item_id: data.$this.data('item-id')
    };

    return Promise.resolve()
      .then(() => N.io.rpc('market.item.buy.undelete', request))
      .then(() => N.wire.emit('navigate.reload'))
      .then(() => N.wire.emit('notify.info', t('undelete_item_done')));
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':item_bookmark', function item_bookmark(data) {
    let item_id = data.$this.data('item-id');
    let remove  = data.$this.data('remove') || false;
    let $item   = $('.market-item-buy');

    return N.io.rpc('market.item.buy.bookmark', { item_id, remove }).then(res => {
      if (remove) {
        $item.removeClass('market-item-buy__m-bookmarked');
      } else {
        $item.addClass('market-item-buy__m-bookmarked');
      }

      $item.find('.market-item-buy__bookmarks-count').attr('data-bm-count', res.count);
    });
  });


  // Show history popup
  //
  N.wire.on(module.apiPath + ':history', function item_history(data) {
    let item_id = data.$this.data('item-id');

    return Promise.resolve()
      .then(() => N.io.rpc('market.item.buy.show_history', { item_id }))
      .then(res => N.wire.emit('market.item.buy.item_history_dlg', res));
  });


  // User clicks on "contact" button, create dialog with necessary info
  // (this is the same API that usercard is using, so users.dialog.create:begin hook below works)
  //
  N.wire.on(module.apiPath + ':contact', function create_dialog(data) {
    return N.wire.emit('users.dialog.create:begin', {
      nick: data.$this.data('to-nick'),
      hid: data.$this.data('to-hid'),
      ref: data.$this.data('ref')
    });
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_item_buy:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $('.market-item-buy__title').text();
    let href  = N.router.linkTo('market.item.buy', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});
