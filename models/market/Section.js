'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const memoize  = require('promise-memoize');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('MARKET_SECTION', 12);

  let cache = {
    offer_count:   { type: Number, 'default': 0 },
    request_count: { type: Number, 'default': 0 }
  };

  let Section = new Schema({
    title:            String,
    display_order:    Number,

    // user-friendly id (autoincremented)
    hid:              { type: Number, index: true },

    // parent section
    parent:           Schema.ObjectId,

    // links to other sections
    links:            [ Schema.ObjectId ],

    // Options
    is_category:      { type: Boolean, 'default': false },

    // Cache
    cache,
    cache_hb:         cache
  }, {
    versionKey : false
  });


  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // build section tree structure in `getSectionTree` (see below)
  Section.index({
    display_order: 1,
    _id: -1
  });


  // Hooks
  /////////////////////////////////////////////////////////////////////////////

  // Remove empty "parent" field
  //
  Section.pre('save', function () {
    /*eslint-disable no-undefined*/
    if (this.parent === null) this.parent = undefined;
  });

  // Set 'hid' for the new section.
  // This hook should always be the last one to avoid counter increment on error
  Section.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this section was created, used in vbconvert;
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('market_section');
  });

  N.wire.on('init:models', function emit_init_Section() {
    return N.wire.emit('init:models.' + collectionName, Section);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Section(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });


  // Get sections tree, returns hash of nested trees for sections. Structure:
  //
  // _id:
  //   - _id - section `_id`
  //   - parent - link to parent section object
  //   - children[ { _id, parent, children[...] } ]
  //   - linked[ { _id, parent, children[...] } ]
  //
  let getSectionsTree = memoize(() =>
    N.models.market.Section
        .find()
        .sort('display_order')
        .select('_id parent links')
        .lean(true)
        .exec()
        .then(sections => {

          // create hash of trees for each section
          let result = sections.reduce((acc, s) => {
            acc[s._id] = Object.assign({ children: [], linked: [] }, s);
            return acc;
          }, {});

          // root is a special fake `section` that contains array of the root-level sections
          let root = { children: [], linked: [] };

          Object.values(result).forEach(s => {
            s.parent = s.parent ? result[s.parent] : root;
            s.parent.children.push(s);
          });

          Object.values(result).forEach(s => {
            s.linked = s.links.map(ss => result[ss]).filter(Boolean);
          });

          result.root = root;

          return result;
        }),
    { maxAge: 60000 }
  );


  // Returns list of parent _id-s for given section `_id`
  //
  Section.statics.getParentList = function (sectionID) {
    return getSectionsTree().then(sections => {
      let parentList = [];
      let current = sections[sectionID].parent;

      while (current && current._id) {
        parentList.unshift(current._id);
        current = current.parent;
      }

      return parentList;
    });
  };


  // Returns list of child sections, including subsections until the given deepness.
  // Also, sets `level` property for found sections
  //
  // - getChildren((section, deepness)
  // - getChildren(deepness) - for root (on index page)
  // - getChildren() - for all
  //
  // result:
  //
  // - [ {_id, parent, children, level} ]
  //
  Section.statics.getChildren = function (sectionID, deepness) {

    if (arguments.length === 1) {
      deepness = sectionID;
      sectionID = null;
    }

    let children = [];

    function fillChildren(section, curDeepness, maxDeepness) {

      if (maxDeepness >= 0 && curDeepness >= maxDeepness) {
        return;
      }

      section.children.forEach(childSection => {
        children.push(Object.assign({ level: curDeepness }, childSection));
        fillChildren(childSection, curDeepness + 1, maxDeepness);
      });

      // add linked sections, but don't resolve their children to prevent loops
      section.linked.forEach(linkedSection => {
        children.push(Object.assign({ level: curDeepness }, linkedSection, { is_linked: true }));
      });
    }

    return getSectionsTree().then(sections => {
      let storedSection = sections[sectionID || 'root'];

      fillChildren(storedSection, 0, deepness);
      return children;
    });
  };

  // Provide a possibility to clear section tree cache (used in seeds)
  //
  Section.statics.getChildren.clear = () => getSectionsTree.clear();

  // Recalculate section cache
  //
  Section.statics.updateCache = function (sectionID) {
    N.queue.market_section_item_count_update(sectionID).postpone();
  };
};
