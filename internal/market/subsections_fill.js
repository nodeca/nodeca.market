// Fill subsections data in response for market.index & market.section
//
'use strict';


const _                = require('lodash');
const sanitize_section = require('nodeca.market/lib/sanitizers/section');


////////////////////////////////////////////////////////////////////////////////


module.exports = function (N, apiPath) {


  /*
   *  to_tree(source[, root = null]) -> array
   *  - source (array): array of sections
   *  - root (mongodb.BSONPure.ObjectID|String): root section _id or null
   *
   *  Build sections tree (nested) from flat sorted array.
   */
  function to_tree(source, root) {
    let result = [];
    let nodes = {};

    source.forEach(node => {
      node.child_list = [];
      nodes[node._id] = node;
    });

    root = root ? root.toString() : null;

    // set children links for all nodes
    // and collect root children to result array
    source.forEach(node => {
      if (node.is_linked) return;

      node.parent = node.parent ? node.parent.toString() : null;

      if (node.parent === root) {
        result.push(node);

      } else if (node.parent !== null) {
        // Parent can be missed, if invisible. Check it, prior to add childs.
        if (nodes[node.parent]) {
          nodes[node.parent].child_list.push(node);
        }
      }
    });

    // add linked sections for all nodes
    source.forEach(node => {
      if (!node.links) return;

      for (let link of node.links) {
        let linked_node = nodes[link];
        if (!linked_node) continue;

        linked_node = Object.assign({}, linked_node);
        linked_node.child_list = [];
        linked_node.is_linked = true;
        node.child_list.push(linked_node);
      }
    });

    // add linked sections for root node
    if (root) {
      for (let linked_node of source) {
        if (!linked_node.is_linked || linked_node.level !== 0) continue;
        linked_node = Object.assign({}, linked_node);
        linked_node.child_list = [];
        linked_node.is_linked = true;
        result.push(linked_node);
      }
    }

    return result;
  }

  //////////////////////////////////////////////////////////////////////////////


  // Get subsections tree in flat style (id, level)
  //
  N.wire.before(apiPath, async function fetch_subsections_tree_info(env) {
    let subsections = await N.models.market.Section.getChildren({
      section:     env.data.section?._id,
      deepness:    env.data.section ? 1 : 2,
      offers:      env.data.section_item_type === 'offers',
      wishes:      env.data.section_item_type === 'wishes'
    });

    env.data.subsections_info = subsections;
  });


  // Fetch sections data and add `level` property
  //
  N.wire.on(apiPath, async function subsections_fetch_visible(env) {
    let _ids = env.data.subsections_info.map(s => s._id);
    env.data.subsections = [];

    let sections = await N.models.market.Section.find()
                             .where('_id').in(_.uniq(_ids.map(String)))
                             .lean(true);

    sections = await sanitize_section(N, sections, env.user_info);

    // sort result in the same order as ids
    env.data.subsections_info.forEach(subsectionInfo => {
      let foundSection = _.find(sections, s => s._id.equals(subsectionInfo._id));

      if (!foundSection) return; // continue

      foundSection = Object.assign({}, foundSection);

      if (subsectionInfo.is_linked) {
        foundSection.is_linked = true;
      }

      foundSection.level = subsectionInfo.level;
      env.data.subsections.push(foundSection);
    });
  });


  // Sanitize subsections
  //
  N.wire.after(apiPath, async function subsections_sanitize(env) {
    env.data.subsections = await sanitize_section(N, env.data.subsections, env.user_info);
  });


  // Build response tree
  //
  N.wire.after(apiPath, function subsections_fill_response(env) {
    let root = env.data.section?._id;
    env.res.subsections = to_tree(env.data.subsections, root);
  });
};
