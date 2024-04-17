/**
 * Just some examples of what might be possible with some kind of Mql class.
 */

let mql = new zx.Mql();
await mql.createTemporary("#categories", "uk.co.spar.app.stock.Categories", async $ => {
  let document = $.findOne("uk.co.spar.app.stock.Category", { _uuid: "1234" });
  row.level = 1;
  $.insert(document);
  let lastLevel = 1;
  while ($.lastInsertCount > 0) {
    let $categories = $.aggregate();
    $categories.match({ level: lastLevel });
    $categories.unwind("$categories");
    $categories.lookupFirst("categories.uuid", "uk.co.spar.app.stock.Category.uuid", "subCategory", { required: true });
    let category;
    for (let cursor = await $categories.execute(); (category = await cursor.next()); lastLevel++) {
      category.subCategory.level = lastLevel;
      $.insert(category.subCategory);
    }
  }
});

/**
 * `.createTemporary` will create a temporary collection with the given name; the name
 * *must* start with a #, and the actual name in mongo will be guaranteed to be unique, based
 * on this name - eg "temporary.categories_abc123".
 *
 * The second argument is the name of the collection to query when creating this temporary
 * table, and the third argument is a callback function that will be called with a new
 * `zx.Mql`-derived object.  Note that the `$` is a class *derived* from `zx.Mql`, because
 * it adds methods that are only appropriate to building temporary tables (eg
 * `zx.mql.MqlTemporaryCollection`)
 *
 * The `$` is not the same instance of `zx.Mql` as the one that created the temporary table,
 * and the temporary table will be dropped when the original `zx.Mql` instance is disposed
 * of.
 *
 */
await mql.createTemporary("#categories", "uk.co.spar.app.stock.Categories", async $ => {
  /**
   * `.recurseTree` will start with the given document, which it will insert into the temporary
   * collection; it will then repeatedly query the temporary table, looking for documents that have
   * just been inserted and connect them to the collection in the first parameter.
   *
   * Each pass of inserting will include a property `_depth` which is the integer depth of the
   * recursion, ie the pass number.  The recursion uses this pass number to determine which
   * documents to connect to when finding the next set of documents; when no documents are
   * found then the recursion is complete.
   */
  $.recurseTree("uk.co.spar.app.stock.Category", $ => {
    $.startWith({ _uuid: "1234" });
    $.unwind("categories");
    $.connectBy("categories._uuid", "uk.co.spar.app.stock.Category._uuid");
  });
});

await mql.createTemporary("#vatCodes", "uk.co.spar.app.stock.VatCode", async $ => {
  /**
   * `.addField` will add a new field to the documents in the temporary table; the
   * first parameter is the name of the field to add, and the second parameter is
   * where to get the value from.  The third is a callback that is passed an instance
   * of `zx.mql.AddField` that can be used to add further conditions.
   *
   * The `.between` method will add a condition that a value must be between two
   * values
   */
  $.addField("currentVatRate", "$ratesHistory", $addField => {
    $.addField.between(new Date(), "$effFrom", "$effTo");
  });

  // Guess what this does :)
  $.removeField("ratesHistory");
});

await mql.createTemporary("#lines", "uk.co.spar.app.stock.Line", async $ => {
  /**
   * `.lookupFirst` will do a lookup, and then select the first document that matches,
   * and is obviously based on the `$lookup` operator in mongo.
   *
   * The last parameter is optional settings, and the `required` setting will
   * add a condition that the lookup must find a document.
   */
  $.lookupFirst("category._uuid", "#categories._uuid", "category", { required: true });
  $.lookupFirst("cu._uuid", "uk.co.spar.app.stock.ConsumerUnit._uuid", "cu", { required: true });
  $.match($match => {
    $match.isNull("invoiceSuspended");
  });
  $.addField("standardPrice", "$prices", $addField => {
    $addField.match({ priceType: "standardFixedPrice" });
    $addField.between(new Date(), "$effFrom", "$effTo");
  });
  $.addField("promoPrice", "$prices", $addField => {
    $addField.match({ priceType: "promotionalFixedPrice" });
    $addField.between(new Date(), "$effFrom", "$effTo");
  });
  $.addField("priceInfo", $addField => {
    $addField.ifNull("$promoPrice", "$standardPrice");
  });
  $.isNotNull("priceInfo");
  $.addField("consumerVat", "$cu.consumerVat", $addField => {
    $addField.between(new Date(), "$effFrom", "$effTo");
  });
  $.lookupFirst("consumerVat.vatCode", "#vatCodes.vatCode", "consumerVat.vatCode");
});

/**
 * Having built the temporary collections, we can now do something with them; in this case,
 * we're going to aggregate the lines, connect them to their supplier, and then sort them by
 * `lineCode`.
 */
let cursor = mql.aggregate("#lines", $ => {
  $.lookupFirst("supplier._uuid", "uk.co.spar.app.business.Business._uuid", "supplier", { required: true });
  $.sort("lineCode");
});

let row;
while ((row = await cursor.next())) {
  console.log(row);
}

/**
 * When we're done, we can dispose of the `zx.Mql` instance and this will also dispose
 * the temporary collections.
 */
mql.dispose();
