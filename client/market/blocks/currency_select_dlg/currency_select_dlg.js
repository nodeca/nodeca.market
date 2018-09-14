// Popup dialog to select default currency
//
// options:
//
//  - currency (will be updated after OK click)
//
'use strict';


let $dialog;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Select subscription type
  //
  N.wire.on(module.apiPath + ':select', function select_type_subscription_dlg(data) {
    return N.io.rpc('market.currency_select', { currency: data.$this.data('currency') })
               .then(() => { $dialog.modal('hide'); })
               .then(() => N.wire.emit('navigate.reload'));
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
N.wire.on(module.apiPath, function show_currency_dlg(data) {
  $dialog = $(N.runtime.render(module.apiPath, { apiPath: module.apiPath, currency: data.$this.data('currency') }));
  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;

        if (result) resolve(result);
        else reject('CANCELED');

        result = null;
      })
      .modal('show');
  });
});
