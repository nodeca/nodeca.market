'use strict';


const _   = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });


// Page state
//
// - search:
//   - query:              search query (String)
//   - section:            only in this section and its subsections (ObjectId)
//   - search_all:         ignore section, search everywhere (Boolean)
//   - range:              search within this many kms from user location
//                         (Number, rounded to either 100 or 200)
//   - sort:               sort type (`rel` or `date`)
//
// - first_offset:       offset of the first item in the DOM
// - current_offset:     offset of the current item (first in the viewport)
// - reached_end:        true if no more pages exist below last loaded one
// - next_loading_start: time when current xhr request for the next page is started
// - item_count:         total amount of items
// - per_page:           amount of items loaded on each request (for prefetch)
// - bottom_marker:      last item id (for prefetch)
// - first_page_loaded:  true if results block (section stats + first N results) has been loaded
// - selected_items:     array of selected items
//
let pageState = {};

let $window = $(window);

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 48;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


// Show/hide loading placeholders when new items are fetched,
// adjust scroll when adding/removing top placeholder
//
function reset_loading_placeholders() {
  let next = $('.market-search-wish__loading-next');

  // if last item is loaded, hide bottom placeholder
  if (pageState.reached_end) {
    next.addClass('d-none');
  } else {
    next.removeClass('d-none');
  }
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  let pagination = N.runtime.page_data.pagination;

  pageState.search             = N.runtime.page_data.search;
  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.item_count         = pagination.total;
  pageState.per_page           = pagination.per_page;
  pageState.reached_end        = false;
  pageState.next_loading_start = 0;
  pageState.bottom_marker      = 0;
  pageState.first_page_loaded  = false;
  pageState.selected_items     = [];

  $window.scrollTop(0);
});


// Init search form
//
N.wire.on('navigate.done:' + module.apiPath, function search_form_init() {
  return N.wire.emit('market.blocks.search_form_wish:init');
});


// Inject sort argument into the query
//
N.wire.before('market.blocks.search_form_wish:search', function inject_sort(data) {
  data.fields.sort = $('.market-search-wish__select-order').val();
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;


N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
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
    let items         = document.getElementsByClassName('market-search-wish-item');
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

  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of item list, check if we can
  // load more pages from the server
  //

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (pageState.reached_end) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.next_loading_start = now;

    N.io.rpc('market.search.wish.results',
      Object.assign({}, pageState.search, { skip: pageState.bottom_marker, limit: pageState.per_page })
    ).then(res => {
      if (res.reached_end) {
        pageState.reached_end = true;
        reset_loading_placeholders();
      }

      pageState.bottom_marker += res.items.length;
      pageState.first_offset  = res.pagination.chunk_offset - $('.market-search-wish-item').length;
      pageState.item_count    = res.pagination.total;

      let navigate_update_params;

      if (pageState.first_page_loaded) {
        let $result = $(N.runtime.render('market.blocks.search_item_wish_list', res));

        navigate_update_params = {
          $:      $result,
          locals: res,
          $after: $('.market-search-wish__item-list > :last')
        };
      } else {
        let $result = $(N.runtime.render('market.search.wish.results', res));

        navigate_update_params = {
          $:        $result,
          locals:   res,
          $replace: $('.market-search-wish__results')
        };
        pageState.first_page_loaded = true;
      }

      return N.wire.emit('navigate.update', navigate_update_params).then(() => {
        // Update selection state
        _.intersection(pageState.selected_items, _.map(res.items, '_id')).forEach(itemId => {
          $(`.market-search-wish-item[data-item-id="${itemId}"]`)
            .addClass('market-search-wish-item__m-selected')
            .find('.market-search-wish-item__select-cb')
            .prop('checked', true);
        });

        // reset lock
        pageState.next_loading_start = 0;

        return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
          max: pageState.item_count
        });
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_market_items(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^market_search_wish_item:/.test(params.ref)) return; // not our data

    let [ , section_hid, item_hid ] = params.ref.split(':');
    let title = $(`#item${item_hid} .market-search-wish-item__title-text`).text();
    let href  = N.router.linkTo('market.item.wish', { section_hid, item_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});


///////////////////////////////////////////////////////////////////////////////
// Many items selection
//

function updateToolbar() {
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
  selected_items_key = `market_search_wish_selected_items_${N.runtime.user_hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_items_key)
    .then(ids => {
      ids = ids || [];
      pageState.selected_items = ids;
      pageState.selected_items.forEach(itemId => {
        $(`.market-search-wish-item[data-item-id="${itemId}"]`)
          .addClass('market-search-wish-item__m-selected')
          .find('.market-search-wish-item__select-cb')
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
        let $item = data.$this.closest('.market-search-wish-item');
        let $start = $many_select_start;
        let itemsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
        if ($start.index() < $item.index()) {
          // Get items between start and current
          itemsBetween = $start.nextUntil($item, '.market-search-wish-item');
        } else {
          // Between current and start (in reverse order)
          itemsBetween = $item.nextUntil($start, '.market-search-wish-item');
        }

        itemsBetween.each(function () {
          let id = $(this).data('item-id');

          if (pageState.selected_items.indexOf(id) === -1) {
            pageState.selected_items.push(id);
          }

          $(this).find('.market-search-wish-item__select-cb').prop('checked', true);
          $(this).addClass('market-search-wish-item__m-selected');
        });

        pageState.selected_items.push(itemId);
        $item.addClass('market-search-wish-item__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $item = data.$this.closest('.market-search-wish-item');

        $many_select_start = $item;
        $item.addClass('market-search-wish-item__m-selected');
        pageState.selected_items.push(itemId);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.market-search-wish-item').addClass('market-search-wish-item__m-selected');
        pageState.selected_items.push(itemId);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_items.indexOf(itemId) !== -1) {
      // Unselect
      //
      data.$this.closest('.market-search-wish-item').removeClass('market-search-wish-item__m-selected');
      pageState.selected_items = _.without(pageState.selected_items, itemId);
    }

    save_selected_items();
    return updateToolbar();
  });


  // Unselect all items
  //
  N.wire.on(module.apiPath + ':items_unselect', function market_items_unselect() {
    pageState.selected_items = [];

    $('.market-search-wish-item__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.market-search-wish-item')
        .removeClass('market-search-wish-item__m-selected');
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
