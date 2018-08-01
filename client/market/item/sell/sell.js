'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':item_bookmark', function item_bookmark(data) {
    let item_id = data.$this.data('item-id');
    let remove  = data.$this.data('remove') || false;
    let $item   = $('.market-item-sell');

    return N.io.rpc('market.item.sell.bookmark', { item_id, remove }).then(res => {
      if (remove) {
        $item.removeClass('market-item-sell__m-bookmarked');
      } else {
        $item.addClass('market-item-sell__m-bookmarked');
      }

      $item.find('.market-item-sell__bookmarks-count').attr('data-bm-count', res.count);
    });
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_item_sell:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $('.market-item-sell__title').text();
    let href  = N.router.linkTo('market.item.sell', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});
