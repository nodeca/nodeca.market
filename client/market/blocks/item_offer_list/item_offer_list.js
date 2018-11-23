'use strict';


// When user clicks "create dialog" button in usercard popup,
// add title & link to editor.
//
N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
  if (!params || !params.ref) return; // no data to extend
  if (!/^market_list_item_offer:/.test(params.ref)) return; // not our data

  let [ , section_hid, item_hid ] = params.ref.split(':');
  let title = $(`#item${item_hid} .market-list-item-offer__title-text`).text();
  let href  = N.router.linkTo('market.item.buy', { section_hid, item_hid });

  if (title && href) {
    params.text = `Re: [${title}](${href})\n\n`;
  }
});
