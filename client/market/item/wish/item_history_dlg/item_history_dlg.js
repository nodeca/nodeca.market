// Popup dialog to show post history
//
'use strict';


const _            = require('lodash');
const itemStatuses = '$$ JSON.stringify(N.models.market.ItemWish.statuses) $$';

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

  return result;
}


// Input: array of last post states (text, attachments, author, timestamp)
//
// Output: array of diff descriptions (user, timestamp, html diff)
//
function build_diff(meta, history) {
  const { diff, diff_line } = require('nodeca.core/client/vendor/diff/diff');

  let result = [];

  let initial_src = get_source(history[0]);
  let text_diff = diff(initial_src, initial_src);
  let title_diff = diff_line(history[0].title, history[0].title);
  let actions = [];
  let attr_diffs = [];

  let new_statuses = [
    history[0].st,
    history[0].ste,
    history[0].prev_st && history[0].prev_st.st,
    history[0].prev_st && history[0].prev_st.ste
  ].filter(st => !_.isNil(st));

  // item deleted immediately after creation
  if (new_statuses.includes(itemStatuses.DELETED) || new_statuses.includes(itemStatuses.DELETED_HARD)) {
    actions.push([ 'delete', history[0].del_reason ]);
  }

  // item closed immediately after creation
  if (new_statuses.includes(itemStatuses.CLOSED)) {
    actions.push([ 'close' ]);
  }

  attr_diffs.push([ 'location', history[0].location ]);

  // Get first version for this post (no actual diff)
  result.push({
    user:       meta[0].user,
    ts:         meta[0].ts,
    role:       meta[0].role,
    text_diff,
    title_diff,
    actions,
    attr_diffs
  });

  for (let revision = 0; revision < history.length - 1; revision++) {
    let old_post = history[revision];
    let new_post = history[revision + 1];
    let title_diff;

    if (typeof old_post.title !== 'undefined' || typeof new_post.title !== 'undefined') {
      if (old_post.title !== new_post.title) {
        title_diff = diff_line(old_post.title, new_post.title);
      }
    }

    let old_src = get_source(old_post);
    let new_src = get_source(new_post);
    let text_diff;

    if (old_src !== new_src) {
      text_diff = diff(old_src, new_src);
    }

    let actions = [];
    let attr_diffs = [];

    if (old_post.section !== new_post.section) {
      actions.push([ 'move', old_post.section, new_post.section ]);
    }

    let old_statuses = [
      old_post.st,
      old_post.ste,
      old_post.prev_st && old_post.prev_st.st,
      old_post.prev_st && old_post.prev_st.ste
    ].filter(st => !_.isNil(st));

    let new_statuses = [
      new_post.st,
      new_post.ste,
      new_post.prev_st && new_post.prev_st.st,
      new_post.prev_st && new_post.prev_st.ste
    ].filter(st => !_.isNil(st));

    // guess action based on status change
    /* eslint-disable max-depth */
    if (!_.isEqual(old_statuses, new_statuses)) {
      // item deleted
      if (!old_statuses.includes(itemStatuses.DELETED) && !old_statuses.includes(itemStatuses.DELETED_HARD)) {
        if (new_statuses.includes(itemStatuses.DELETED) || new_statuses.includes(itemStatuses.DELETED_HARD)) {
          actions.push([ 'delete', new_post.del_reason ]);
        }
      }

      // item undeleted
      if (old_statuses.includes(itemStatuses.DELETED) || old_statuses.includes(itemStatuses.DELETED_HARD)) {
        if (!new_statuses.includes(itemStatuses.DELETED) && !new_statuses.includes(itemStatuses.DELETED_HARD)) {
          actions.push([ 'undelete' ]);
        }
      }

      // item closed
      if (!old_statuses.includes(itemStatuses.CLOSED)) {
        if (new_statuses.includes(itemStatuses.CLOSED)) {
          actions.push([ 'close' ]);
        }
      }

      // item opened
      if (old_statuses.includes(itemStatuses.CLOSED)) {
        if (!new_statuses.includes(itemStatuses.CLOSED)) {
          actions.push([ 'open' ]);
        }
      }
    }

    if (JSON.stringify(old_post.location) !== JSON.stringify(new_post.location)) {
      // just display new value, no actual diff
      attr_diffs.push([ 'location', new_post.location ]);
    }

    result.push({
      user:       meta[revision + 1].user,
      ts:         meta[revision + 1].ts,
      role:       meta[revision + 1].role,
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
N.wire.on(module.apiPath, function show_post_history_dlg(params) {
  params.entries = build_diff(params.history_meta, params.history_data);

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
