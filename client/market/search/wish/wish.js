'use strict';


const _   = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');


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
// - active:             true if we're on this page, false otherwise
// - current_offset:     offset of the current item (first in the viewport)
// - item_count:         total amount of items
// - per_page:           amount of items loaded on each request (for prefetch)
// - selected_items:     array of selected items
//
let pageState = {};
let scrollable_list;

let $window = $(window);


function load(start, direction) {
  if (direction !== 'bottom') return null;

  return N.io.rpc('market.search.wish.results',
    Object.assign({}, pageState.search, { skip: start, limit: pageState.per_page })
  ).then(res => {
    pageState.item_count = res.pagination.total;

    return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      max: pageState.item_count
    }).then(() => {
      res.index_offset = res.pagination.chunk_offset;

      return {
        $html: $(N.runtime.render('market.blocks.item_wish_list', res)),
        locals: res,
        offset: res.pagination.chunk_offset,
        reached_end: res.items.length !== pageState.per_page
      };
    });
  }).catch(err => {
    // Section deleted, refreshing the page so user can see the error
    if (err.code === N.io.NOT_FOUND) return N.wire.emit('navigate.reload');
    throw err;
  });
}


function on_list_scroll(item, index/*, item_offset*/) {
  N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
    current: index + 1 // `+1` because offset is zero based
  }).catch(err => N.wire.emit('error', err));
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  let pagination = N.runtime.page_data.pagination;

  pageState.active             = true;
  pageState.search             = N.runtime.page_data.search;
  pageState.current_offset     = -1;
  pageState.item_count         = pagination.total;
  pageState.per_page           = pagination.per_page;
  pageState.selected_items     = [];

  let navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 48;

  $window.scrollTop(0);

  N.io.rpc('market.search.wish.results',
    Object.assign({}, pageState.search, { skip: 0, limit: pageState.per_page })
  ).then(res => {
    pageState.item_count = res.pagination.total;

    return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      max: pageState.item_count
    }).then(() => {
      res.index_offset = res.pagination.chunk_offset; // always 0 here

      // render & inject item list
      let $html = $(N.runtime.render('market.search.wish.results', res));

      return N.wire.emit('navigate.content_update', {
        $: $html,
        locals: res,
        $replace: $('.market-search-wish__results')
      }).then(() => {
        scrollable_list = new ScrollableList({
          N,
          list_selector:               '.market-search-wish__item-list',
          item_selector:               '.market-list-item-wish',
          placeholder_bottom_selector: '.market-search-wish__loading-next',
          get_content_id:              item => $(item).data('item-index'),
          load,
          reached_top:                 res.pagination.chunk_offset === 0,
          reached_bottom:              res.items.length !== pageState.per_page,
          index_offset:                res.pagination.chunk_offset,
          navbar_height,
          on_list_scroll
        });
      });
    });
  }).catch(err => {
    N.wire.emit('error', err);
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  if (scrollable_list) scrollable_list.destroy();
  scrollable_list = null;
  pageState = {};
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


///////////////////////////////////////////////////////////////////////////////
// Many items selection
//

function updateToolbar() {
  $('.market-search-wish__toolbar-controls')
    .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', {
      section:      N.runtime.page_data.section,
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
    let s = `.market-list-item-wish[data-item-id="${itemId}"]`;
    container.find(s).addBack(s)
      .addClass('market-list-item-wish__m-selected')
      .find('.market-list-item-wish__select-cb')
      .prop('checked', true);
  });
}

N.wire.on('navigate.content_update', function update_selected_items(data) {
  if (!pageState.active) return; // not on this page
  update_selection_state(data.$);
});


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
  N.wire.on('market.blocks.item_wish_list:item_check', function market_item_select(data) {
    // this handler is supposed to fire on multiple pages, make sure we got the right one
    if (!pageState.active) return;

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
  N.wire.on(module.apiPath + ':items_unselect', function unselect_many() {
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


  // Delete items
  //
  N.wire.on(module.apiPath + ':delete_many', function delete_many() {
    let params = {
      canDeleteHard: N.runtime.page_data.settings.market_mod_can_hard_delete_items
    };

    return Promise.resolve()
      .then(() => N.wire.emit('market.section.wish.item_delete_many_dlg', params))
      .then(() => {
        let request = {
          item_ids: pageState.selected_items,
          method: params.method
        };

        if (params.reason) request.reason = params.reason;

        return N.io.rpc('market.item.wish.many.destroy_many', request);
      })
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();

        return N.wire.emit('notify.info', t('many_items_deleted'));
      })
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
      .then(() => N.io.rpc('market.item.wish.many.close_many', request))
      .then(() => {
        pageState.selected_items = [];
        save_selected_items_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_items_closed')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Move items
  //
  N.wire.on(module.apiPath + ':move_many', function move_many() {
    let params = {};

    return Promise.resolve()
      .then(() => N.wire.emit('market.section.wish.item_move_many_dlg', params))
      .then(() => {
        let request = {
          section_hid_to: params.section_hid_to,
          item_ids: pageState.selected_items
        };

        return N.io.rpc('market.item.wish.many.move_many', request);
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
