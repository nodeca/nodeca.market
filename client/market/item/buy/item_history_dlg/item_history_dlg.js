// Popup dialog to show post history
//
'use strict';


const price_format = require('nodeca.market/lib/app/price_format');
const itemStatuses = '$$ JSON.stringify(N.models.market.ItemOffer.statuses) $$';

let $dialog;


// Load dependencies
//
N.wire.before(module.apiPath, function load_deps() {
  return N.loader.loadAssets('vendor.diff');
});


// Concatenate post and attachment info into diffable string
//
function get_source(post) {
  let result = post.md;

  // make sure source ends with newline
  result = result.replace(/\n?$/, '\n');

  // add attachments
  if (post.files && post.files.length) {
    result += '\n';
    result += post.files.map(function (item) {
      return '![](' + N.router.linkTo('core.gridfs', { bucket: item }) + ')';
    }).join('\n');
    result += '\n';
  }

  return result;
}


function has_status(status_set, st) {
  return status_set.st === st || status_set.ste === st;
}


// Detect changes in topic statuses
//
// Input:
//  - old_topic - topic object before changes
//  - new_topic - topic object after changes
//
// Output: an array of actions that turn old_topic into new_topic
//
// Example: if old_topic={st:OPEN}, new_topic={st:CLOSED}
// means user has closed this topic
//
// Because subsequent changes are merged, it may output multiple actions,
// e.g. if old_topic={st:OPEN}, new_topic={st:PINNED,ste:CLOSED},
// actions should be pin and close
//
// If either old or new state is deleted, we also need to check prev_st
// for that state to account for merges, e.g.
// old_topic={st:OPEN}, new_topic={st:DELETED,prev_st:{st:CLOSED}} means
// that topic was first closed than deleted
//
// In some cases only prev_st may be changed, e.g.
// old_topic={st:DELETED,prev_st:{st:OPEN}}, new_topic={st:DELETED,prev_st:{st:CLOSED}},
// so we assume that user restored, closed, then deleted topic
//
// It is also possible that st, ste and prev_st are all the same,
// but del_reason is changed (so topic was restored then deleted with a different reason).
//
function get_status_actions(new_item, old_item = {}) {
  let old_st = { st: old_item.st, ste: old_item.ste };
  let new_st = { st: new_item.st, ste: new_item.ste };
  let old_is_deleted = false;
  let new_is_deleted = false;
  let result = [];

  if (has_status(old_st, itemStatuses.DELETED) || has_status(old_st, itemStatuses.DELETED_HARD)) {
    old_st = old_item.prev_st;
    old_is_deleted = true;
  }

  if (has_status(new_st, itemStatuses.DELETED) || has_status(new_st, itemStatuses.DELETED_HARD)) {
    new_st = new_item.prev_st;
    new_is_deleted = true;
  }

  if (!has_status(old_st, itemStatuses.CLOSED) && has_status(new_st, itemStatuses.CLOSED)) {
    result.push([ 'close' ]);
  }

  if (has_status(old_st, itemStatuses.CLOSED) && !has_status(new_st, itemStatuses.CLOSED)) {
    result.push([ 'open' ]);
  }

  if (old_is_deleted || new_is_deleted) {
    if (old_item.st !== new_item.st || old_item.del_reason !== new_item.del_reason || result.length > 0) {
      if (old_is_deleted) {
        result.unshift([ 'undelete' ]);
      }

      if (new_is_deleted) {
        /* eslint-disable max-depth */
        if (new_item.st === itemStatuses.DELETED_HARD) {
          result.push([ 'hard_delete', new_item.del_reason ]);
        } else {
          result.push([ 'delete', new_item.del_reason ]);
        }
      }
    }
  }

  return result;
}


function get_condition(post) {
  return post.is_new ? t('condition_new') : t('condition_used');
}

function get_delivery(post) {
  return post.delivery ? t('delivery_available') : t('delivery_not_available');
}

