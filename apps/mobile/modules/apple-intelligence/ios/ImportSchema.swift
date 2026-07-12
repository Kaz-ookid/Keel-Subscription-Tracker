// The guided-generation schema: a Swift mirror of Keel's import format v1
// (ai-training/import-format.md). @Generable makes the on-device model's
// decoding CONSTRAINED — it physically cannot emit anything but this shape —
// which is the "grammar-constrained decoding" the import plan requires
// (PROJECT_BRIEF §6.1 Path C/D). Field names must match the format exactly:
// the JSON encoded from these structs goes straight into the app's existing
// parseImportDocument, which validates values and routes everything through
// the review screen. Keep validation THERE (core), not here.

import Foundation

#if canImport(FoundationModels)
  import FoundationModels

  @available(iOS 26.0, *)
  @Generable
  struct ImportCadence: Codable {
    @Guide(description: "One of: day, week, month, year")
    var unit: String
    @Guide(description: "Bill every N units; plain monthly or yearly is 1")
    var interval: Int
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportAnchor: Codable {
    @Guide(description: "Which week of the month, 1 to 5 where 5 means last")
    var week: Int
    @Guide(description: "Weekday 0 to 6 where 0 is Sunday")
    var weekday: Int
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportPriceChange: Codable {
    @Guide(description: "The new recurring price in main units, e.g. 17.6")
    var newAmount: Double
    @Guide(description: "The date the new price starts, YYYY-MM-DD")
    var on: String
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportedItem: Codable {
    @Guide(description: "subscription for anything recurring; split_payment for pay-in-X or BNPL")
    var type: String
    @Guide(description: "What the payment is for, in the user's own words and language")
    var name: String
    @Guide(description: "ISO code, one of EUR USD GBP CHF CAD AUD JPY")
    var currency: String
    @Guide(description: "automatic unless the user says they pay it themselves, then manual")
    var settlement: String
    @Guide(
      description:
        "Best-fit category id: streaming music gaming communications utilities education software insurance housing transport health finance news food memberships social shopping other"
    )
    var category: String
    var cadence: ImportCadence
    @Guide(description: "First charge or first instalment, YYYY-MM-DD")
    var firstDate: String
    @Guide(description: "The recurring price in main units; a free trial uses 0. Subscriptions only")
    var amount: Double?
    @Guide(description: "Known last charge date YYYY-MM-DD, subscriptions only")
    var endDate: String?
    @Guide(description: "Only for dates like 'first Thursday of the month'")
    var anchor: ImportAnchor?
    @Guide(description: "A future price change or a trial converting to a price")
    var priceChange: ImportPriceChange?
    @Guide(description: "Full purchase price in main units, split payments only")
    var total: Double?
    @Guide(description: "Number of payments, split payments only")
    var installments: Int?
    @Guide(
      description:
        "Split payments only, one of: paypal_pay_in_x klarna afterpay alma oney cb_nx other")
    var provider: String?
    @Guide(description: "The bank account name exactly as the user wrote it")
    var account: String?
    @Guide(description: "Bare brand website like netflix.com; omit when unsure, never guess")
    var domain: String?
    @Guide(
      description:
        "The brand's primary identity color as #RRGGBB for surely known brands; never black, white or near-black or near-white; omit when unsure"
    )
    var color: String?
    @Guide(description: "Anything that fits no field")
    var notes: String?
    @Guide(description: "Only when the user asks to be reminded: days before")
    var reminderDaysBefore: Int?
    @Guide(description: "Only true when the user says past payments were NOT made")
    var backlogUnpaid: Bool?
    @Guide(description: "Field names filled by assumption instead of read from the input")
    var assumed: [String]?
    @Guide(description: "Field names the input truly does not provide; always includes name when no real name was given")
    var uncertain: [String]?
  }

  @available(iOS 26.0, *)
  @Generable
  struct ImportedDocument: Codable {
    @Guide(description: "Every subscription or split payment found; empty if none")
    var items: [ImportedItem]
  }
#endif
