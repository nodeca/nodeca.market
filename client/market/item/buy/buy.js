'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

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