function get_price(post) {
  if (!post.price) return '';

  let { value, currency } = post.price;

  let symbol_real = N.runtime.t.exists('market.currencies.' + currency + '.sign') ?
                    N.runtime.t('market.currencies.' + currency + '.sign') :
                    currency;

  return price_format(value, symbol_real);
}


// Input: array of last post states (text, attachments, author, timestamp)
//
// Output: array of diff descriptions (user, timestamp, html diff)
//
function build_diff(history) {
  const { diff, diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];

  let initial_src = get_source(history[0].item);
  let text_diff = diff(initial_src, initial_src);
  let title_diff = diff_line(history[0].item.title, history[0].item.title);

  //
  // Detect changes in topic or post statuses squashed with first changeset
  // (e.g. topic deleted by author immediately after it's created)
  //
  let actions = [];

  actions = actions.concat(get_status_actions(history[0].item));

  let attr_diffs = [];

  attr_diffs.push([ 'price', get_price(history[0].item), get_price(history[0].item) ]);
  attr_diffs.push([ 'location', history[0].item.location ]);
  attr_diffs.push([ 'delivery', get_delivery(history[0].item), get_delivery(history[0].item) ]);
  attr_diffs.push([ 'barter_info', diff_line(history[0].item.barter_info, history[0].item.barter_info) ]);
  attr_diffs.push([ 'condition', get_condition(history[0].item), get_condition(history[0].item) ]);

  // Get first version for this post (no actual diff)
  result.push({
    user:       history[0].meta.user,
    ts:         history[0].meta.ts,
    role:       history[0].meta.role,
    text_diff,
    title_diff,
    actions,
    attr_diffs
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_revision = history[revision];
    let new_revision = history[revision + 1];
    let title_diff;

    if (old_revision.item.title !== new_revision.item.title) {
      title_diff = diff_line(old_revision.item.title, new_revision.item.title);
    }

    let old_src = get_source(old_revision.item);
    let new_src = get_source(new_revision.item);
    let text_diff;

    if (old_src !== new_src) {
      text_diff = diff(old_src, new_src);
    }

    let actions = [];

    if (old_revision.item.section !== new_revision.item.section) {
      actions.push([ 'move', old_revision.item.section, new_revision.item.section ]);
    }

    actions = actions.concat(get_status_actions(new_revision.item, old_revision.item));

    let attr_diffs = [];

    let old_price = get_price(old_revision.item);
    let new_price = get_price(new_revision.item);

    if (old_price !== new_price) {
      attr_diffs.push([ 'price', old_price, new_price ]);
    }

    if (JSON.stringify(old_revision.item.location) !== JSON.stringify(new_revision.item.location)) {
      // just display new value, no actual diff
      attr_diffs.push([ 'location', new_revision.item.location ]);
    }

    let old_delivery = get_delivery(old_revision.item);
    let new_delivery = get_delivery(new_revision.item);

    if (old_delivery !== new_delivery) {
      attr_diffs.push([ 'delivery', old_delivery, new_delivery ]);
    }

    if (old_revision.item.barter_info !== new_revision.item.barter_info) {
      attr_diffs.push([ 'barter_info', diff_line(old_revision.item.barter_info, new_revision.item.barter_info) ]);
    }

    let old_condition = get_condition(old_revision.item);
    let new_condition = get_condition(new_revision.item);

    if (old_condition !== new_condition) {
      attr_diffs.push([ 'condition', old_condition, new_condition ]);
    }

    result.push({
      user:       new_revision.meta.user,
      ts:         new_revision.meta.ts,
      role:       new_revision.meta.role,
      text_diff,
      title_diff,
      actions,
      attr_diffs
    });
  }

  return result;
}


// Init dialog
//
N.wire.on(module.apiPath, function show_item_history_dlg(params) {
  params.entries = build_diff(params.history);

  $dialog = $(N.runtime.render(module.apiPath, params));
  $('body').append($dialog);

  return new Promise(resolve => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;
        resolve();
      })
      .modal('show');
  });
});


// Close dialog on sudden page exit (if user click back button in browser)
//
N.wire.on('navigate.exit', function teardown_page() {
  if ($dialog) {
    $dialog.modal('hide');
  }
});
