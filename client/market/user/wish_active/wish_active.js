'use strict';


const _   = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });


// Page state
//
// - hid:                current user hid
// - first_offset:       offset of the first item in the DOM
// - current_offset:     offset of the current item (first in the viewport)
// - selected_items:     array of selected items in current section
//
let pageState = {};

let $window = $(window);

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 48;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination    = N.runtime.page_data.pagination;

  pageState.hid                = data.params.user_hid;
  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.selected_items     = [];

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let el = $('#item' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbarHeight - TOP_OFFSET + data.state.offset);
      return;
    }
  } else if (data.params.$query && data.params.$query.from) {
    let el = $('#item' + Number(data.params.$query.from));

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('market-list-item-wish__m-highlight');
      return;
    }
  }

  // If we're on the first page, scroll to the top;
  // otherwise scroll to the first item
  //
  if (pagination.chunk_offset > 1 && $('.market-user__item-list').length) {
    $window.scrollTop($('.market-user__item-list').offset().top - $('.navbar').height());

  } else {
    $window.scrollTop(0);
  }
});


/////////////////////////////////////////////////////////////////////
// Change URL when user scrolls the page
//
// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let locationScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function location_updater_init() {
  if ($('.market-user__item-list').length === 0) return;

  locationScrollHandler = _.debounce(function update_location_on_scroll() {
    let items         = document.getElementsByClassName('market-list-item-wish');
    let itemThreshold = navbarHeight + TOP_OFFSET;
    let offset;
    let currentIdx;

    // Get offset of the first item in the viewport;
    // "-1" means user sees navigation above all items
    //
    currentIdx = _.sortedIndexBy(items, null, item => {
      if (!item) { return itemThreshold; }
      return item.getBoundingClientRect().top;
    }) - 1;

    let href = null;
    let state = null;

    offset = currentIdx + pageState.first_offset;

    if (currentIdx >= 0 && items.length) {
      state = {
        hid:    $(items[currentIdx]).data('item-hid'),
        offset: itemThreshold - items[currentIdx].getBoundingClientRect().top
      };
    }

    // save current offset, and only update url if offset is different
    if (pageState.current_offset !== offset) {
      let $query = {};

      if (currentIdx >= 0) {
        $query.from = $(items[currentIdx]).data('item-hid');
      }

      href = N.router.linkTo('market.user.wish_active', {
        user_hid: pageState.hid,
        $query
      });

      if (pageState.current_offset < 0 && offset >= 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      } else if (pageState.current_offset >= 0 && offset < 0) {
        $('meta[name="robots"]').remove();
      }

      pageState.current_offset = offset;
    }

    N.wire.emit('navigate.replace', { href, state });
  }, 500);

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(() => {
    $window.on('scroll', locationScrollHandler);
  }, 1);
});

N.wire.on('navigate.exit:' + module.apiPath, function location_updater_teardown() {
  if (!locationScrollHandler) return;
  locationScrollHandler.cancel();
  $window.off('scroll', locationScrollHandler);
  locationScrollHandler = null;
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;


N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  if ($('.market-user__item-list').length === 0) return;

  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    // If we scroll below page head, show the secondary navbar
    //
    let head = document.getElementsByClassName('page-head');

    if (head.length && head[0].getBoundingClientRect().bottom > navbarHeight) {
      $('.navbar').removeClass('navbar__m-secondary');
    } else {
      $('.navbar').addClass('navbar__m-secondary');
    }

    // Update progress bar
    //
    let items         = document.getElementsByClassName('market-list-item-wish');
    let itemThreshold = navbarHeight + TOP_OFFSET;
    let offset;
    let currentIdx;

    // Get offset of the first item in the viewport
    //
    currentIdx = _.sortedIndexBy(items, null, e => {
      if (!e) { return itemThreshold; }
      return e.getBoundingClientRect().top;
    }) - 1;

    offset = currentIdx + pageState.first_offset;

    N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      current: offset + 1 // `+1` because offset is zero based
    }).catch(err => N.wire.emit('error', err));
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(() => {
    $window.on('scroll', progressScrollHandler);
  });

  // execute it once on page load
  progressScrollHandler();
});


N.wire.on('navigate.exit:' + module.apiPath, function progress_updater_teardown() {
  if (!progressScrollHandler) return;
  progressScrollHandler.cancel();
  $window.off('scroll', progressScrollHandler);
  progressScrollHandler = null;
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_section_init_handlers() {
  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    $window.scrollTop(0);
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    $window.scrollTop($(document).height());
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


// Load previously selected items
//
N.wire.on('navigate.done:' + module.apiPath, function market_load_previously_selected_items() {
  selected_items_key = `market_user_wish_active_selected_items_${N.runtime.user_hid}_${pageState.hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_items_key)
    .then(ids => {
      ids = ids || [];
      pageState.selected_items = ids;
      pageState.selected_items.forEach(itemId => {
        $(`.market-list-item-wish[data-item-id="${itemId}"]`)
          .addClass('market-list-item-wish__m-selected')
          .find('.market-list-item-wish__select-cb')
          .prop('checked', true);
      });

      return ids.length ? updateToolbar() : null;
    })
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function market_item_selection_init() {

  // Update array of selected items on selection change
  //
  N.wire.on(module.apiPath + ':item_check', function market_item_select(data) {
    let itemId = data.$this.data('item-id');

    if (data.$this.is(':checked') && pageState.selected_items.indexOf(itemId) === -1) {
      // Select
      //
      if ($many_select_start) {

        // If many select started
        //
        let $item = data.$this.closest('.market-list-item-wish');
        let $start = $many_select_start;
        let itemsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
        if ($start.index() < $item.index()) {
          // Get items between start and current
          itemsBetween = $start.nextUntil($item, '.market-list-item-wish');
        } else {
          // Between current and start (in reverse order)
          itemsBetween = $item.nextUntil($start, '.market-list-item-wish');
        }

        itemsBetween.each(function () {
          let id = $(this).data('item-id');

          if (pageState.selected_items.indexOf(id) === -1) {
            pageState.selected_items.push(id);
          }

          $(this).find('.market-list-item-wish__select-cb').prop('checked', true);
          $(this).addClass('market-list-item-wish__m-selected');
        });

        pageState.selected_items.push(itemId);
        $item.addClass('market-list-item-wish__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $item = data.$this.closest('.market-list-item-wish');

        $many_select_start = $item;
        $item.addClass('market-list-item-wish__m-selected');
        pageState.selected_items.push(itemId);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.market-list-item-wish').addClass('market-list-item-wish__m-selected');
        pageState.selected_items.push(itemId);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_items.indexOf(itemId) !== -1) {
      // Unselect
      //
      data.$this.closest('.market-list-item-wish').removeClass('market-list-item-wish__m-selected');
      pageState.selected_items = _.without(pageState.selected_items, itemId);
    }

    save_selected_items();
    return updateToolbar();
  });


  // Unselect all items
  //
  N.wire.on(module.apiPath + ':items_unselect', function market_items_unselect() {
    pageState.selected_items = [];

    $('.market-list-item-wish__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.market-list-item-wish')
        .removeClass('market-list-item-wish__m-selected');
    });

    save_selected_items();
    return updateToolbar();
  });
});


// Teardown many item selection
//
N.wire.on('navigate.exit:' + module.apiPath, function market_item_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
