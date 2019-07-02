'use strict';


const _   = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');


// Page state
//
// - hid:                current user hid
// - active:             true if we're on this page, false otherwise
// - current_offset:     offset of the current item (first in the viewport)
// - item_count:         total amount of items
// - selected_items:     array of selected items in current section
//
let pageState = {};
let scrollable_list;

let $window = $(window);


function load(start, direction) {
  return N.io.rpc('market.user.buy_closed.list.by_range', {
    user_hid: pageState.hid,
    start,
    before:   direction === 'top' ? N.runtime.page_data.pagination.per_page : 0,
    after:    direction === 'bottom' ? N.runtime.page_data.pagination.per_page : 0
  }).then(res => {
    pageState.item_count = res.pagination.total;

    return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      max: pageState.item_count
    }).then(() => {
      res.index_offset = res.pagination.chunk_offset;

      return {
        $html: $(N.runtime.render('market.blocks.item_offer_list', res)),
        locals: res,
        offset: res.pagination.chunk_offset,
        reached_end: res.items.length !== N.runtime.page_data.pagination.per_page
      };
    });
  }).catch(err => {
    // User deleted, refreshing the page so user can see the error
    if (err.code === N.io.NOT_FOUND) return N.wire.emit('navigate.reload');
    throw err;
  });
}


// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let update_url = _.debounce((item, index, item_offset) => {
  let href, state;

  if (item) {
    state = {
      hid:    $(item).data('item-hid'),
      offset: item_offset
    };
  }

  // save current offset, and only update url if current_item is different
  if (pageState.current_offset !== index) {
    let $query = {};

    if (item) $query.from = $(item).data('item-hid');

    href = N.router.linkTo('market.user.buy_closed', {
      user_hid: pageState.hid,
      $query
    });

    if ((pageState.current_offset >= 0) !== (index >= 0) && !pageState.tag) {
      $('meta[name="robots"]').remove();

      if (index >= 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      }
    }

    pageState.current_offset = index;
  }

  N.wire.emit('navigate.replace', { href, state })
        .catch(err => N.wire.emit('error', err));
}, 500);


function on_list_scroll(item, index, item_offset) {
  N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
    current: index + 1 // `+1` because offset is zero based
  }).catch(err => N.wire.emit('error', err));

  update_url(item, index, item_offset);
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination    = N.runtime.page_data.pagination,
      last_item_hid = $('.market-user').data('last-item-hid');

  pageState.active             = true;
  pageState.hid                = data.params.user_hid;
  pageState.current_offset     = -1;
  pageState.item_count         = pagination.total;
  pageState.selected_items     = [];

  let navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 48;

  let scroll_done = false;

  if (!scroll_done && data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let el = $('#item' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height + data.state.offset);
      scroll_done = true;
    }
  }

  if (!scroll_done && data.params.$query && data.params.$query.from) {
    let el = $('#item' + Number(data.params.$query.from));

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height);
      el.addClass('market-list-item-offer__m-highlight');
      scroll_done = true;
    }
  }

  // If we're on the first page, scroll to the top;
  // otherwise scroll to the first item
  //
  if (!scroll_done) {
    if (pagination.chunk_offset > 1 && $('.market-user__item-list').length) {
      $window.scrollTop($('.market-user__item-list').offset().top - navbar_height);
    } else {
      $window.scrollTop(0);
    }
    scroll_done = true;
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  scrollable_list = new ScrollableList({
    N,
    list_selector:               '.market-user__item-list',
    item_selector:               '.market-list-item-offer',
    placeholder_top_selector:    '.market-user__loading-prev',
    placeholder_bottom_selector: '.market-user__loading-next',
    get_content_id:              item => $(item).data('item-id'),
    load,
    reached_top:                 pagination.chunk_offset === 0,
    reached_bottom:              last_item_hid === $('.market-user__item-list > :last').data('item-hid'),
    index_offset:                pagination.chunk_offset,
    navbar_height,
    // whenever there are more than 600 items, cut off-screen items down to 400
    need_gc:                     count => (count > 600 ? count - 400 : 0),
    on_list_scroll
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  scrollable_list.destroy();
  scrollable_list = null;
  update_url.cancel();
  pageState = {};
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_section_init_handlers() {

  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first item is already loaded, scroll to the top
    if (scrollable_list.reached_top) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'market.user.buy_closed',
      params: {
        user_hid: pageState.hid
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    // if the last item is already loaded, scroll to the bottom
    if (scrollable_list.reached_bottom) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'market.user.buy_closed',
      params: {
        user_hid: pageState.hid,
        $query: {
          from: String($('.market-user').data('last-item-hid'))
        }
      }
    });
  });
});


///////////////////////////////////////////////////////////////////////////////
// Many items selection
//

function updateToolbar() {
  $('.market-user__toolbar-controls')
    .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', {
      settings:     N.runtime.page_data.settings,
      selected_cnt: pageState.selected_items.length
    }));
}


let selected_items_key;
// Flag shift key pressed
let shift_key_pressed = false;
// DOM element of first selected item (for many check)
let $many_select_start;


// Handle shift keyup event
//
function key_up(event) {
  // If shift still pressed
  if (event.shiftKey) return;

  shift_key_pressed = false;
}


// Handle shift keydown event
//
function key_down(event) {
  if (event.shiftKey) {
    shift_key_pressed = true;
  }
}


