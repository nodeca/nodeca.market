'use strict';

exports.root = __dirname;
exports.name = 'nodeca.market';
exports.init = function (N) { require('./lib/autoload.js')(N); };
