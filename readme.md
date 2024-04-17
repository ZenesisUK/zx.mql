# zx.mql

Just sketching out some ideas for a MongoDB Query Language

See also the `sample.js` file, which has some ideas for the class objects that would back
the query language; the class objects should be usable and be the first phase of development,
forming a basis for the design of the query language as well as the implementation of
the parsed DSL

https://tomassetti.me/parsing-in-javascript/

Parser: https://nearley.js.org/docs/getting-started

declare default or dev-only values for positional parameters
declare language version

```
  match
    period._uuid = "3e27dd8f-9f55-4bd6-a7dd-8f9f552bd630";
  sort invoiceDate asc;
  set
    exVat = (double)$invoiceTotal,
    vat = (double)$vat,
    incVat = (double)($exVat + $vat);
  lookup first
    batch._uuid in uk.co.spar.app.accounts.PaymentBatch._uuid
    as batch;
  group by
      $period._uuid as period,
      $supplier._uuid as supplier,
      $rdc._uuid as rdc,
      $depot._uuid as depot
    accumulate
      depotInvoices
        $invoiceDate as invoiceDate,
        $invoiceNumber as invoiceNumber,
        $batch.number as batchNumber,
        $exVat as exVat,
        $incVat as incVat,
        $vat as vat,
        $batch.type as batchType;
  group by
      $_id.period as period,
      $_id.supplier as supplier,
      $_id.rdc as rdc
    accumulate
      depotsInfos
        $_id.depot as depotUuid,
        $depotInvoices as depotInvoices;
  lookup first
    _id.rdc in uk.co.spar.app.business.Business._uuid
    as rdc;
  sort rdc.rdc.abbrev3a;
  group by
      $_id_.period as period,
      $_id.supplier as supplier
    accumulate
      rdcInfos
        $rdc.rdc.abbrev3a as rdcAbbrev3a,
        $rdc.rdc.depots as depotList,
        $depotsInfos as depotsInfos;
  lookup first
    _id.supplier in uk.co.spar.app.business.Business._uuid
    as supplier;
  set if $supplier is null
    supplier = {
      "title": "Supplier not found",
      "alias": "err"
    };
  sort supplier.title;
  group by $_id.period
    accumulate
      supplierInfos
        $supplier.title as supplierName,
        $supplier.alias as supplierAlias,
        $supplier.address as supplierAddress,
        $supplier.tradeSupplier.financial as supplierFinancial,
        $rdcsInfos as rdcsInfos;
  lookup first
    _id in uk.co.spar.app.accounts.PaymentPeriod._uuid
    as period;
  lookup first
    period.term._uuid in uk.co.spar.app.accounts.PaymentTerm._uuid
    as term;
```

```
  match
    period._uuid = "ae1b8c26-0b09-4705-9b8c-260b09f705ab";
  unwind lines with arrayIndex linesIndex;
  addFields
    invoiceLine = $lines;
  unset lines;
  lookup first
    batch._uuid in uk.co.spar.app.accounts.PaymentBatch._uuid
    as batch
    project _uuid, type;
  match
    batch.type in [ "webInvoices", "productRelatedRdcCreditNotes", "productRelatedRdcDebitNotes", "invoice", "productRelatedCoDebitNotes",
      "productRelatedCoCreditNotes", "statsOnlyInvoices", "statsOnlyCreditNotes", "ediInvoice", "sageManualInvoice",
      "sageManualCreditNote", "nonProductRelatedRdcCreditNotes", "nonProductRelatedRdcDebitNotes", "buyingPartnerRecharging"
    ];
  lookup first
    supplier._uuid in uk.co.spar.app.business.Business._uuid
    as supplier
    project _uuid, title, tradeSupplier.levies;
  lookup first
    rdc._uuid in uk.co.spar.app.business.Business._uuid
    as rdc
    project _uuid, title, rdc;
  match
    rdc.rdc.active == true && rdc.rdc.rdcType == "rdc";
  lookup first
    invoiceLine.line._uuid in uk.co.spar.app.stock.Line
    as invoiceLine.line;
  set checkDate = orderDate != null ? orderDate : invoiceDate;
  addFields
    set invoiceLine.line.prices =
      first
        filter $invoiceLine.line.prices
          cond checkDate between $$this.effFrom and $$this.effTo;
  match
    invoiceLine.line.prices.ownBrandLevy == true &&
    supplier.tradeSupplier.levies.autoCollectOwnBrandLevy == true
  addFields
    set supplier.tradeSupplier.levies.ownBrandLevies =
      reduce $supplier.tradeSupplier.levies.ownBrandLevies
        initialValue
          effFrom = ISODate("1970-01-01T00:00:00Z")
        cond $checkDate between $$this.effFrom and $$this.effTo
          then $$this
          else $$value;
  addFields
    set supplier.tradeSupplier.levies.ownBrandLevies.rate
      cond $invoiceLine.line.prices.ownBrandLevyRate >= 0
        then $invoiceLine.line.prices.ownBrandLevyRate
        else $supplier.tradeSupplier.levies.ownBrandLevies.rate;
  match
    supplier.tradeSupplier.levies.ownBrandLevies.rate != null &&
    supplier.tradeSupplier.levies.ownBrandLevies.rate > 0;
  addFields
    invoiceLine.total = $invoiceLine.total - $invoiceLine.vat;
  addFields
    invoiceLineCharge = {
        invoiceId = $_uuid,
        invoiceLineIndex = $linesIdx,
        levyRate = $supplier.tradeSupplier.levies.ownBrandLevies.rate,
        unitCost = $invoiceLine.priceEach,
        vat = $invoiceLine.vat,
        vatRate = $invoiceLine.vatRate,
        quantity = $invoiceLine.quantity,
        levyableValue = $invoiceLine.total,
        levyAmount = $invoiceLine.total * $supplier.tradeSupplier.levies.ownBrandLevies.rate;
  group by
      $supplier._uuid as supplier,
      $rdc._uuid as rdc
    accumulate
      invoiceLineCharge as $invoiceLineCharge,
      supplier as first $supplier;
  project
    0 as _id,
    $_id.supplier supplierId,
    $_id.rdc as rdcId,
    $invoiceLineCharge as charges,
    sum($invoiceLineCharge.levyableValue) as levyableValue,
    sum($invoiceLineCharge.levyAmount) as levyAmount,
    $supplier.tradeSupplier.levies.collectionType as levyCollectionType;


```

```
create temporary categories
```