// Save selected items + debounced
//
function save_selected_items_immediate() {
  if (pageState.selected_items.length) {
    // Expire after 1 day
    bag.set(selected_items_key, pageState.selected_items, 60 * 60 * 24).catch(() => {});
  } else {
    bag.remove(selected_items_key).catch(() => {});
  }
}
const save_selected_items = _.debounce(save_selected_items_immediate, 500);


function update_selection_state(container) {
  pageState.selected_items.forEach(itemId => {
    let s = `.market-list-item-offer[data-item-id="${itemId}"]`;
    container.find(s).addBack(s)
      .addClass('market-list-item-offer__m-selected')
      .find('.market-list-item-offer__select-cb')
      .prop('checked', true);
  });
}

N.wire.on('navigate.update', function update_selected_items(data) {
  if (!pageState.active) return; // not on this page
  update_selection_state(data.$);
});


// Load previously selected items
//
N.wire.on('navigate.done:' + module.apiPath, function market_load_previously_selected_items() {
  selected_items_key = `market_user_buy_closed_selected_items_${N.runtime.user_hid}_${pageState.hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_items_key)
    .then(ids => {
      ids = ids || [];
      pageState.selected_items = ids;
      update_selection_state($(document));

      return ids.length ? updateToolbar() : null;
    })
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_item_selection_init() {

  // Update array of selected items on selection change
  //
  N.wire.on('market.blocks.item_offer_list:item_check', function market_item_select(data) {
    // this handler is supposed to fire on multiple pages, make sure we got the right one
    if (!pageState.active) return;

    let itemId = data.$this.data('item-id');

    if (data.$this.is(':checked') && pageState.selected_items.indexOf(itemId) === -1) {
      // Select
      //
      if ($many_select_start) {

        // If many select started
        //
        let $item = data.$this.closest('.market-list-item-offer');
        let $start = $many_select_start;
        let itemsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
        if ($start.index() < $item.index()) {
          // Get items between start and current
          itemsBetween = $start.nextUntil($item, '.market-list-item-offer');
        } else {
          // Between current and start (in reverse order)
          itemsBetween = $item.nextUntil($start, '.market-list-item-offer');
        }

        itemsBetween.each(function () {
          let id = $(this).data('item-id');

          if (pageState.selected_items.indexOf(id) === -1) {
            pageState.selected_items.push(id);
          }

          $(this).find('.market-list-item-offer__select-cb').prop('checked', true);
          $(this).addClass('market-list-item-offer__m-selected');
        });

        pageState.selected_items.push(itemId);
        $item.addClass('market-list-item-offer__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $item = data.$this.closest('.market-list-item-offer');

        $many_select_start = $item;
        $item.addClass('market-list-item-offer__m-selected');
        pageState.selected_items.push(itemId);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.market-list-item-offer').addClass('market-list-item-offer__m-selected');
        pageState.selected_items.push(itemId);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_items.indexOf(itemId) !== -1) {
      // Unselect
      //
      data.$this.closest('.market-list-item-offer').removeClass('market-list-item-offer__m-selected');
      pageState.selected_items = _.without(pageState.selected_items, itemId);
    }

    save_selected_items();
    return updateToolbar();
  });


  // Unselect all items
  //
  N.wire.on(module.apiPath + ':items_unselect', function unselect_many() {
    pageState.selected_items = [];

    $('.market-list-item-offer__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.market-list-item-offer')
        .removeClass('market-list-item-offer__m-selected');
    });

    save_selected_items();
    return updateToolbar();
  });


  // Delete items
  //
  N.wire.on(module.apiPath + ':delete_many', function delete_many() {
    let params = {
      canDeleteHard: N.runtime.page_data.settings.market_mod_can_hard_delete_items
    };

    return Promise.resolve()
      .then(() => N.wire.emit('market.blocks.item_delete_many_dlg', params))
      .then(() => {
        let request = {
          item_ids: pageState.selected_items,
          method: params.method
        };

        if (params.reason) request.reason = params.reason;

        return N.io.rpc('market.item.buy.many.destroy_many', request);
      })
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();

        return N.wire.emit('notify.info', t('many_items_deleted'));
      })
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Undelete items
  //
  N.wire.on(module.apiPath + ':undelete_many', function undelete_many() {
    let request = {
      item_ids: pageState.selected_items
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
      .then(() => N.io.rpc('market.item.buy.many.undelete_many', request))
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_items_undeleted')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close items
  //
  N.wire.on(module.apiPath + ':close_many', function close_many() {
    let request = {
      item_ids: pageState.selected_items
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_close_confirm')))
      .then(() => N.io.rpc('market.item.buy.many.close_many', request))
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_items_closed')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Open items
  //
  N.wire.on(module.apiPath + ':open_many', function open_many() {
    let request = {
      item_ids: pageState.selected_items
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_open_confirm')))
      .then(() => N.io.rpc('market.item.buy.many.open_many', request))
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_items_opened')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Move items
  //
  N.wire.on(module.apiPath + ':move_many', function move_many() {
    let params = {};

    return Promise.resolve()
      .then(() => N.wire.emit('market.blocks.item_move_many_dlg', params))
      .then(() => {
        let request = {
          section_hid_to: params.section_hid_to,
          item_ids: pageState.selected_items
        };

        return N.io.rpc('market.item.buy.many.move_many', request);
      })
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_items_moved')))
      .then(() => N.wire.emit('navigate.reload'));
  });
});


// Teardown many item selection
//
N.wire.on('navigate.exit:' + module.apiPath, function market_item_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
