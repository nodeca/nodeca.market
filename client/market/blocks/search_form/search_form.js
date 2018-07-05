
'use strict';

const bag  = require('bagjs')({ prefix: 'nodeca' });


const OPTIONS_STORE_KEY = 'market_search_form_expanded';


// Toggle form options
//
N.wire.on(module.apiPath + ':search_options', function do_options() {
  return bag.get(OPTIONS_STORE_KEY).then(expanded => {
    expanded = !expanded;

    if (expanded) $('#market_search_options').collapse('show');
    else $('#market_search_options').collapse('hide');

    return bag.set(OPTIONS_STORE_KEY, expanded);
  });
});
