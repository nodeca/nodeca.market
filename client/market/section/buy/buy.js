'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_section_buy_item:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $(`#item${item_hid} .market-section-buy-item__title-text`).text();
    let href  = N.router.linkTo('market.item.buy', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});
