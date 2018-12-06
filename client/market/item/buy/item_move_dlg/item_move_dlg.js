// Popup dialog to move items
//
// options:
//
// - section_hid_from
// - section_hid_to
//
'use strict';


const _ = require('lodash');


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_item_move_dlg(form) {
    form.$this.addClass('was-validated');

    form.$this.find('[name="section_hid"]')[0].setCustomValidity(form.fields.section_hid ? '' : 'invalid section');

    if (form.$this[0].checkValidity() === false) return;

    params.section_hid_to = +form.fields.section_hid;
    result = params;
    $dialog.modal('hide');
  });


  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    if ($dialog) {
      $dialog.modal('hide');
    }
  });
});


// Init dialog
//
N.wire.on(module.apiPath, function show_item_move_dlg(options) {
  params = options;

  return N.io.rpc('market.item.sections').then(res => {
    $dialog = $(N.runtime.render(module.apiPath, _.assign({ apiPath: module.apiPath }, params, res)));

    $('body').append($dialog);

    return new Promise((resolve, reject) => {
      $dialog
        .on('shown.bs.modal', () => {
          $dialog.find('.btn-secondary').focus();
        })
        .on('hidden.bs.modal', () => {
          // When dialog closes - remove it from body and free resources
          $dialog.remove();
          $dialog = null;
          params = null;

          if (result) resolve(result);
          else reject('CANCELED');

          result = null;
        })
        .modal('show');
    });
  });
});
